# SPDX-License-Identifier: BUSL-1.1

# Durable revocation concurrency tests (#4405).
#
# Holds the oldest ready job locked in one PostgreSQL session and proves a
# concurrent worker claims the next job immediately rather than blocking or
# duplicating the destructive side effect. Also forces result recording and
# account-deletion identity severance to contend on the same connection/outbox
# pair and proves their shared lock order completes without a deadlock.
#
# Requires a disposable PostgreSQL database configured through the standard
# PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE environment variables.

$ErrorActionPreference = 'Stop'

function Invoke-TestPsql {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $result = $Sql | psql -v ON_ERROR_STOP=1 -q -A -t
    if ($LASTEXITCODE -ne 0) {
        throw 'psql failed in the isolated revocation concurrency database'
    }
    return $result
}

function Start-TestPsql {
    param(
        [Parameter(Mandatory = $true)][string]$ApplicationName,
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'psql'
    foreach ($argument in @('-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t')) {
        [void]$startInfo.ArgumentList.Add($argument)
    }
    $startInfo.Environment['PGAPPNAME'] = $ApplicationName
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.StandardInput.WriteLine($Sql)
    $process.StandardInput.Close()

    return ,$process
}

function Wait-PsqlLock {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$ApplicationName
    )

    foreach ($attempt in 1..100) {
        if ($Process.HasExited) {
            throw "$ApplicationName exited before reaching its expected lock wait: $($Process.StandardError.ReadToEnd())"
        }

        $waiting = (
            Invoke-TestPsql @"
SELECT count(*)
FROM pg_stat_activity
WHERE application_name = '$ApplicationName'
  AND wait_event_type = 'Lock';
"@
        ).Trim()
        if ($waiting -eq '1') {
            return
        }
        Start-Sleep -Milliseconds 100
    }

    throw "$ApplicationName did not reach its expected lock wait"
}

function Complete-TestPsql {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$ApplicationName
    )

    if (-not $Process.WaitForExit(15000)) {
        Stop-Process -Id $Process.Id
        throw "$ApplicationName did not complete after the blocking lock was released"
    }

    $output = $Process.StandardOutput.ReadToEnd().Trim()
    $errorOutput = $Process.StandardError.ReadToEnd().Trim()
    if ($Process.ExitCode -ne 0) {
        throw "$ApplicationName failed: $errorOutput"
    }

    return $output
}

function Stop-TestPsql {
    param([System.Diagnostics.Process]$Process)

    if ($null -ne $Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id
        [void]$Process.WaitForExit(5000)
    }
}

function Start-RowLock {
    param([Parameter(Mandatory = $true)][guid]$JobId)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'psql'
    foreach ($argument in @('-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t')) {
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
        "BEGIN; SELECT id FROM bank_connection_orphaned_items " +
        "WHERE id = '$JobId' FOR UPDATE; SELECT 'LOCK_READY';"
    )
    $process.StandardInput.Flush()

    do {
        $line = $process.StandardOutput.ReadLine()
        if ($null -eq $line -and $process.HasExited) {
            throw "Row lock failed: $($process.StandardError.ReadToEnd())"
        }
    } until ($line -eq 'LOCK_READY')

    return ,$process
}

function Start-HouseholdLock {
    param([Parameter(Mandatory = $true)][guid]$HouseholdId)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'psql'
    foreach ($argument in @('-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t')) {
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
        "BEGIN; SELECT pg_advisory_xact_lock(" +
        "bank_connection_reservation_lock_key('$HouseholdId')); " +
        "SELECT 'LOCK_READY';"
    )
    $process.StandardInput.Flush()

    do {
        $line = $process.StandardOutput.ReadLine()
        if ($null -eq $line -and $process.HasExited) {
            throw "Household lock failed: $($process.StandardError.ReadToEnd())"
        }
    } until ($line -eq 'LOCK_READY')

    return ,$process
}

