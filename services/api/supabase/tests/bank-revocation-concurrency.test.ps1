# SPDX-License-Identifier: BUSL-1.1

# Stage 7 worker claim concurrency test (#4405).
#
# Holds the oldest outbox row under a real PostgreSQL row lock, then proves a
# concurrent worker claim uses FOR UPDATE SKIP LOCKED to lease the next row
# instead of blocking or duplicating work. Synthetic local data only.

param(
    [Parameter(Mandatory = $true)]
    [string]$Container
)

$ErrorActionPreference = 'Stop'
$firstJob = [guid]::NewGuid()
$secondJob = [guid]::NewGuid()
$lockProcess = $null

function Invoke-LocalPsql {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $output = $Sql | docker exec -e PGPASSWORD=postgres -i $Container psql -U postgres -d postgres `
        -v ON_ERROR_STOP=1 -q -A -t
    if ($LASTEXITCODE -ne 0) {
        throw 'psql failed in the isolated Stage 7 concurrency database'
    }
    return $output
}

try {
    Invoke-LocalPsql @"
INSERT INTO bank_connection_orphaned_items (
    id, provider, encrypted_access_token, status, attempts, retain_until,
    operation_reason, idempotency_key, available_at
) VALUES
    (
        '$firstJob', 'plaid', 'enc-concurrency-first', 'pending_revocation', 0,
        now() + interval '1 day', 'finalization_rejected',
        'concurrency:$firstJob', now() - interval '2 seconds'
    ),
    (
        '$secondJob', 'plaid', 'enc-concurrency-second', 'pending_revocation', 0,
        now() + interval '1 day', 'finalization_rejected',
        'concurrency:$secondJob', now() - interval '1 second'
    );
"@ | Out-Null

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'docker'
    foreach ($argument in @(
            'exec', '-e', 'PGPASSWORD=postgres', '-i', $Container, 'psql', '-U', 'postgres',
            '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t'
        )) {
        [void]$startInfo.ArgumentList.Add($argument)
    }
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $lockProcess = [System.Diagnostics.Process]::new()
    $lockProcess.StartInfo = $startInfo
    [void]$lockProcess.Start()
    $lockProcess.StandardInput.WriteLine(@"
BEGIN;
SELECT id FROM bank_connection_orphaned_items
WHERE id = '$firstJob'
FOR UPDATE;
SELECT 'LOCK_READY';
"@)
    $lockProcess.StandardInput.Flush()

    do {
        $line = $lockProcess.StandardOutput.ReadLine()
        if ($null -eq $line -and $lockProcess.HasExited) {
            throw "Row-lock session failed: $($lockProcess.StandardError.ReadToEnd())"
        }
    } until ($line -eq 'LOCK_READY')

    $claimed = Invoke-LocalPsql @"
SELECT id
FROM claim_bank_revocation_jobs(1, interval '5 minutes');
"@

    if (($claimed | Select-Object -Last 1) -ne $secondJob.ToString()) {
        throw "Concurrent worker did not skip the locked row; claimed: $claimed"
    }

    $state = Invoke-LocalPsql @"
SELECT concat_ws(
    '|',
    (SELECT status FROM bank_connection_orphaned_items WHERE id = '$firstJob'),
    (SELECT status FROM bank_connection_orphaned_items WHERE id = '$secondJob'),
    (SELECT attempts FROM bank_connection_orphaned_items WHERE id = '$secondJob')
);
"@
    if (($state | Select-Object -Last 1) -ne 'pending_revocation|processing|1') {
        throw "Concurrent claim produced an unexpected state: $state"
    }

    Write-Host 'bank-revocation-concurrency.test.ps1: locked job skipped and next job leased once'
}
finally {
    if ($null -ne $lockProcess -and -not $lockProcess.HasExited) {
        $lockProcess.StandardInput.WriteLine('ROLLBACK;')
        $lockProcess.StandardInput.WriteLine('\q')
        $lockProcess.StandardInput.Close()
        [void]$lockProcess.WaitForExit(5000)
    }

    Invoke-LocalPsql @"
DELETE FROM bank_connection_orphaned_items
WHERE id IN ('$firstJob', '$secondJob');
"@ | Out-Null
}
