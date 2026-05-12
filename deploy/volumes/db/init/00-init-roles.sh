#!/bin/bash
# =============================================================================
# Supabase role initialization
# =============================================================================
# The supabase/postgres image ships SQL files in /docker-entrypoint-initdb.d/init-scripts/
# but Docker's standard postgres entrypoint ignores directories. This script
# processes all .sql files in that directory before migrate.sh runs.
#
# Naming starts with "00-" to ensure alphabetical execution before migrate.sh.
# =============================================================================

set -e

INIT_SCRIPTS_DIR="/docker-entrypoint-initdb.d/init-scripts"

if [ -d "$INIT_SCRIPTS_DIR" ]; then
    echo "Processing init-scripts directory..."
    for f in $(find "$INIT_SCRIPTS_DIR" -name '*.sql' | sort); do
        echo "  Running: $f"
        psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
    done
    echo "Init-scripts processing complete."
else
    echo "WARNING: $INIT_SCRIPTS_DIR not found — creating roles manually..."

    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
        -- Core Supabase roles
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
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dashboard_user') THEN
                CREATE ROLE dashboard_user NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pgbouncer') THEN
                CREATE ROLE pgbouncer NOLOGIN;
            END IF;
        END
        $$;

        -- Grant necessary permissions
        GRANT anon TO authenticator;
        GRANT authenticated TO authenticator;
        GRANT service_role TO authenticator;
        GRANT supabase_admin TO postgres;

        -- Set passwords
        ALTER ROLE authenticator SET statement_timeout = '8s';
        ALTER ROLE supabase_admin WITH PASSWORD current_setting('app.settings.jwt_secret', true);
EOSQL

    echo "Manual role creation complete."
fi
