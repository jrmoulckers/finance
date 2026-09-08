# SPDX-License-Identifier: BUSL-1.1

# Durable revocation SKIP LOCKED concurrency test (#4405).
#
# Holds the oldest ready job locked in one PostgreSQL session and proves a
# concurrent worker claims the next job immediately rather than blocking or
# duplicating the destructive side effect.
#
# Requires a disposable local Supabase PostgreSQL container.

param(
    [Parameter(Mandatory = $true)]
    [string]$Container
)

$ErrorActionPreference = 'Stop'

function Invoke-LocalPsql {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $result = $Sql | docker exec -i $Container psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -A -t
    if ($LASTEXITCODE -ne 0) {
        throw 'psql failed in the isolated revocation concurrency database'
    }
    return $result
}

function Start-RowLock {
    param([Parameter(Mandatory = $true)][guid]$JobId)

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

Invoke-LocalPsql @"
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
        Invoke-LocalPsql "SELECT id FROM claim_bank_revocation_jobs(1, 60);"
    ).Trim()
    if ($claimedWhileLocked -ne $job2.ToString()) {
        throw "SKIP LOCKED claim expected $job2, got $claimedWhileLocked"
    }
}
finally {
    Stop-RowLock -Process $rowLock
}

$claimedAfterRelease = (
    Invoke-LocalPsql "SELECT id FROM claim_bank_revocation_jobs(1, 60);"
).Trim()
if ($claimedAfterRelease -ne $job1.ToString()) {
    throw "released oldest job expected $job1, got $claimedAfterRelease"
}

$duplicateCount = (
    Invoke-LocalPsql @"
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

Invoke-LocalPsql @"
DELETE FROM bank_connection_orphaned_items
WHERE id IN ('$job1', '$job2');
"@ | Out-Null

Write-Output 'bank-revocation-concurrency.test.ps1: all assertions passed'
