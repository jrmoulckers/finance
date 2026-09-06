# SPDX-License-Identifier: BUSL-1.1

# Stage 6 bank connection final-slot concurrency test (#4404).
#
# Proves that two requests racing for the LAST bank connection slot cannot both
# win: the per-household reservation advisory lock serializes them, so exactly
# one reservation is granted and the other observes the slot as taken.
#
# Requires a disposable, non-production PostgreSQL container with all migrations
# applied (it commits fixtures). Never point this at staging or production.
#   pwsh supabase/tests/bank-connection-cap-concurrency.test.ps1 -Container <name>

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
$owner = [guid]::NewGuid()
$account = [guid]::NewGuid()
$identity = [guid]::NewGuid()
$household = [guid]::NewGuid()
$membership = [guid]::NewGuid()
$gateKey = [long](Get-Random -Minimum 100000000 -Maximum 2000000000)

# ---------------------------------------------------------------------------
# Fixture: a Premium-sponsored household (cap 2) with one live connection, so
# exactly one free slot remains for the race. Seeded through the real Stage 5
# projection path; the cap subsystem reads only that projection.
# ---------------------------------------------------------------------------
Invoke-LocalPsql @"
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '$owner', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bankcap-conc-$run@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
INSERT INTO users (id, email, display_name) VALUES
    ('$owner', 'bankcap-conc-u-$run@example.invalid', 'Bank Cap Concurrency Owner');
INSERT INTO households (id, name, created_by) VALUES
    ('$household', 'Bank Cap Concurrency Household $run', '$owner');
INSERT INTO household_members (id, household_id, user_id, role) VALUES
    ('$membership', '$household', '$owner', 'owner');
INSERT INTO billing_accounts (id, owner_id) VALUES ('$account', '$owner');
INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
) VALUES ('$identity', '$account', 'stripe', 'sandbox', 'cus_conc_$run', true);

SELECT apply_billing_provider_event(record_billing_provider_event(
    '$account', '$identity', 'stripe', 'sandbox',
    'evt_${run}_premium', 'sub_${run}_premium', NULL,
    statement_timestamp(), statement_timestamp() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'premium', 1,
    statement_timestamp() + interval '30 days', NULL, NULL, NULL, false
));

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$owner', true);
SELECT set_my_premium_household_sponsorship('$household');
COMMIT;

DO `$`$
BEGIN
    IF bank_connection_cap_for_household('$household') <> 2 THEN
        RAISE EXCEPTION 'fixture household must resolve to a cap of 2';
    END IF;
END;
`$`$;

-- One live connection consumes the first of two slots.
INSERT INTO bank_connections (
    household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status
) VALUES (
    '$household', '$owner', 'plaid', 'ins_seed_$run', 'Seed Institution',
    'enc_seed_$run', 'active'
);
"@

# ---------------------------------------------------------------------------
# The race: two reservations for the single remaining slot. The first holds the
# per-household reservation lock (via reserve) and parks on a test-only gate;
# the second must then block on that same per-household lock. When the gate
# opens, the first commits its reservation and the second re-counts and finds
# live(1) + reserved(1) = cap(2), so it is refused.
# ---------------------------------------------------------------------------
$reserveScript = {
    param($ContainerName, $HouseholdId, $OwnerId, $Provider, $ApplicationName, $GateKey)
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
SELECT status
FROM reserve_bank_connection_slot('$HouseholdId', '$OwnerId', '$Provider');
$gateSql
COMMIT;
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Concurrent reserve failed for $ApplicationName"
    }
}

$raceGateKey = $gateKey++
$raceGate = Start-AdvisoryGate -Key $raceGateKey
$reserve1Application = "bankcap_reserve_1_$run"
$reserve2Application = "bankcap_reserve_2_$run"

# First reserver takes the per-household lock, writes its reservation, then
# parks on the gate while still holding the lock.
$reserve1Job = Start-Job -ScriptBlock $reserveScript `
    -ArgumentList $Container, $household, $owner, 'plaid', $reserve1Application, $raceGateKey
Wait-ForDatabaseWait -ApplicationName $reserve1Application -WaitEvent 'advisory'

# Second reserver blocks on the same per-household reservation lock.
$reserve2Job = Start-Job -ScriptBlock $reserveScript `
    -ArgumentList $Container, $household, $owner, 'mx', $reserve2Application, 0
Wait-ForDatabaseWait -ApplicationName $reserve2Application -WaitEvent 'advisory'

# Release the gate: the first commits, the second proceeds and is refused.
Stop-AdvisoryGate -Process $raceGate -Key $raceGateKey
Wait-ConcurrentJobs -Jobs @($reserve1Job, $reserve2Job)

# ---------------------------------------------------------------------------
# Invariant: exactly one reservation was granted for the final slot, and live
# rows plus reservations never exceed the resolved cap of 2.
# ---------------------------------------------------------------------------
Invoke-LocalPsql @"
DO `$`$
DECLARE
    v_reservations BIGINT;
    v_live BIGINT;
BEGIN
    SELECT count(*) INTO v_reservations
    FROM bank_connection_reservations
    WHERE household_id = '$household' AND expires_at > now();

    SELECT count(*) INTO v_live
    FROM bank_connections
    WHERE household_id = '$household' AND deleted_at IS NULL;

    IF v_reservations <> 1 THEN
        RAISE EXCEPTION
            'final-slot race granted % reservations; exactly one must win', v_reservations;
    END IF;

    IF (v_live + v_reservations) > bank_connection_cap_for_household('$household') THEN
        RAISE EXCEPTION
            'live rows plus reservations (% + %) exceeded the resolved cap',
            v_live, v_reservations;
    END IF;
END;
`$`$;
"@

# ---------------------------------------------------------------------------
# Cleanup. Each object is named explicitly; nothing is deleted by wildcard.
# ---------------------------------------------------------------------------
Invoke-LocalPsql @"
DELETE FROM bank_connection_reservations WHERE household_id = '$household';
DELETE FROM bank_connections WHERE household_id = '$household';
DELETE FROM entitlement_grants WHERE billing_account_id = '$account';
DELETE FROM billing_provider_events WHERE billing_account_id = '$account';
DELETE FROM billing_subscriptions WHERE billing_account_id = '$account';
DELETE FROM current_household_entitlements WHERE household_id = '$household';
DELETE FROM current_user_entitlements WHERE user_id = '$owner';
DELETE FROM billing_provider_identities WHERE id = '$identity';
DELETE FROM billing_accounts WHERE id = '$account';
DELETE FROM household_members WHERE id = '$membership';
DELETE FROM households WHERE id = '$household';
DELETE FROM users WHERE id = '$owner';
DELETE FROM auth.users WHERE id = '$owner';
"@

Write-Host 'bank-connection-cap-concurrency.test.ps1: final-slot race granted exactly one reservation'
