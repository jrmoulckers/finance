#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "ALTER ROLE authenticator WITH PASSWORD :'authenticator_password';" |
    psql \
        -v ON_ERROR_STOP=1 \
        --set=authenticator_password="${POSTGRES_PASSWORD:-postgres}" \
        --username "${POSTGRES_USER:-supabase_admin}" \
        --dbname "${POSTGRES_DB:-postgres}"

for migration in /docker-entrypoint-initdb.d/finance-migrations/*.sql; do
    psql \
        -v ON_ERROR_STOP=1 \
        --username "${POSTGRES_USER:-supabase_admin}" \
        --dbname "${POSTGRES_DB:-postgres}" \
        --file "$migration"
done
