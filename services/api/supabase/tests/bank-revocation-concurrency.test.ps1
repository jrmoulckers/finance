# SPDX-License-Identifier: BUSL-1.1

# Concurrent downgrade/disconnect/account-deletion and worker-claim coverage
# (#4405). Requires the disposable local Supabase PostgreSQL container.

param(
    [Parameter(Mandatory = $true)]
    [string]$Container
)

$ErrorActionPreference = 'Stop'

function Invoke-LocalPsql {
    param([Parameter(Mandatory = $true)][string]$Sql)
    $Sql | docker exec -i $Container psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) {
        throw 'psql failed in the isolated revocation concurrency database'
    }
}

function Start-Gate {
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
    $process.StandardInput.WriteLine("SELECT pg_advisory_lock($Key); SELECT 'READY';")
    $process.StandardInput.Flush()
    do {
        $line = $process.StandardOutput.ReadLine()
        if ($null -eq $line -and $process.HasExited) {
            throw "gate failed: $($process.StandardError.ReadToEnd())"
        }
    } until ($line -eq 'READY')
    return ,$process
}

function Stop-Gate {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][long]$Key
    )
    $Process.StandardInput.WriteLine("SELECT pg_advisory_unlock($Key);")
    $Process.StandardInput.WriteLine('\q')
    $Process.StandardInput.Close()
    if (-not $Process.WaitForExit(5000) -or $Process.ExitCode -ne 0) {
        throw "gate $Key did not close cleanly"
    }
}

function Wait-ForWaiters {
    param(
        [Parameter(Mandatory = $true)][string]$Prefix,
        [Parameter(Mandatory = $true)][int]$Count
    )
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $waiting = docker exec $Container psql -U supabase_admin -d postgres -q -A -t -c @"
SELECT count(*)
FROM pg_stat_activity
WHERE application_name LIKE '$Prefix%'
  AND wait_event_type = 'Lock'
  AND wait_event = 'advisory';
"@
        if ($LASTEXITCODE -ne 0) {
            throw 'could not inspect concurrent sessions'
        }
        if ([int]$waiting -ge $Count) {
            return
        }
        Start-Sleep -Milliseconds 50
    } while ($stopwatch.ElapsedMilliseconds -lt 8000)
    throw "expected $Count blocked sessions for $Prefix, observed $waiting"
}

function Wait-Jobs {
    param([Parameter(Mandatory = $true)][System.Management.Automation.Job[]]$Jobs)
    $Jobs | Wait-Job | Out-Null
    foreach ($job in $Jobs) {
        Receive-Job -Job $job
        if ($job.State -ne 'Completed') {
            throw "concurrent session failed: $($job.ChildJobs[0].JobStateInfo.Reason)"
        }
    }
    $Jobs | Remove-Job
}

$run = [guid]::NewGuid().ToString('N')
$owner = [guid]::NewGuid()
$household = [guid]::NewGuid()
$account = [guid]::NewGuid()
$identity = [guid]::NewGuid()
$connection = [guid]::NewGuid()
$workerJob1 = [guid]::NewGuid()
$workerJob2 = [guid]::NewGuid()
$worker1 = [guid]::NewGuid()
$worker2 = [guid]::NewGuid()
$gateKey = [long](Get-Random -Minimum 100000000 -Maximum 2000000000)

Invoke-LocalPsql @"
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '$owner', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revoke-conc-$run@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
INSERT INTO users (id, email, display_name)
VALUES ('$owner', 'revoke-conc-user-$run@example.invalid', 'Revocation Concurrency');
INSERT INTO households (id, name, created_by)
VALUES ('$household', 'Revocation Concurrency $run', '$owner');
INSERT INTO household_members (household_id, user_id, role)
VALUES ('$household', '$owner', 'owner');
INSERT INTO billing_accounts (id, owner_id) VALUES ('$account', '$owner');
INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
) VALUES ('$identity', '$account', 'stripe', 'sandbox', 'cus_revoke_$run', true);
SELECT apply_billing_provider_event(record_billing_provider_event(
    '$account', '$identity', 'stripe', 'sandbox',
    'evt_revoke_$run', 'sub_revoke_$run', NULL,
    now(), now() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'family', 1,
    now() + interval '30 days', NULL, NULL, '$household'
));
INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status
) VALUES (
    '$connection', '$household', '$owner', 'plaid',
    'concurrent-$run', 'Concurrent Institution', 'enc_concurrent_$run', 'active'
);
"@

$operationScript = {
    param($ContainerName, $ApplicationName, $Sql)
    $command = "SET application_name = '$ApplicationName'; $Sql"
    docker exec $ContainerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c $command
    if ($LASTEXITCODE -ne 0) {
        throw "operation failed for $ApplicationName"
    }
}

