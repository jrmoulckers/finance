# SPDX-License-Identifier: BUSL-1.1
# =============================================================================
# Finance App — Local Supabase Setup Script (PowerShell)
# =============================================================================
# Usage:
#   .\services\api\scripts\setup-local.ps1       # from repo root
#   .\scripts\setup-local.ps1                    # from services\api\
#
# What it does:
#   1. Verifies prerequisites (Docker, Supabase CLI)
#   2. Starts local Supabase stack (supabase start)
#   3. Migrations are applied automatically by the CLI
#   4. Seeds the database with test data
#   5. Prints connection info and generated keys
# =============================================================================

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ApiDir      = Split-Path -Parent $ScriptDir
$SupabaseDir = Join-Path $ApiDir "supabase"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Info  { param([string]$msg) Write-Host "i  $msg" -ForegroundColor Cyan }
function Ok    { param([string]$msg) Write-Host "+  $msg" -ForegroundColor Green }
function Warn  { param([string]$msg) Write-Host "!  $msg" -ForegroundColor Yellow }
function Fail  { param([string]$msg) Write-Host "x  $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Step 1 — Check prerequisites
# ---------------------------------------------------------------------------
Info "Checking prerequisites ..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
}

try {
    docker info 2>&1 | Out-Null
} catch {
    Fail "Docker daemon is not running. Please start Docker Desktop and retry."
}

Ok "Docker is available"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Fail "Supabase CLI is not installed. Install via: npm i -g supabase  (or)  scoop install supabase"
}

$sbVersion = & supabase --version 2>&1
Ok "Supabase CLI is available ($sbVersion)"

# ---------------------------------------------------------------------------
# Step 2 — Start Supabase (migrations run automatically)
# ---------------------------------------------------------------------------
Info "Starting local Supabase stack ..."
Info "Working directory: $SupabaseDir"

Push-Location $ApiDir

try {
    $output = & supabase start 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $output
        Fail "supabase start failed — see output above."
    }
    Ok "Supabase stack is running"
} catch {
    Fail "supabase start failed: $_"
}

# ---------------------------------------------------------------------------
# Step 3 — Seed database
# ---------------------------------------------------------------------------
Info "Applying seed data ..."

$seedFile = Join-Path $SupabaseDir "seed.sql"
if (Test-Path $seedFile) {
    & supabase db reset 2>&1 | Out-Null
    Ok "Database reset with migrations and seed data applied"
} else {
    Warn "No seed.sql found — skipping seed step."
}

# ---------------------------------------------------------------------------
# Step 4 — Print status
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Finance - Local Supabase Stack" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""

& supabase status 2>&1 | Write-Host

Write-Host ""
Write-Host "Quick links:" -ForegroundColor White
Write-Host "  Studio UI       -> http://localhost:54323" -ForegroundColor Cyan
Write-Host "  API (PostgREST) -> http://localhost:54321" -ForegroundColor Cyan
Write-Host "  Database        -> postgresql://postgres:postgres@localhost:54322/postgres" -ForegroundColor Cyan
Write-Host "  Inbucket (mail) -> http://localhost:54324" -ForegroundColor Cyan

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor White
Write-Host "  npm run supabase:stop    - Stop the stack"
Write-Host "  npm run supabase:reset   - Reset DB with migrations + seed"
Write-Host "  npm run supabase:migrate - Apply pending migrations only"
Write-Host "  supabase functions serve - Run Edge Functions locally"

Write-Host ""
Write-Host "Tip: Copy the anon/service-role keys above into .env" -ForegroundColor Yellow
Write-Host ""

Pop-Location
