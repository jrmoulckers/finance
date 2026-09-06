# SPDX-License-Identifier: BUSL-1.1

param(
    [Parameter(Mandatory = $true)]
    [string]$Container
)

$ErrorActionPreference = 'Stop'

function Invoke-LocalPsql {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $Sql | docker exec -i $Container psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) {
        throw 'psql failed in the isolated concurrency database'
    }
}

function Wait-ConcurrentJobs {
    param([Parameter(Mandatory = $true)][System.Management.Automation.Job[]]$Jobs)

    $Jobs | Wait-Job | Out-Null
    foreach ($job in $Jobs) {
        Receive-Job -Job $job
        if ($job.State -ne 'Completed') {
            throw "Concurrent database session failed: $($job.ChildJobs[0].JobStateInfo.Reason)"
        }
    }
    $Jobs | Remove-Job
}

function Start-AdvisoryGate {
    param([Parameter(Mandatory = $true)][long]$Key)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'docker'
    foreach ($argument in @(
            'exec', '-i', $Container, 'psql', '-U', 'supabase_admin',
            '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t'
        )) {
        [void]$startInfo.ArgumentList.Add($argument)
    }
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.StandardInput.WriteLine(
        "SELECT pg_advisory_lock($Key); SELECT 'GATE_READY';"
    )
    $process.StandardInput.Flush()

    do {
        $line = $process.StandardOutput.ReadLine()
        if ($null -eq $line -and $process.HasExited) {
            throw "Advisory gate failed: $($process.StandardError.ReadToEnd())"
        }
    } until ($line -eq 'GATE_READY')

    return ,$process
}

function Stop-AdvisoryGate {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][long]$Key
    )

    $Process.StandardInput.WriteLine("SELECT pg_advisory_unlock($Key);")
    $Process.StandardInput.WriteLine('\q')
    $Process.StandardInput.Close()
    if (-not $Process.WaitForExit(5000)) {
        throw "Advisory gate $Key did not close"
    }
    if ($Process.ExitCode -ne 0) {
        throw "Advisory gate failed: $($Process.StandardError.ReadToEnd())"
    }
}

