#!/bin/bash
# =============================================================================
# Supabase schema, role, and init-scripts initialization
# =============================================================================
# The supabase/postgres image ships SQL files in /docker-entrypoint-initdb.d/init-scripts/
# but Docker's postgres entrypoint ignores subdirectories. This script:
#   1. Creates roles and schemas FIRST (GoTrue and init-scripts depend on these)
#   2. Then processes the init-scripts directory (creates base types like factor_type)
# GoTrue runs its own migrations on top of this foundation.
# =============================================================================

set -e

echo "Step 1: Creating Supabase roles and schemas..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
    -- Roles required by Supabase services
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
            CREATE ROLE supabase_admin LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
            CREATE ROLE authenticator NOINHERIT LOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role NOLOGIN BYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
            CREATE ROLE supabase_auth_admin NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
            CREATE ROLE supabase_storage_admin NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_functions_admin') THEN
            CREATE ROLE supabase_functions_admin NOLOGIN;
        END IF;
    END
    $$;

    -- Role memberships
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
    GRANT service_role TO authenticator;
    GRANT supabase_admin TO postgres;

    -- Schemas (must exist BEFORE init-scripts run)
    CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
    CREATE SCHEMA IF NOT EXISTS extensions;

    -- Permissions
    GRANT USAGE ON SCHEMA auth TO supabase_auth_admin, service_role, postgres;
    GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
    ALTER ROLE supabase_auth_admin SET search_path = 'auth';
    ALTER ROLE authenticator SET statement_timeout = '8s';
EOSQL

echo "Step 1 complete: roles and schemas created."

# Step 2: Process supabase init-scripts (creates base types, functions, etc.)
INIT_SCRIPTS_DIR="/docker-entrypoint-initdb.d/init-scripts"
if [ -d "$INIT_SCRIPTS_DIR" ]; then
    echo "Step 2: Processing init-scripts directory..."
    for f in $(find "$INIT_SCRIPTS_DIR" -name '*.sql' | sort); do
        echo "  Running: $f"
        psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
    done
    echo "Step 2 complete: init-scripts processed."
else
    echo "Step 2: No init-scripts directory found (skipping)."
fi