function Start-OwnerLock {
    param([Parameter(Mandatory = $true)][guid]$OwnerId)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'psql'
    foreach ($argument in @('-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t')) {
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
        "BEGIN; SELECT pg_advisory_xact_lock(" +
        "hashtextextended('bank-connection-owner:' || '$OwnerId'::text, 0)); " +
        "SELECT 'LOCK_READY';"
    )
    $process.StandardInput.Flush()

    do {
        $line = $process.StandardOutput.ReadLine()
        if ($null -eq $line -and $process.HasExited) {
            throw "Owner lock failed: $($process.StandardError.ReadToEnd())"
        }
    } until ($line -eq 'LOCK_READY')

    return ,$process
}

function Stop-RowLock {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

    $Process.StandardInput.WriteLine('ROLLBACK;')
    $Process.StandardInput.WriteLine('\q')
    $Process.StandardInput.Close()
    if (-not $Process.WaitForExit(5000)) {
        throw 'Row-lock session did not close'
    }
    if ($Process.ExitCode -ne 0) {
        throw "Row-lock session failed: $($Process.StandardError.ReadToEnd())"
    }
}

$job1 = [guid]::NewGuid()
$job2 = [guid]::NewGuid()

Invoke-TestPsql @"
DELETE FROM bank_connection_orphaned_items
WHERE encrypted_access_token IN (
    'enc_concurrency_1',
    'enc_concurrency_2',
    'enc_lock_test',
    'enc_finalize_first',
    'enc_handoff_first',
    'enc_claim_race',
    'enc_erasure_race'
);
"@ | Out-Null

Invoke-TestPsql @"
INSERT INTO bank_connection_orphaned_items (
    id, provider, encrypted_access_token, status, attempts, reason,
    next_attempt_at, retain_until
)
VALUES
    ('$job1', 'plaid', 'enc_concurrency_1', 'pending_revocation', 0,
     'finalization_failure', now() - interval '2 seconds', now() + interval '1 day'),
    ('$job2', 'plaid', 'enc_concurrency_2', 'pending_revocation', 0,
     'finalization_failure', now() - interval '1 second', now() + interval '1 day');
"@ | Out-Null

$rowLock = Start-RowLock -JobId $job1
try {
    $claimedWhileLocked = (
        Invoke-TestPsql "SELECT id FROM claim_bank_revocation_jobs(1, 60);"
    ).Trim()
    if ($claimedWhileLocked -ne $job2.ToString()) {
        throw "SKIP LOCKED claim expected $job2, got $claimedWhileLocked"
    }
}
finally {
    Stop-RowLock -Process $rowLock
}

$claimedAfterRelease = (
    Invoke-TestPsql "SELECT id FROM claim_bank_revocation_jobs(1, 60);"
).Trim()
if ($claimedAfterRelease -ne $job1.ToString()) {
    throw "released oldest job expected $job1, got $claimedAfterRelease"
}

$duplicateCount = (
    Invoke-TestPsql @"
SELECT count(*)
FROM bank_connection_orphaned_items
WHERE id IN ('$job1', '$job2')
  AND status = 'processing'
  AND attempts = 1
  AND lease_token IS NOT NULL;
"@
).Trim()
if ($duplicateCount -ne '2') {
    throw "expected two distinct leased jobs, got $duplicateCount"
}

Invoke-TestPsql @"
DELETE FROM bank_connection_orphaned_items
WHERE id IN ('$job1', '$job2');
"@ | Out-Null

$ownerId = [guid]::NewGuid()
$deadlockOwnerId = [guid]::NewGuid()
$householdId = [guid]::NewGuid()
$connectionId = [guid]::NewGuid()
$deadlockJobId = [guid]::NewGuid()
$leaseToken = [guid]::NewGuid()
$memberId = [guid]::NewGuid()
$deadlockMemberId = [guid]::NewGuid()
$billingAccountId = [guid]::NewGuid()
$providerIdentityId = [guid]::NewGuid()
$firstReservationId = [guid]::NewGuid()
$secondReservationId = [guid]::NewGuid()
$claimRaceReservationId = [guid]::NewGuid()
$erasureRaceReservationId = [guid]::NewGuid()
$finalizationFirstConnectionId = [guid]::NewGuid()
$handoffFirstConnectionId = [guid]::NewGuid()
$claimRaceConnectionId = [guid]::NewGuid()
$erasureRaceConnectionId = [guid]::NewGuid()
$providerEventId = "evt_$($billingAccountId.ToString('N'))"
$providerSubscriptionId = "sub_$($billingAccountId.ToString('N'))"
$resultProcess = $null
$severProcess = $null
$finalizeProcess = $null
$handoffProcess = $null
$claimProcess = $null
$rowLock = $null
$householdLock = $null
$ownerLock = $null
$finalizationFirstHandoffId = [guid]::Empty
$handoffFirstHandoffId = [guid]::Empty
$claimRaceHandoffId = [guid]::Empty
$fixtureCreated = $false