function Wait-ForDatabaseWait {
    param(
        [Parameter(Mandatory = $true)][string]$ApplicationName,
        [Parameter(Mandatory = $true)][string]$WaitEvent,
        [int]$TimeoutMilliseconds = 8000
    )

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $state = docker exec $Container psql -U supabase_admin -d postgres `
            -q -A -t -c @"
SELECT concat_ws('|', state, wait_event_type, wait_event)
FROM pg_stat_activity
WHERE application_name = '$ApplicationName';
"@
        if ($LASTEXITCODE -ne 0) {
            throw "Could not inspect pg_stat_activity for $ApplicationName"
        }
        if ($state -match "^active\|Lock\|$WaitEvent$") {
            return
        }
        Start-Sleep -Milliseconds 50
    } while ($stopwatch.ElapsedMilliseconds -lt $TimeoutMilliseconds)

    throw "Session $ApplicationName did not reach Lock/$WaitEvent; last state: $state"
}

$run = [guid]::NewGuid().ToString('N')
$user1 = [guid]::NewGuid()
$user2 = [guid]::NewGuid()
$user3 = [guid]::NewGuid()
$account1 = [guid]::NewGuid()
$account2 = [guid]::NewGuid()
$account3 = [guid]::NewGuid()
$identity1 = [guid]::NewGuid()
$identity2 = [guid]::NewGuid()
$identity3 = [guid]::NewGuid()
$sharedHousehold = [guid]::NewGuid()
$raceHousehold = [guid]::NewGuid()
$newHousehold = [guid]::NewGuid()
$membership1 = [guid]::NewGuid()
$membership2 = [guid]::NewGuid()
$membership3 = [guid]::NewGuid()
$membership4 = [guid]::NewGuid()
$gateKey = [long](Get-Random -Minimum 100000000 -Maximum 2000000000)

# This test intentionally commits fixtures and therefore requires a disposable,
# non-production PostgreSQL container with all migrations already applied.
Invoke-LocalPsql @"
INSERT INTO users (id, email, display_name) VALUES
    ('$user1', 'concurrency-$run-1@example.invalid', 'Concurrency One'),
    ('$user2', 'concurrency-$run-2@example.invalid', 'Concurrency Two'),
    ('$user3', 'concurrency-$run-3@example.invalid', 'Concurrency Three');
INSERT INTO billing_accounts (id, owner_id) VALUES
    ('$account1', '$user1'),
    ('$account2', '$user2'),
    ('$account3', '$user3');
INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
) VALUES
    ('$identity1', '$account1', 'stripe', 'sandbox', 'cus_${run}_1', true),
    ('$identity2', '$account2', 'stripe', 'sandbox', 'cus_${run}_2', true),
    ('$identity3', '$account3', 'stripe', 'sandbox', 'cus_${run}_3', true);

SELECT record_billing_provider_event(
    '$account1', '$identity1', 'stripe', 'sandbox',
    'evt_${run}_purchase_a', 'sub_${run}_purchase_a', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'plus', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
);
SELECT record_billing_provider_event(
    '$account1', '$identity1', 'stripe', 'sandbox',
    'evt_${run}_purchase_b', 'sub_${run}_purchase_b', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'plus', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
);
"@

$applyScript = {
    param($ContainerName, $EventId, $ApplicationName, $GateKey)
    $gateSql = if ($GateKey -ne 0) {
        "SELECT pg_advisory_xact_lock($GateKey);"
    } else {
        ''
    }
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
SELECT apply_billing_provider_event(
    (SELECT id FROM billing_provider_events WHERE provider_event_id = '$EventId')
);
$gateSql
COMMIT;
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Concurrent apply failed for $EventId"
    }
}

# Different purchases on one account serialize on the account row before their
# distinct purchase locks. Observe the second apply waiting on the account row
# held by the first before explicitly opening the first session's gate.
$applyGateKey = $gateKey++
$applyGate = Start-AdvisoryGate -Key $applyGateKey
$apply1Application = "billing_apply_1_$run"
$apply2Application = "billing_apply_2_$run"
$apply1Job = Start-Job -ScriptBlock $applyScript `
    -ArgumentList $Container, "evt_${run}_purchase_a", $apply1Application, $applyGateKey
Wait-ForDatabaseWait -ApplicationName $apply1Application -WaitEvent 'advisory'
$apply2Job = Start-Job -ScriptBlock $applyScript `
    -ArgumentList $Container, "evt_${run}_purchase_b", $apply2Application, 0
Wait-ForDatabaseWait -ApplicationName $apply2Application -WaitEvent '(transactionid|tuple)'
Stop-AdvisoryGate -Process $applyGate -Key $applyGateKey
Wait-ConcurrentJobs -Jobs @($apply1Job, $apply2Job)

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF (
        SELECT count(*) <> 2
        FROM billing_subscriptions
        WHERE billing_account_id = '$account1'
          AND provider_subscription_id IN (
              'sub_${run}_purchase_a',
              'sub_${run}_purchase_b'
          )
    ) THEN
        RAISE EXCEPTION 'different-purchase concurrent apply lost a subscription';
    END IF;
END;
`$`$;

SELECT record_billing_provider_event(
    '$account1', '$identity1', 'stripe', 'sandbox',
    'evt_${run}_purchase_c', 'sub_${run}_purchase_c', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'plus', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
);
"@

$rebuildScript = {
    param($ContainerName, $AccountId, $ApplicationName, $GateKey)
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
SELECT rebuild_billing_entitlements('$AccountId');
SELECT pg_advisory_xact_lock($GateKey);
COMMIT;
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw 'Concurrent rebuild failed'
    }
}

# Hold the account lock in rebuild, then apply another purchase concurrently.
$rebuildGateKey = $gateKey++
$rebuildGate = Start-AdvisoryGate -Key $rebuildGateKey
$rebuildApplication = "billing_rebuild_$run"
$applyDuringRebuildApplication = "billing_apply_rebuild_$run"
$rebuildJob = Start-Job -ScriptBlock $rebuildScript `
    -ArgumentList $Container, $account1, $rebuildApplication, $rebuildGateKey
Wait-ForDatabaseWait -ApplicationName $rebuildApplication -WaitEvent 'advisory'
$applyJob = Start-Job -ScriptBlock $applyScript `
    -ArgumentList $Container, "evt_${run}_purchase_c", $applyDuringRebuildApplication, 0
Wait-ForDatabaseWait -ApplicationName $applyDuringRebuildApplication `
    -WaitEvent '(transactionid|tuple)'
Stop-AdvisoryGate -Process $rebuildGate -Key $rebuildGateKey
Wait-ConcurrentJobs -Jobs @($rebuildJob, $applyJob)

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM billing_subscriptions
        WHERE billing_account_id = '$account1'
          AND provider_subscription_id = 'sub_${run}_purchase_c'
    ) THEN
        RAISE EXCEPTION 'concurrent rebuild/apply failed to materialize purchase';
    END IF;
