#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# =============================================================================
# Finance App — Local Supabase Setup Script
# =============================================================================
# Usage:
#   bash services/api/scripts/setup-local.sh        # from repo root
#   bash scripts/setup-local.sh                     # from services/api/
#
# What it does:
#   1. Verifies prerequisites (Docker, Supabase CLI)
#   2. Starts local Supabase stack (supabase start)
#   3. Migrations are applied automatically by the CLI
#   4. Seeds the database with test data
#   5. Prints connection info and generated keys
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPABASE_DIR="$API_DIR/supabase"

# ---------------------------------------------------------------------------
# Colours (disabled when not a terminal)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' NC=''
fi

info()  { printf "${CYAN}ℹ${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}✔${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC}  %s\n" "$*"; }
fail()  { printf "${RED}✖${NC}  %s\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Step 1 — Check prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites …"

if ! command -v docker &>/dev/null; then
    fail "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
fi

if ! docker info &>/dev/null; then
    fail "Docker daemon is not running. Please start Docker Desktop and retry."
fi

ok "Docker is available"

if ! command -v supabase &>/dev/null; then
    fail "Supabase CLI is not installed. Install via: npm i -g supabase  (or)  brew install supabase/tap/supabase"
fi

ok "Supabase CLI is available ($(supabase --version 2>/dev/null || echo 'unknown version'))"

# ---------------------------------------------------------------------------
# Step 2 — Start Supabase (migrations run automatically)
# ---------------------------------------------------------------------------
info "Starting local Supabase stack …"
info "Working directory: $SUPABASE_DIR"

cd "$API_DIR"

# supabase start is idempotent — re-running it is safe
SUPABASE_OUTPUT=$(supabase start 2>&1) || {
    echo "$SUPABASE_OUTPUT"
    fail "supabase start failed — see output above."
}

ok "Supabase stack is running"

# ---------------------------------------------------------------------------
# Step 3 — Seed database
# ---------------------------------------------------------------------------
info "Applying seed data …"

if [ -f "$SUPABASE_DIR/seed.sql" ]; then
    supabase db reset --no-confirm 2>/dev/null || {
        warn "db reset returned non-zero; seed data may already be loaded."
    }
    ok "Database reset with migrations and seed data applied"
else
    warn "No seed.sql found — skipping seed step."
fi

# ---------------------------------------------------------------------------
# Step 4 — Print status
# ---------------------------------------------------------------------------
printf "\n${BOLD}════════════════════════════════════════════════════════════${NC}\n"
printf "${BOLD}  Finance — Local Supabase Stack${NC}\n"
printf "${BOLD}════════════════════════════════════════════════════════════${NC}\n\n"

supabase status 2>/dev/null || true

printf "\n${BOLD}Quick links:${NC}\n"
printf "  Studio UI       → ${CYAN}http://localhost:54323${NC}\n"
printf "  API (PostgREST) → ${CYAN}http://localhost:54321${NC}\n"
printf "  Database        → ${CYAN}postgresql://postgres:postgres@localhost:54322/postgres${NC}\n"
printf "  Inbucket (mail) → ${CYAN}http://localhost:54324${NC}\n"

printf "\n${BOLD}Useful commands:${NC}\n"
printf "  npm run supabase:stop    — Stop the stack\n"
printf "  npm run supabase:reset   — Reset DB with migrations + seed\n"
printf "  npm run supabase:migrate — Apply pending migrations only\n"
printf "  supabase functions serve — Run Edge Functions locally\n"

printf "\n${BOLD}Tip:${NC} Copy the anon/service-role keys above into ${CYAN}.env${NC}\n\n"