try {
    Invoke-TestPsql @"
BEGIN;

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
    '$ownerId',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    '$ownerId@example.invalid',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
), (
    '$deadlockOwnerId',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    '$deadlockOwnerId@example.invalid',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
);

INSERT INTO users (id, email, display_name)
VALUES
    ('$ownerId', '$ownerId@example.invalid', 'Revocation Lock Test'),
    (
        '$deadlockOwnerId',
        '$deadlockOwnerId@example.invalid',
        'Revocation Deadlock Test'
    );

INSERT INTO households (id, name, created_by)
VALUES ('$householdId', 'Revocation Lock Test', '$ownerId');

INSERT INTO household_members (id, household_id, user_id, role)
VALUES
    ('$memberId', '$householdId', '$ownerId', 'owner'),
    ('$deadlockMemberId', '$householdId', '$deadlockOwnerId', 'admin');

INSERT INTO billing_accounts (id, owner_id)
VALUES ('$billingAccountId', '$ownerId');

INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
)
VALUES (
    '$providerIdentityId', '$billingAccountId',
    'stripe', 'sandbox', 'cus_$($billingAccountId.ToString('N'))', true
);

SELECT apply_billing_provider_event(record_billing_provider_event(
    '$billingAccountId',
    '$providerIdentityId',
    'stripe',
    'sandbox',
    '$providerEventId',
    '$providerSubscriptionId',
    NULL,
    now(),
    now() - interval '2 days',
    10,
    'activated',
    'active',
    'base_plan',
    'premium',
    1,
    now() + interval '30 days',
    NULL,
    NULL,
    NULL
));

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$ownerId', true);
SELECT set_my_premium_household_sponsorship('$householdId');
RESET ROLE;

UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '$householdId';

INSERT INTO bank_connection_reservations (
    id, household_id, owner_id, provider, expires_at
)
VALUES
    (
        '$firstReservationId', '$householdId', '$ownerId',
        'plaid', now() + interval '15 minutes'
    ),
    (
        '$secondReservationId', '$householdId', '$ownerId',
        'mx', now() + interval '15 minutes'
    ),
    (
        '$claimRaceReservationId', '$householdId', '$ownerId',
        'plaid', now() + interval '15 minutes'
    ),
    (
        '$erasureRaceReservationId', '$householdId', '$ownerId',
        'mx', now() + interval '15 minutes'
    );

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, revocation_enqueued_at
)
VALUES (
    '$connectionId', '$householdId', '$deadlockOwnerId', 'plaid',
    'ins_lock_test', 'Lock Test Institution', NULL,
    'revocation_pending', now()
);

INSERT INTO bank_connection_orphaned_items (
    id, household_id, owner_id, connection_id, provider,
    encrypted_access_token, status, attempts, reason, next_attempt_at,
    lease_token, lease_expires_at, retain_until
)
VALUES (
    '$deadlockJobId', '$householdId', '$deadlockOwnerId', '$connectionId', 'plaid',
    'enc_lock_test', 'processing', 1, 'user_disconnect', NULL,
    '$leaseToken', now() + interval '1 minute', now() + interval '1 day'
);

