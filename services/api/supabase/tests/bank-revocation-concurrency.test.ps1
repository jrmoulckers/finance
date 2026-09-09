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
$householdId = [guid]::NewGuid()
$connectionId = [guid]::NewGuid()
$deadlockJobId = [guid]::NewGuid()
$leaseToken = [guid]::NewGuid()
$resultProcess = $null
$severProcess = $null
$rowLock = $null
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
);

INSERT INTO users (id, email, display_name)
VALUES ('$ownerId', '$ownerId@example.invalid', 'Revocation Lock Test');

INSERT INTO households (id, name, created_by)
VALUES ('$householdId', 'Revocation Lock Test', '$ownerId');

INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, revocation_enqueued_at
)
VALUES (
    '$connectionId', '$householdId', '$ownerId', 'plaid',
    'ins_lock_test', 'Lock Test Institution', NULL,
    'revocation_pending', now()
);

INSERT INTO bank_connection_orphaned_items (
    id, household_id, owner_id, connection_id, provider,
    encrypted_access_token, status, attempts, reason, next_attempt_at,
    lease_token, lease_expires_at, retain_until
)
VALUES (
    '$deadlockJobId', '$householdId', '$ownerId', '$connectionId', 'plaid',
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
    '$ownerId',
    ARRAY['$householdId']::UUID[]
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
}
finally {
    if ($null -ne $rowLock) {
        Stop-RowLock -Process $rowLock
    }
    Stop-TestPsql -Process $resultProcess
    Stop-TestPsql -Process $severProcess

    if ($fixtureCreated) {
        Invoke-TestPsql @"
DELETE FROM bank_connection_orphaned_items WHERE id = '$deadlockJobId';
DELETE FROM bank_connections WHERE id = '$connectionId';
DELETE FROM households WHERE id = '$householdId';
DELETE FROM users WHERE id = '$ownerId';
DELETE FROM auth.users WHERE id = '$ownerId';
"@ | Out-Null
    }
}

Write-Output 'bank-revocation-concurrency.test.ps1: all assertions passed'
