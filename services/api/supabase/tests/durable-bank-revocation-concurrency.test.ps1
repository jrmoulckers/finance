# SPDX-License-Identifier: BUSL-1.1

# Real PostgreSQL concurrency coverage for #4405. Requires the disposable
# migrated container created by `supabase start`.

param(
    [Parameter(Mandatory = $true)]
    [string]$Container
)

$ErrorActionPreference = 'Stop'

function Invoke-LocalPsql {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $output = $Sql | docker exec -e PGPASSWORD -i $Container psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -A -t
    if ($LASTEXITCODE -ne 0) {
        throw 'psql failed in the isolated durable-revocation database'
    }
    return $output
}

function Wait-Jobs {
    param([Parameter(Mandatory = $true)][System.Management.Automation.Job[]]$Jobs)

    $Jobs | Wait-Job -Timeout 15 | Out-Null
    foreach ($job in $Jobs) {
        if ($job.State -ne 'Completed') {
            throw "Concurrent database session failed to complete: $($job.State)"
        }
    }
}

$run = [guid]::NewGuid().ToString('N')
$owner = [guid]::NewGuid()
$account = [guid]::NewGuid()
$identity = [guid]::NewGuid()
$household = [guid]::NewGuid()
$membership = [guid]::NewGuid()
$connections = 1..4 | ForEach-Object { [guid]::NewGuid() }

Invoke-LocalPsql @"
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '$owner', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revocation-conc-$run@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
INSERT INTO users (id, email, display_name) VALUES
    ('$owner', 'revocation-conc-user-$run@example.invalid', 'Revocation Concurrency Owner');
INSERT INTO households (id, name, created_by) VALUES
    ('$household', 'Revocation Concurrency $run', '$owner');
INSERT INTO household_members (id, household_id, user_id, role) VALUES
    ('$membership', '$household', '$owner', 'owner');
INSERT INTO billing_accounts (id, owner_id) VALUES ('$account', '$owner');
INSERT INTO billing_provider_identities (
    id, billing_account_id, provider, environment, provider_customer_id, is_primary
) VALUES ('$identity', '$account', 'stripe', 'sandbox', 'cus_rev_$run', true);
SELECT apply_billing_provider_event(record_billing_provider_event(
    '$account', '$identity', 'stripe', 'sandbox',
    'evt_${run}_premium', 'sub_${run}_premium', NULL,
    now(), now() - interval '1 day', 1,
    'activated', 'active', 'base_plan', 'premium', 1,
    now() + interval '30 days', NULL, NULL, NULL
));
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$owner', true);
SELECT set_my_premium_household_sponsorship('$household');
COMMIT;
UPDATE current_household_entitlements
SET display_tier = 'family',
    is_premium_sponsored = false,
    bank_connection_allowance = 4
WHERE household_id = '$household';
INSERT INTO bank_connections (
    id, household_id, owner_id, provider, institution_id, institution_name,
    encrypted_access_token, status, created_at
) VALUES
    ('$($connections[0])', '$household', '$owner', 'plaid', 'ins_1', 'One', 'enc_1', 'active', now() - interval '4 days'),
    ('$($connections[1])', '$household', '$owner', 'mx', 'ins_2', 'Two', 'enc_2', 'active', now() - interval '3 days'),
    ('$($connections[2])', '$household', '$owner', 'plaid', 'ins_3', 'Three', 'enc_3', 'active', now() - interval '2 days'),
    ('$($connections[3])', '$household', '$owner', 'mx', 'ins_4', 'Four', 'enc_4', 'active', now() - interval '1 day');
"@

$actionScript = {
    param($ContainerName, $Sql)
    $Sql | docker exec -e PGPASSWORD -i $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) {
        throw 'concurrent revocation action failed'
    }
}

# Projection downgrade, explicit disconnect, and account erasure all acquire the
# same household/row locks and converge on one outbox row per connection.
$downgradeSql = @"
UPDATE current_household_entitlements
SET display_tier = 'premium',
    is_premium_sponsored = true,
    bank_connection_allowance = 2
WHERE household_id = '$household';
"@
$disconnectSql = "SELECT enqueue_bank_connection_revocation('$($connections[2])', 'user_disconnect', '$owner');"
$deletionSql = "SELECT prepare_bank_connection_erasure('$owner', ARRAY['$household']::uuid[]);"

$actionJobs = @(
    Start-Job -ScriptBlock $actionScript -ArgumentList $Container, $downgradeSql
    Start-Job -ScriptBlock $actionScript -ArgumentList $Container, $disconnectSql
    Start-Job -ScriptBlock $actionScript -ArgumentList $Container, $deletionSql
)
Wait-Jobs -Jobs $actionJobs
foreach ($job in $actionJobs) {
    Receive-Job -Job $job | Out-Null
    Remove-Job -Job $job
}