COMMIT;
"@ | Out-Null
    $fixtureCreated = $true

    # Force the historical deadlock sequence. Result recording queues first on
    # the held outbox row; account deletion then queues on the connection row
    # already held by the result transaction. Releasing the outbox lock must let
    # both real functions finish without PostgreSQL choosing a deadlock victim.
    $rowLock = Start-RowLock -JobId $deadlockJobId
    $resultProcess = Start-TestPsql -ApplicationName 'revocation-result-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT record_bank_revocation_result('$deadlockJobId', '$leaseToken', true, NULL);
COMMIT;
"@
    Wait-PsqlLock -Process $resultProcess -ApplicationName 'revocation-result-4405'

    $severProcess = Start-TestPsql -ApplicationName 'revocation-sever-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT sever_bank_revocation_identities_for_account(
    '$deadlockOwnerId',
    NULL::UUID[]
);
COMMIT;
"@
    Wait-PsqlLock -Process $severProcess -ApplicationName 'revocation-sever-4405'

    Stop-RowLock -Process $rowLock
    $rowLock = $null

    $resultOutput = Complete-TestPsql `
        -Process $resultProcess `
        -ApplicationName 'revocation-result-4405'
    $severOutput = Complete-TestPsql `
        -Process $severProcess `
        -ApplicationName 'revocation-sever-4405'
    $resultProcess = $null
    $severProcess = $null

    if ($resultOutput -ne 'revoked') {
        throw "concurrent result recording expected revoked, got $resultOutput"
    }
    if ($severOutput -ne '0') {
        throw "concurrent identity severance expected zero live handoffs, got $severOutput"
    }

    $terminalStateCount = (
        Invoke-TestPsql @"
SELECT count(*)
FROM bank_connection_orphaned_items o
JOIN bank_connections c ON c.id = '$connectionId'
WHERE o.id = '$deadlockJobId'
  AND o.status = 'revoked'
  AND o.encrypted_access_token IS NULL
  AND o.owner_id IS NULL
  AND o.household_id IS NULL
  AND o.connection_id IS NULL
  AND c.status = 'disconnected'
  AND c.deleted_at IS NOT NULL;
"@
    ).Trim()
    if ($terminalStateCount -ne '1') {
        throw 'concurrent result and account deletion did not preserve terminal revocation and identity severance'
    }

    # Finalization queued first behind the household lock must insert the live
    # connection before handoff creation observes it. The worker then
    # reconciles and purges the duplicate credential without revoking the Item.
    $householdLock = Start-HouseholdLock -HouseholdId $householdId
    $finalizeProcess = Start-TestPsql -ApplicationName 'revocation-finalize-first-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT status