END;
`$`$;
"@

$recordScript = {
    param(
        $ContainerName,
        $AccountId,
        $IdentityId,
        $EventId,
        $SubscriptionId,
        $ApplicationName
    )
    $sql = @"
SET statement_timeout = '8s';
SET lock_timeout = '5s';
SET application_name = '$ApplicationName';
SELECT record_billing_provider_event(
    '$AccountId', '$IdentityId', 'stripe', 'sandbox',
    '$EventId', '$SubscriptionId', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'plus', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
);
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Concurrent record failed for $EventId"
    }
}

$sharedPurchase = "sub_${run}_shared"
$sharedPurchaseLockKey = [long](docker exec $Container psql -U supabase_admin `
    -d postgres -q -A -t -c @"
SELECT billing_purchase_lock_key(
    'stripe',
    'sandbox',
    '$sharedPurchase',
    NULL
);
"@)
if ($LASTEXITCODE -ne 0) {
    throw 'Could not calculate the shared provider-purchase lock key'
}
$bindingGate = Start-AdvisoryGate -Key $sharedPurchaseLockKey
$record2Application = "billing_record_2_$run"
$record3Application = "billing_record_3_$run"
$jobs = @(
    Start-Job -ScriptBlock $recordScript `
        -ArgumentList $Container, $account2, $identity2, "evt_${run}_shared_2", $sharedPurchase, $record2Application
    Start-Job -ScriptBlock $recordScript `
        -ArgumentList $Container, $account3, $identity3, "evt_${run}_shared_3", $sharedPurchase, $record3Application
)
Wait-ForDatabaseWait -ApplicationName $record2Application -WaitEvent 'advisory'
Wait-ForDatabaseWait -ApplicationName $record3Application -WaitEvent 'advisory'
Stop-AdvisoryGate -Process $bindingGate -Key $sharedPurchaseLockKey
Wait-ConcurrentJobs -Jobs $jobs

Invoke-LocalPsql @"
SELECT rebuild_billing_entitlements(NULL);
DO `$`$
BEGIN
    IF (
        SELECT count(*) <> 1
        FROM billing_provider_purchase_bindings
        WHERE provider = 'stripe'
          AND environment = 'sandbox'
          AND provider_subscription_id = '$sharedPurchase'
          AND provider_subscription_item_id IS NULL
    ) OR (
        SELECT count(*) <> 1
        FROM billing_provider_events
        WHERE provider_event_id IN (
            'evt_${run}_shared_2',
            'evt_${run}_shared_3'
        )
          AND processing_status = 'rejected'
    ) OR (
        SELECT count(*) <> 1
        FROM billing_subscriptions
        WHERE provider = 'stripe'
          AND environment = 'sandbox'
          AND provider_subscription_id = '$sharedPurchase'
          AND provider_subscription_item_id IS NULL
    ) THEN
        RAISE EXCEPTION 'concurrent cross-account purchase binding was not deterministic';
    END IF;
END;
`$`$;
"@

Invoke-LocalPsql @"
INSERT INTO households (id, name, created_by) VALUES
    ('$sharedHousehold', 'Concurrent shared household $run', '$user1'),
    ('$raceHousehold', 'Concurrent membership household $run', '$user3'),
    ('$newHousehold', 'Concurrent replacement household $run', '$user3');
INSERT INTO household_members (id, household_id, user_id, role) VALUES
    ('$membership1', '$sharedHousehold', '$user1', 'owner'),
    ('$membership2', '$sharedHousehold', '$user2', 'member'),
    ('$membership3', '$raceHousehold', '$user3', 'owner'),
    ('$membership4', '$newHousehold', '$user3', 'owner');

SELECT apply_billing_provider_event(record_billing_provider_event(
    '$account1', '$identity1', 'stripe', 'sandbox',
    'evt_${run}_premium_1', 'sub_${run}_premium_1', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'premium', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
));
SELECT apply_billing_provider_event(record_billing_provider_event(
    '$account2', '$identity2', 'stripe', 'sandbox',
    'evt_${run}_premium_2', 'sub_${run}_premium_2', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'premium', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
));
SELECT apply_billing_provider_event(record_billing_provider_event(
    '$account3', '$identity3', 'stripe', 'sandbox',
    'evt_${run}_premium_3', 'sub_${run}_premium_3', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'premium', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
));

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$user1', true);
SELECT set_my_premium_household_sponsorship('$sharedHousehold');
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$user2', true);
SELECT set_my_premium_household_sponsorship('$sharedHousehold');
COMMIT;
"@

$readEntitlementsScript = {
    param($ContainerName, $UserId, $HouseholdId, $ApplicationName, $GateKey)
    $gateSql = if ($GateKey -ne 0) {
        "SELECT pg_advisory_xact_lock($GateKey);"
    } else {
        ''
    }
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$UserId', true);
SELECT concat_ws(
    '|',
    user_display_tier,
    household_display_tier,
    bank_connection_allowance,
    is_premium_sponsor
)
FROM get_my_entitlements('$HouseholdId');
$gateSql
COMMIT;
"@
    $output = docker exec $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -A -t -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Concurrent authenticated entitlement read failed for $UserId"
    }
    if ($output -notcontains 'premium|premium|2|t') {
        throw "Incorrect concurrent entitlement result for ${UserId}: $output"
    }
}

# Both callers lock different membership rows first, then exactly the same
# complete account set in UUID order. The first read waits at a test-only
# advisory gate after obtaining the account locks; pg_stat_activity must then
# show the second read blocked on one of those locks before the gate is opened.
$readGateKey = $gateKey++
$readGate = Start-AdvisoryGate -Key $readGateKey
$read1Application = "billing_read_1_$run"
$read2Application = "billing_read_2_$run"
$read1Job = Start-Job -ScriptBlock $readEntitlementsScript `
    -ArgumentList $Container, $user1, $sharedHousehold, $read1Application, $readGateKey
Wait-ForDatabaseWait -ApplicationName $read1Application -WaitEvent 'advisory'
$read2Job = Start-Job -ScriptBlock $readEntitlementsScript `
    -ArgumentList $Container, $user2, $sharedHousehold, $read2Application, 0
Wait-ForDatabaseWait -ApplicationName $read2Application -WaitEvent '(transactionid|tuple)'
Stop-AdvisoryGate -Process $readGate -Key $readGateKey
Wait-ConcurrentJobs -Jobs @($read1Job, $read2Job)

$setSponsorshipScript = {
    param($ContainerName, $UserId, $HouseholdId, $ApplicationName, $GateKey)
    $gateSql = if ($GateKey -ne 0) {
        "SELECT pg_advisory_xact_lock($GateKey);"
    } else {
        ''
    }
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$UserId', true);
SELECT set_my_premium_household_sponsorship('$HouseholdId');
$gateSql
COMMIT;
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Sponsorship setter unexpectedly failed for $UserId"
    }
}

$removeMembershipScript = {
    param($ContainerName, $MembershipId, $ApplicationName, $GateKey)
    $gateSql = if ($GateKey -ne 0) {
        "SELECT pg_advisory_xact_lock($GateKey);"
    } else {
        ''
    }
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
UPDATE household_members
SET deleted_at = statement_timestamp()
WHERE id = '$MembershipId';
$gateSql
COMMIT;
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Membership removal unexpectedly failed for $MembershipId"
    }
}

# Setter wins: removal waits on the membership row, then its trigger takes the
# account lock and clears the newly committed sponsorship.
$setterFirstGateKey = $gateKey++
$setterFirstGate = Start-AdvisoryGate -Key $setterFirstGateKey
$setterFirstApplication = "billing_setter_first_$run"
$removalSecondApplication = "billing_removal_second_$run"
$setterJob = Start-Job -ScriptBlock $setSponsorshipScript `
    -ArgumentList $Container, $user3, $raceHousehold, $setterFirstApplication, $setterFirstGateKey
Wait-ForDatabaseWait -ApplicationName $setterFirstApplication -WaitEvent 'advisory'
$removalJob = Start-Job -ScriptBlock $removeMembershipScript `
    -ArgumentList $Container, $membership3, $removalSecondApplication, 0
Wait-ForDatabaseWait -ApplicationName $removalSecondApplication -WaitEvent '(transactionid|tuple)'
Stop-AdvisoryGate -Process $setterFirstGate -Key $setterFirstGateKey
Wait-ConcurrentJobs -Jobs @($setterJob, $removalJob)

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF (
        SELECT premium_sponsored_household_id IS NOT NULL
        FROM billing_accounts
        WHERE id = '$account3'
    ) OR EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '$account3'
          AND beneficiary_household_id = '$raceHousehold'
          AND grant_type IN ('premium_sponsorship', 'premium_addon')
          AND revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'membership removal did not clear committed sponsorship';
    END IF;
END;
`$`$;

UPDATE household_members
SET deleted_at = NULL
WHERE id = '$membership3';

DO `$`$
BEGIN
    IF (
        SELECT premium_sponsored_household_id IS NOT NULL
        FROM billing_accounts
        WHERE id = '$account3'
    ) THEN
        RAISE EXCEPTION 'membership reactivation restored old sponsorship';
    END IF;
END;
`$`$;
"@

$setSponsorshipMustFailScript = {
    param($ContainerName, $UserId, $HouseholdId, $ApplicationName)
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$UserId', true);
SELECT set_my_premium_household_sponsorship('$HouseholdId');
COMMIT;
"@
    $output = docker exec $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -c $sql 2>&1
    if ($LASTEXITCODE -eq 0) {
        throw "Sponsorship setter unexpectedly succeeded for removed member $UserId"
    }
    if ("$output" -notmatch 'active household membership required') {
        throw "Sponsorship setter failed for an unexpected reason: $output"
    }
}

# Removal wins: the setter waits on the membership row, rechecks the active
# predicate after commit, and fails without ever taking an account lock.
$removalFirstGateKey = $gateKey++
$removalFirstGate = Start-AdvisoryGate -Key $removalFirstGateKey
$removalFirstApplication = "billing_removal_first_$run"
$setterSecondApplication = "billing_setter_second_$run"
$removalJob = Start-Job -ScriptBlock $removeMembershipScript `
    -ArgumentList $Container, $membership3, $removalFirstApplication, $removalFirstGateKey
Wait-ForDatabaseWait -ApplicationName $removalFirstApplication -WaitEvent 'advisory'
$setterJob = Start-Job -ScriptBlock $setSponsorshipMustFailScript `
    -ArgumentList $Container, $user3, $raceHousehold, $setterSecondApplication
Wait-ForDatabaseWait -ApplicationName $setterSecondApplication -WaitEvent '(transactionid|tuple)'
Stop-AdvisoryGate -Process $removalFirstGate -Key $removalFirstGateKey
Wait-ConcurrentJobs -Jobs @($removalJob, $setterJob)

Invoke-LocalPsql @"
UPDATE household_members
SET deleted_at = NULL
WHERE id = '$membership3';

DO `$`$
BEGIN
    IF (
        SELECT premium_sponsored_household_id IS NOT NULL
        FROM billing_accounts
        WHERE id = '$account3'
    ) OR EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '$account3'
          AND beneficiary_household_id = '$raceHousehold'
          AND grant_type IN ('premium_sponsorship', 'premium_addon')
          AND revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'reactivation after removal-first race restored sponsorship';
    END IF;
END;
`$`$;
"@

$clearExpectedHouseholdMustFailScript = {
    param(
        $ContainerName,
        $UserId,
        $ExpectedHouseholdId,
        $ApplicationName
    )
    $sql = @"
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = '$ApplicationName';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$UserId', true);
SELECT clear_my_premium_household_sponsorship('$ExpectedHouseholdId');
COMMIT;
"@
    $output = docker exec $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -c $sql 2>&1
    if ($LASTEXITCODE -eq 0) {
        throw 'Expected-household clear unexpectedly cleared a newer sponsorship'
    }
    if (
        "$output" -notmatch '42501' -or
        "$output" -notmatch 'requested household is not currently sponsored'
    ) {
        throw "Expected-household clear failed for an unexpected reason: $output"
    }
}

Invoke-LocalPsql @"
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$user3', true);
SELECT set_my_premium_household_sponsorship('$raceHousehold');
COMMIT;
"@

# A setter moves H_old to H_new and retains the account row lock at the gate.
# clear(H_old) must be observed waiting on that row. Once released, its atomic
# SELECT ... FOR UPDATE sees H_new and returns the stable authorization error
# rather than clearing a value read before it blocked.
$clearRaceGateKey = $gateKey++
$clearRaceGate = Start-AdvisoryGate -Key $clearRaceGateKey
$replacementSetterApplication = "billing_replacement_setter_$run"
$staleClearApplication = "billing_stale_clear_$run"
$replacementSetterJob = Start-Job -ScriptBlock $setSponsorshipScript `
    -ArgumentList $Container, $user3, $newHousehold, $replacementSetterApplication, $clearRaceGateKey
Wait-ForDatabaseWait -ApplicationName $replacementSetterApplication -WaitEvent 'advisory'
$staleClearJob = Start-Job -ScriptBlock $clearExpectedHouseholdMustFailScript `
    -ArgumentList $Container, $user3, $raceHousehold, $staleClearApplication
Wait-ForDatabaseWait -ApplicationName $staleClearApplication -WaitEvent '(transactionid|tuple)'
Stop-AdvisoryGate -Process $clearRaceGate -Key $clearRaceGateKey
Wait-ConcurrentJobs -Jobs @($replacementSetterJob, $staleClearJob)

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF (
        SELECT premium_sponsored_household_id IS DISTINCT FROM '$newHousehold'::UUID
        FROM billing_accounts
        WHERE id = '$account3'
    ) OR NOT EXISTS (
        SELECT 1
        FROM entitlement_grants
        WHERE billing_account_id = '$account3'
          AND beneficiary_household_id = '$newHousehold'
          AND grant_type = 'premium_sponsorship'
          AND revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'stale expected-household clear removed the new sponsorship';
    END IF;
END;
`$`$;
"@

Write-Host 'PASS: coordinated account reads, membership ordering, stale clear, binding, and rebuild concurrency'