$householdLock = docker exec $Container psql -U supabase_admin -d postgres -q -A -t -c `
    "SELECT bank_connection_reservation_lock_key('$household');"
if ($LASTEXITCODE -ne 0) {
    throw 'could not resolve the household lock key'
}
$operationGate = Start-Gate -Key ([long]$householdLock)
$prefix = "revoke_operation_$run"
$jobs = @(
    Start-Job -ScriptBlock $operationScript -ArgumentList `
        $Container, "${prefix}_disconnect", `
        "SELECT * FROM enqueue_bank_connection_revocation('$connection','$owner','disconnect');"
    Start-Job -ScriptBlock $operationScript -ArgumentList `
        $Container, "${prefix}_downgrade", `
        "SELECT reconcile_bank_connections_to_allowance('$household','family','free',0);"
    Start-Job -ScriptBlock $operationScript -ArgumentList `
        $Container, "${prefix}_delete", `
        "SELECT enqueue_bank_revocations_for_erasure('$owner',ARRAY['$household']::uuid[]);"
)
Wait-ForWaiters -Prefix $prefix -Count 3
Stop-Gate -Process $operationGate -Key ([long]$householdLock)
Wait-Jobs -Jobs $jobs

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF (
        SELECT count(*)
        FROM bank_connection_orphaned_items
        WHERE dedupe_key = digest('$connection'::text, 'sha256')
          AND status IN ('pending_revocation', 'pending_reconciliation', 'exhausted')
    ) <> 1 THEN
        RAISE EXCEPTION 'concurrent operations created duplicate revocation jobs';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM bank_connection_orphaned_items
        WHERE dedupe_key = digest('$connection'::text, 'sha256')
          AND household_id IS NULL
          AND owner_id IS NULL
          AND connection_id IS NULL
    ) THEN
        RAISE EXCEPTION 'account deletion did not sever beneficiary identity';
    END IF;
    IF (SELECT status FROM bank_connections WHERE id = '$connection') <> 'revocation_pending' THEN
        RAISE EXCEPTION 'concurrent operation left synchronization enabled';
    END IF;
END;
`$`$;

UPDATE bank_connection_orphaned_items
SET next_attempt_at = now() + interval '1 day'
WHERE dedupe_key = digest('$connection'::text, 'sha256');

INSERT INTO bank_connection_orphaned_items (
    id, provider, encrypted_access_token, status, attempts,
    source_reason, next_attempt_at, retain_until
) VALUES
    (
        '$workerJob1', 'plaid', 'enc_worker_1_$run', 'pending_revocation', 0,
        'finalization', now(), now() + interval '1 day'
    ),
    (
        '$workerJob2', 'mx', 'enc_worker_2_$run', 'pending_revocation', 0,
        'finalization', now(), now() + interval '1 day'
    );
"@

$claimScript = {
    param($ContainerName, $ApplicationName, $WorkerId, $Gate)
    $sql = @"
BEGIN;
SET LOCAL application_name = '$ApplicationName';
SELECT id FROM claim_bank_revocation_jobs('$WorkerId', 1, 120);
SELECT pg_advisory_xact_lock($Gate);
COMMIT;
"@
    docker exec $ContainerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "worker claim failed for $ApplicationName"
    }
}

$workerGateKey = $gateKey + 1
$workerGate = Start-Gate -Key $workerGateKey
$workerPrefix = "revoke_worker_$run"
$workerJobs = @(
    Start-Job -ScriptBlock $claimScript -ArgumentList `
        $Container, "${workerPrefix}_1", $worker1, $workerGateKey
    Start-Job -ScriptBlock $claimScript -ArgumentList `
        $Container, "${workerPrefix}_2", $worker2, $workerGateKey
)
Wait-ForWaiters -Prefix $workerPrefix -Count 2
Stop-Gate -Process $workerGate -Key $workerGateKey
Wait-Jobs -Jobs $workerJobs

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF (
        SELECT count(DISTINCT claimed_by)
        FROM bank_connection_orphaned_items
        WHERE id IN ('$workerJob1', '$workerJob2')
    ) <> 2 THEN
        RAISE EXCEPTION 'concurrent workers did not claim distinct rows';
    END IF;
    IF (
        SELECT count(*)
        FROM bank_connection_orphaned_items
        WHERE id IN ('$workerJob1', '$workerJob2')
          AND attempts = 1
    ) <> 2 THEN
        RAISE EXCEPTION 'a worker job was lost or claimed more than once';
    END IF;
END;
`$`$;
"@

Write-Output 'PASS: durable bank revocation concurrency invariants'