FROM finalize_bank_connection_reservation(
    '$firstReservationId',
    '$householdId',
    '$ownerId',
    'plaid',
    'ins_finalize_first',
    'Finalize First Institution',
    'enc_finalize_first',
    '{}'::jsonb,
    '$finalizationFirstConnectionId'
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-first-4405'

    $handoffProcess = Start-TestPsql -ApplicationName 'revocation-handoff-second-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT record_orphaned_bank_item(
    '$householdId',
    '$ownerId',
    'plaid',
    'enc_finalize_first',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '$finalizationFirstConnectionId'
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $handoffProcess `
        -ApplicationName 'revocation-handoff-second-4405'

    Stop-RowLock -Process $householdLock
    $householdLock = $null

    $finalizeOutput = Complete-TestPsql `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-first-4405'
    $handoffOutput = Complete-TestPsql `
        -Process $handoffProcess `
        -ApplicationName 'revocation-handoff-second-4405'
    $finalizeProcess = $null
    $handoffProcess = $null

    if ($finalizeOutput -ne 'finalized') {
        throw "finalization-first ordering expected finalized, got $finalizeOutput"
    }
    $finalizationFirstHandoffId = [guid]::Parse($handoffOutput)

    Invoke-TestPsql 'SELECT id FROM claim_bank_revocation_jobs(1, 60);' | Out-Null
    $finalizationFirstCount = (
        Invoke-TestPsql @"
SELECT count(*)
FROM bank_connection_orphaned_items o
JOIN bank_connections c ON c.id = '$finalizationFirstConnectionId'
WHERE o.id = '$finalizationFirstHandoffId'
  AND o.status = 'reconciled'
  AND o.encrypted_access_token IS NULL
  AND o.last_error_code = 'CONNECTION_FINALIZED'
  AND c.status = 'active'
  AND c.deleted_at IS NULL
  AND c.encrypted_access_token = 'enc_finalize_first';
"@
    ).Trim()
    if ($finalizationFirstCount -ne '1') {
        throw 'finalization-first ordering did not reconcile and purge the duplicate handoff'
    }

    # Handoff queued first becomes the durable tombstone. The later finalizer
    # must return a definitive non-finalized result without inserting a row.
    $householdLock = Start-HouseholdLock -HouseholdId $householdId
    $handoffProcess = Start-TestPsql -ApplicationName 'revocation-handoff-first-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT record_orphaned_bank_item(
    '$householdId',
    '$ownerId',
    'mx',
    'enc_handoff_first',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '$handoffFirstConnectionId'
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $handoffProcess `
        -ApplicationName 'revocation-handoff-first-4405'

    $finalizeProcess = Start-TestPsql -ApplicationName 'revocation-finalize-second-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT status
FROM finalize_bank_connection_reservation(
    '$secondReservationId',
    '$householdId',
    '$ownerId',
    'mx',
    'ins_handoff_first',
    'Handoff First Institution',
    'enc_handoff_first',
    '{}'::jsonb,
    '$handoffFirstConnectionId'
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-second-4405'

    Stop-RowLock -Process $householdLock
    $householdLock = $null

    $handoffOutput = Complete-TestPsql `
        -Process $handoffProcess `
        -ApplicationName 'revocation-handoff-first-4405'
    $finalizeOutput = Complete-TestPsql `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-second-4405'
    $handoffProcess = $null
    $finalizeProcess = $null

    $handoffFirstHandoffId = [guid]::Parse($handoffOutput)
    if ($finalizeOutput -ne 'already_disconnected') {
        throw "handoff-first ordering expected already_disconnected, got $finalizeOutput"
    }

    $claimedHandoffId = (
        Invoke-TestPsql 'SELECT id FROM claim_bank_revocation_jobs(1, 60);'
    ).Trim()
    if ($claimedHandoffId -ne $handoffFirstHandoffId.ToString()) {
        throw "handoff-first revocation expected claim $handoffFirstHandoffId, got $claimedHandoffId"
    }

    $revocationResult = (
        Invoke-TestPsql @"
SELECT record_bank_revocation_result(id, lease_token, true, 'ALREADY_INVALID')
FROM bank_connection_orphaned_items
WHERE id = '$handoffFirstHandoffId';
"@
    ).Trim()
    if ($revocationResult -ne 'revoked') {
        throw "handoff-first terminal result expected revoked, got $revocationResult"
    }

    $handoffFirstCount = (
        Invoke-TestPsql @"
SELECT count(*)
FROM bank_connection_orphaned_items o
WHERE o.id = '$handoffFirstHandoffId'
  AND o.status = 'revoked'
  AND o.encrypted_access_token IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM bank_connections c
      WHERE c.id = '$handoffFirstConnectionId'
        AND c.deleted_at IS NULL
        AND c.status IN ('active', 'needs_reauth', 'error')
  )
  AND NOT EXISTS (
      SELECT 1
      FROM bank_connection_reservations r
      WHERE r.id = '$secondReservationId'
  );
"@
    ).Trim()
    if ($handoffFirstCount -ne '1') {
        throw 'handoff-first ordering retained a reservation or active connection after provider revocation'
    }

    # Force the exact reconciliation-claim versus delayed-finalizer race. A
    # locked handoff row must make the claim skip without blocking unrelated
    # jobs. The finalizer then waits on the tombstone row and consumes its
    # reservation without recreating a live connection once the row is
    # released.
    $claimRaceHandoffId = [guid]::Parse(
        (
            Invoke-TestPsql @"
SELECT record_orphaned_bank_item(
    '$householdId',
    '$ownerId',
    'plaid',
    'enc_claim_race',
    'FINALIZE_OUTCOME_UNKNOWN',
    'pending_reconciliation',
    '$claimRaceConnectionId'
);
"@
        ).Trim()
    )
    $rowLock = Start-RowLock -JobId $claimRaceHandoffId

    $claimProcess = Start-TestPsql -ApplicationName 'revocation-claim-race-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '2s';
