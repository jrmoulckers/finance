# SPDX-License-Identifier: BUSL-1.1

<#
.SYNOPSIS
    Runs the `entitlements-v1` gateway integration suite against a local
    Supabase stack (#4403).

.DESCRIPTION
    Handler-level unit tests cannot prove what a *deployed* request receives:
    with gateway JWT verification enabled, Supabase refuses a missing,
    malformed, or expired credential before the function runs, and the caller
    gets the gateway's shape instead of the documented `unauthenticated`
    envelope. This harness drives the real local gateway so that boundary is
    verified rather than assumed.

    The gateway port is read from `supabase/config.toml` and the local signing
    key from the running auth container, so nothing is hard-coded and no
    credential is committed. The key is used only to mint an expired token
    against a disposable local stack; it is never printed.

    The harness only targets a local stack. It refuses any non-loopback
    gateway, so it cannot be pointed at staging or production.

.EXAMPLE
    # From services/api, with the local stack running and functions served:
    npx supabase start
    npx supabase functions serve --env-file <local-env-file>
    .\supabase\tests\entitlement-gateway.integration.test.ps1
#>

param(
    [string]$ApiUrl,
    [string]$JwtSecret,
    [string]$ServiceRoleKey,
    [string]$Container = 'supabase_auth_finance-local'
)

$ErrorActionPreference = 'Stop'

$servicesApi = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$functionsDir = Join-Path $servicesApi 'supabase/functions'
$configPath = Join-Path $servicesApi 'supabase/config.toml'

function Get-ConfiguredApiUrl {
    if (-not (Test-Path $configPath)) {
        throw "Could not read $configPath to determine the local API port."
    }
    $apiSection = $false
    foreach ($line in (Get-Content $configPath)) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^\[(.+)\]$') {
            $apiSection = ($Matches[1] -eq 'api')
            continue
        }
        if ($apiSection -and $trimmed -match '^port\s*=\s*(\d+)') {
            return "http://127.0.0.1:$($Matches[1])"
        }
    }
    throw 'Could not find an [api] port in supabase/config.toml.'
}

function Get-LocalJwtSecret {
    # Read from the running auth container rather than any committed file, so
    # the harness never carries a credential of its own.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $envLines = & docker exec $Container env 2>&1
        $dockerExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($dockerExit -ne 0) {
        throw @"
Could not read the local signing key from container '$Container'.
Start the local stack first:
  cd services/api
  npx supabase start
  npx supabase functions serve --env-file <local-env-file>
"@
    }
    foreach ($line in $envLines) {
        if ("$line" -match '^GOTRUE_JWT_SECRET=(.+)$') {
            return $Matches[1]
        }
    }
    throw "Container '$Container' did not expose a local signing key."
}

function Get-LocalServiceRoleKey {
    param([string]$RuntimeContainer = 'supabase_edge_runtime_finance-local')

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $envLines = & docker exec $RuntimeContainer env 2>&1
        $dockerExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($dockerExit -ne 0) { return $null }
    foreach ($line in $envLines) {
        if ("$line" -match '^SUPABASE_SERVICE_ROLE_KEY=(.+)$') {
            return $Matches[1]
        }
    }
    return $null
}

if (-not $ApiUrl) { $ApiUrl = Get-ConfiguredApiUrl }
if (-not $JwtSecret) { $JwtSecret = Get-LocalJwtSecret }
if (-not $ServiceRoleKey) { $ServiceRoleKey = Get-LocalServiceRoleKey }

# Refuse anything that is not a local stack. This suite mints tokens and must
# never be aimed at a shared environment.
$parsedUrl = [System.Uri]$ApiUrl
if ($parsedUrl.Host -notin @('127.0.0.1', 'localhost', '::1')) {
    throw "Refusing to run against a non-local gateway: $($parsedUrl.Host)"
}

$gatewayUrl = "$($ApiUrl.TrimEnd('/'))/functions/v1/entitlements-v1"

# Fail fast with an actionable message when the function is reachable but the
# deployment is misconfigured, so a 503 is not mistaken for a contract failure.
# Uses HttpClient directly because `Invoke-WebRequest -SkipHttpErrorCheck` does
# not exist in Windows PowerShell 5.1, which `npm run` launches.
Add-Type -AssemblyName System.Net.Http
$httpClient = [System.Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromSeconds(30)
try {
    $probeStatus = [int]$httpClient.GetAsync($gatewayUrl).GetAwaiter().GetResult().StatusCode
} catch {
    throw "Could not reach $gatewayUrl. Is 'supabase functions serve' running?"
} finally {
    $httpClient.Dispose()
}
if ($probeStatus -eq 503) {
    throw @'
The endpoint answered 503, so its environment is incomplete. Serve the
functions with an env file that sets ALLOWED_ORIGINS, for example:
  npx supabase functions serve --env-file <local-env-file>
'@
}

Write-Host "Running entitlements-v1 gateway integration suite against $gatewayUrl"

$env:ENTITLEMENTS_GATEWAY_URL = $gatewayUrl
$env:ENTITLEMENTS_TEST_JWT_SECRET = $JwtSecret
if ($ServiceRoleKey) { $env:ENTITLEMENTS_TEST_SERVICE_ROLE_KEY = $ServiceRoleKey }
try {
    Push-Location $functionsDir
    try {
        & deno test --allow-env --allow-net --no-check `
            entitlements-v1/gateway.integration.test.ts
        if ($LASTEXITCODE -ne 0) {
            throw 'entitlements-v1 gateway integration suite failed'
        }
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item Env:ENTITLEMENTS_GATEWAY_URL -ErrorAction SilentlyContinue
    Remove-Item Env:ENTITLEMENTS_TEST_JWT_SECRET -ErrorAction SilentlyContinue
    Remove-Item Env:ENTITLEMENTS_TEST_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}

Write-Host 'entitlements-v1 gateway integration suite passed'