Invoke-LocalPsql @"
DO `$`$
BEGIN
    IF (
        SELECT count(*) <> 4 OR count(DISTINCT connection_id) <> 4
        FROM bank_connection_orphaned_items
        WHERE connection_id = ANY(ARRAY[
            '$($connections[0])', '$($connections[1])',
            '$($connections[2])', '$($connections[3])'
        ]::uuid[])
    ) THEN
        RAISE EXCEPTION 'concurrent actions did not preserve one retry row per connection';
    END IF;

    IF EXISTS (
        SELECT connection_id
        FROM bank_connection_orphaned_items
        WHERE connection_id = ANY(ARRAY[
            '$($connections[0])', '$($connections[1])',
            '$($connections[2])', '$($connections[3])'
        ]::uuid[])
        GROUP BY connection_id
        HAVING count(*) <> 1
    ) THEN
        RAISE EXCEPTION 'concurrent actions produced duplicate retry rows';
    END IF;

    IF EXISTS (
        SELECT 1 FROM bank_connections
        WHERE household_id = '$household'
          AND deleted_at IS NULL
          AND sync_enabled
    ) THEN
        RAISE EXCEPTION 'account-erasure race left an Item sync-enabled';
    END IF;

    IF EXISTS (
        SELECT 1 FROM bank_connection_orphaned_items
        WHERE connection_id = ANY(ARRAY[
            '$($connections[0])', '$($connections[1])',
            '$($connections[2])', '$($connections[3])'
        ]::uuid[])
          AND (
              encrypted_access_token IS NULL
              OR owner_id IS NOT NULL
              OR household_id IS NOT NULL
          )
    ) THEN
        RAISE EXCEPTION 'concurrent erasure lost a credential or retained identity';
    END IF;
END;
`$`$;
"@

# Reset rows to due, then hold the first worker's two claims open while a second
# worker claims. SKIP LOCKED must let worker two take the other rows immediately.
Invoke-LocalPsql @"
UPDATE bank_connection_orphaned_items
SET status = 'pending_revocation',
    attempts = 0,
    next_attempt_at = now(),
    claim_token = NULL,
    claim_expires_at = NULL
WHERE connection_id = ANY(ARRAY[
    '$($connections[0])', '$($connections[1])',
    '$($connections[2])', '$($connections[3])'
]::uuid[]);
"@

$workerScript = {
    param($ContainerName, $ApplicationName, $Hold)
    $sleepSql = if ($Hold) { 'SELECT pg_sleep(2);' } else { '' }
    $sql = @"
BEGIN;
SET LOCAL application_name = '$ApplicationName';
SELECT id FROM claim_bank_connection_revocations(2) ORDER BY id;
$sleepSql
COMMIT;
"@
    $result = $sql | docker exec -e PGPASSWORD -i $ContainerName psql -U supabase_admin -d postgres `
        -v ON_ERROR_STOP=1 -q -A -t
    if ($LASTEXITCODE -ne 0) {
        throw "worker claim failed: $ApplicationName"
    }
    return $result
}

$workerOne = Start-Job -ScriptBlock $workerScript `
    -ArgumentList $Container, "revocation_worker_one_$run", $true

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
do {
    $wait = docker exec -e PGPASSWORD $Container psql -U supabase_admin -d postgres -q -A -t -c `
        "SELECT wait_event FROM pg_stat_activity WHERE application_name = 'revocation_worker_one_$run';"
    if ($LASTEXITCODE -ne 0) {
        throw 'could not inspect first worker state'
    }
    if ($wait -eq 'PgSleep') { break }
    Start-Sleep -Milliseconds 50
} while ($stopwatch.ElapsedMilliseconds -lt 5000)
if ($wait -ne 'PgSleep') {
    throw 'first worker did not hold its claimed rows'
}

$workerTwo = Start-Job -ScriptBlock $workerScript `
    -ArgumentList $Container, "revocation_worker_two_$run", $false
Wait-Jobs -Jobs @($workerOne, $workerTwo)
$claimedOne = @(Receive-Job -Job $workerOne | Where-Object { $_ -match '^[0-9a-f-]{36}$' })
$claimedTwo = @(Receive-Job -Job $workerTwo | Where-Object { $_ -match '^[0-9a-f-]{36}$' })
Remove-Job -Job $workerOne
Remove-Job -Job $workerTwo

if ($claimedOne.Count -ne 2 -or $claimedTwo.Count -ne 2) {
    throw "workers did not split all rows: $($claimedOne.Count) + $($claimedTwo.Count)"
}
if (@($claimedOne | Where-Object { $claimedTwo -contains $_ }).Count -ne 0) {
    throw 'concurrent workers claimed the same revocation row'
}

# Explicit cleanup of this uniquely named disposable fixture.
Invoke-LocalPsql @"
DELETE FROM bank_connection_orphaned_items
WHERE connection_id = ANY(ARRAY[
    '$($connections[0])', '$($connections[1])',
    '$($connections[2])', '$($connections[3])'
]::uuid[]);
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

Write-Host 'durable-bank-revocation-concurrency.test.ps1: concurrent actions and claims passed'