SELECT id FROM claim_bank_revocation_jobs(1, 60);
COMMIT;
"@
    $claimOutput = Complete-TestPsql `
        -Process $claimProcess `
        -ApplicationName 'revocation-claim-race-4405'
    $claimProcess = $null
    if ($claimOutput -ne '') {
        throw "locked reconciliation row should be skipped, got $claimOutput"
    }

    $finalizeProcess = Start-TestPsql -ApplicationName 'revocation-finalize-race-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT status
FROM finalize_bank_connection_reservation(
    '$claimRaceReservationId',
    '$householdId',
    '$ownerId',
    'plaid',
    'ins_claim_race',
    'Claim Race Institution',
    'enc_claim_race',
    '{}'::jsonb,
    '$claimRaceConnectionId'
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-race-4405'

    Stop-RowLock -Process $rowLock
    $rowLock = $null

    $finalizeOutput = Complete-TestPsql `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-race-4405'
    $finalizeProcess = $null

    if ($finalizeOutput -ne 'already_disconnected') {
        throw "claim-first race finalizer expected already_disconnected, got $finalizeOutput"
    }

    $claimOutput = (
        Invoke-TestPsql 'SELECT id FROM claim_bank_revocation_jobs(1, 60);'
    ).Trim()
    if ($claimOutput -ne $claimRaceHandoffId.ToString()) {
        throw "released claim race expected $claimRaceHandoffId, got $claimOutput"
    }

    $claimRaceResult = (
        Invoke-TestPsql @"
SELECT record_bank_revocation_result(id, lease_token, true, 'ALREADY_INVALID')
FROM bank_connection_orphaned_items
WHERE id = '$claimRaceHandoffId';
"@
    ).Trim()
    if ($claimRaceResult -ne 'revoked') {
        throw "claim-first race terminal result expected revoked, got $claimRaceResult"
    }

    $claimRaceCount = (
        Invoke-TestPsql @"
SELECT count(*)
FROM bank_connection_orphaned_items o
WHERE o.id = '$claimRaceHandoffId'
  AND o.status = 'revoked'
  AND o.encrypted_access_token IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM bank_connections c
      WHERE c.id = '$claimRaceConnectionId'
        AND c.deleted_at IS NULL
        AND c.status IN ('active', 'needs_reauth', 'error')
  )
  AND NOT EXISTS (
      SELECT 1
      FROM bank_connection_reservations r
      WHERE r.id = '$claimRaceReservationId'
  );
"@
    ).Trim()
    if ($claimRaceCount -ne '1') {
        throw 'claim-first race retained a reservation or active connection after provider revocation'
    }

    # An in-flight finalizer that entered before account deletion must either
    # finish before erasure scans or be rejected after erasure marks the owner
    # deleted. Queue finalization first to prove the severance RPC observes and
    # durably enqueues the committed credential before detaching identities.
    $ownerLock = Start-OwnerLock -OwnerId $ownerId
    $finalizeProcess = Start-TestPsql -ApplicationName 'revocation-finalize-erasure-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT status
FROM finalize_bank_connection_reservation(
    '$erasureRaceReservationId',
    '$householdId',
    '$ownerId',
    'mx',
    'ins_erasure_race',
    'Erasure Race Institution',
    'enc_erasure_race',
    '{}'::jsonb,
    '$erasureRaceConnectionId'
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-erasure-4405'

    $severProcess = Start-TestPsql -ApplicationName 'revocation-sever-erasure-4405' -Sql @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT sever_bank_revocation_identities_for_account(
    '$ownerId',
    ARRAY['$householdId']::UUID[]
);
COMMIT;
"@
    Wait-PsqlLock `
        -Process $severProcess `
        -ApplicationName 'revocation-sever-erasure-4405'

    Stop-RowLock -Process $ownerLock
    $ownerLock = $null

    $finalizeOutput = Complete-TestPsql `
        -Process $finalizeProcess `
        -ApplicationName 'revocation-finalize-erasure-4405'
    $severOutput = Complete-TestPsql `
        -Process $severProcess `
        -ApplicationName 'revocation-sever-erasure-4405'
    $finalizeProcess = $null
    $severProcess = $null

    if ($finalizeOutput -ne 'finalized') {
        throw "finalization-before-erasure expected finalized, got $finalizeOutput"
    }
    if ([int]$severOutput -lt 1) {
        throw "erasure race expected at least one durable handoff, got $severOutput"
    }

    $erasureRaceCount = (
        Invoke-TestPsql @"
SELECT count(*)
FROM bank_connections c
WHERE c.id = '$erasureRaceConnectionId'
  AND c.status = 'revocation_pending'
  AND c.encrypted_access_token IS NULL
  AND EXISTS (
      SELECT 1
      FROM bank_connection_orphaned_items o
      WHERE o.encrypted_access_token = 'enc_erasure_race'
        AND o.status = 'pending_revocation'
        AND o.reason = 'account_deletion'
        AND o.owner_id IS NULL
        AND o.household_id IS NULL
        AND o.connection_id IS NULL
  )
  AND NOT EXISTS (
      SELECT 1
      FROM bank_connection_reservations r
      WHERE r.id = '$erasureRaceReservationId'
  );
"@
    ).Trim()
    if ($erasureRaceCount -ne '1') {
        throw 'account deletion missed a finalized credential or retained revocation identity'
    }

    $erasureReplayOutput = (
        Invoke-TestPsql @"
SELECT status
FROM finalize_bank_connection_reservation(
    '$erasureRaceReservationId',
    '$householdId',
    '$ownerId',
    'mx',
    'ins_erasure_race',
    'Erasure Race Institution',
    'enc_erasure_race',
    '{}'::jsonb,
    '$erasureRaceConnectionId'
);
"@
    ).Trim()
    if ($erasureReplayOutput -ne 'already_disconnected') {
        throw "post-erasure finalizer expected already_disconnected, got $erasureReplayOutput"
    }
}
finally {
    if ($null -ne $rowLock) {
        Stop-RowLock -Process $rowLock
    }
    if ($null -ne $householdLock) {
        Stop-RowLock -Process $householdLock
    }
    if ($null -ne $ownerLock) {
        Stop-RowLock -Process $ownerLock
    }
    Stop-TestPsql -Process $resultProcess
    Stop-TestPsql -Process $severProcess
    Stop-TestPsql -Process $finalizeProcess
    Stop-TestPsql -Process $handoffProcess
    Stop-TestPsql -Process $claimProcess

    if ($fixtureCreated) {
        Invoke-TestPsql @"
DELETE FROM bank_connection_orphaned_items
WHERE id IN (
       '$deadlockJobId',
       '$finalizationFirstHandoffId',
       '$handoffFirstHandoffId',
       '$claimRaceHandoffId'
   )
   OR connection_id IN (
       '$finalizationFirstConnectionId',
       '$handoffFirstConnectionId',
       '$claimRaceConnectionId',
       '$erasureRaceConnectionId'
   )
   OR encrypted_access_token IN (
       'enc_lock_test',
       'enc_finalize_first',
       'enc_handoff_first',
       'enc_claim_race',
       'enc_erasure_race'
   );
DELETE FROM bank_connections
WHERE id IN (
    '$connectionId',
    '$finalizationFirstConnectionId',
    '$handoffFirstConnectionId',
    '$claimRaceConnectionId',
    '$erasureRaceConnectionId'
);
DELETE FROM bank_connection_reservations
WHERE id IN (
    '$firstReservationId',
    '$secondReservationId',
    '$claimRaceReservationId',
    '$erasureRaceReservationId'
);
"@ | Out-Null
    }
}

Write-Output 'bank-revocation-concurrency.test.ps1: all assertions passed'
