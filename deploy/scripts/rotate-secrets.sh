#!/usr/bin/env bash
# =============================================================================
# Finance App — Secret Rotation Script
# =============================================================================
#
# Rotates application secrets on a configurable schedule. Generates new
# secrets, updates the .env file, and restarts affected services.
#
# Features:
#   - Selective rotation (rotate individual secrets or all at once)
#   - Pre-rotation backup of the current .env file
#   - Dry-run mode to preview changes without applying them
#   - Structured JSON logging for audit trail
#   - Docker Compose service restart after rotation
#
# Usage:
#   ./rotate-secrets.sh --all              # Rotate all secrets
#   ./rotate-secrets.sh --jwt              # Rotate JWT secret only
#   ./rotate-secrets.sh --webhook          # Rotate webhook secret only
#   ./rotate-secrets.sh --cron             # Rotate cron secret only
#   ./rotate-secrets.sh --mongo            # Rotate MongoDB password only
#   ./rotate-secrets.sh --postgres         # Rotate PostgreSQL password only
#   ./rotate-secrets.sh --backup-key       # Rotate backup encryption key only
#   ./rotate-secrets.sh --dry-run --all    # Preview all rotations
#
# Environment:
#   ENV_FILE — Path to the .env file (default: ../../deploy/.env)
#   COMPOSE_DIR — Path to the Docker Compose directory (default: ../../deploy)
#
# Issues: #899
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../../deploy/.env}"
COMPOSE_DIR="${COMPOSE_DIR:-${SCRIPT_DIR}/../../deploy}"
DRY_RUN=false
ROTATIONS=()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() {
    local level="$1"
    shift
    echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"level\":\"${level}\",\"component\":\"secret-rotation\",\"message\":\"$*\"}"
}

# ---------------------------------------------------------------------------
# Secret Generation
# ---------------------------------------------------------------------------
generate_base64_secret() {
    openssl rand -base64 "${1:-32}"
}

generate_hex_secret() {
    openssl rand -hex "${1:-32}"
}

generate_password() {
    # Alphanumeric + special chars, URL-safe
    openssl rand -base64 "${1:-24}" | tr -d '=/+' | head -c "${1:-24}"
}

# ---------------------------------------------------------------------------
# .env File Operations
# ---------------------------------------------------------------------------
backup_env() {
    local timestamp
    timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
    local backup_path="${ENV_FILE}.backup.${timestamp}"

    if [ ! -f "${ENV_FILE}" ]; then
        log "ERROR" ".env file not found at ${ENV_FILE}"
        exit 1
    fi

    cp "${ENV_FILE}" "${backup_path}"
    chmod 600 "${backup_path}"
    log "INFO" "Backed up .env to ${backup_path}"
}

update_env_var() {
    local key="$1"
    local value="$2"

    if [ "${DRY_RUN}" = true ]; then
        log "INFO" "[DRY RUN] Would rotate ${key} → <redacted ${#value} chars>"
        return
    fi

    if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
        # Use a different delimiter to avoid issues with / in values
        sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
        log "INFO" "Rotated ${key} (${#value} chars)"
    else
        log "WARN" "${key} not found in .env — skipping"
    fi
}

# ---------------------------------------------------------------------------
# Service Restart
# ---------------------------------------------------------------------------
restart_services() {
    local services=("$@")

    if [ "${DRY_RUN}" = true ]; then
        log "INFO" "[DRY RUN] Would restart services: ${services[*]}"
        return
    fi

    log "INFO" "Restarting services: ${services[*]}"
    cd "${COMPOSE_DIR}"

    for service in "${services[@]}"; do
        docker compose restart "${service}" 2>/dev/null || \
            log "WARN" "Failed to restart ${service} — may need manual intervention"
    done

    log "INFO" "Service restart complete"
}

# ---------------------------------------------------------------------------
# Rotation Functions
# ---------------------------------------------------------------------------
rotate_jwt_secret() {
    log "INFO" "Rotating JWT_SECRET..."
    local new_secret
    new_secret=$(generate_base64_secret 32)
    update_env_var "JWT_SECRET" "${new_secret}"

    if [ "${DRY_RUN}" = false ]; then
        # JWT rotation requires regenerating ANON_KEY and SERVICE_ROLE_KEY
        log "WARN" "JWT_SECRET rotated — you MUST regenerate ANON_KEY and SERVICE_ROLE_KEY"
        log "WARN" "Use https://supabase.com/docs/guides/self-hosting#api-keys with the new JWT_SECRET"
        log "WARN" "All active user sessions will be invalidated"
    fi
}

rotate_webhook_secret() {
    log "INFO" "Rotating AUTH_WEBHOOK_SECRET..."
    local new_secret
    new_secret=$(generate_hex_secret 32)
    update_env_var "AUTH_WEBHOOK_SECRET" "${new_secret}"
}

rotate_cron_secret() {
    log "INFO" "Rotating CRON_SECRET..."
    local new_secret
    new_secret=$(generate_hex_secret 32)
    update_env_var "CRON_SECRET" "${new_secret}"
}

rotate_mongo_password() {
    log "INFO" "Rotating MONGO_PASSWORD..."
    local new_password
    new_password=$(generate_password 24)
    update_env_var "MONGO_PASSWORD" "${new_password}"

    # Update the MongoDB URI that embeds the password
    local mongo_user
    mongo_user=$(grep "^MONGO_USER=" "${ENV_FILE}" | cut -d= -f2)
    mongo_user="${mongo_user:-powersync}"
    local new_uri="mongodb://${mongo_user}:${new_password}@mongo:27017/powersync?authSource=admin"
    update_env_var "POWERSYNC_MONGO_URI" "${new_uri}"

    if [ "${DRY_RUN}" = false ]; then
        log "WARN" "MongoDB password rotated — you must also update the password inside MongoDB:"
        log "WARN" "  docker compose exec mongo mongosh -u <old_user> -p <old_pass> --eval \"db.changeUserPassword('${mongo_user}', '${new_password}')\""
    fi
}

rotate_postgres_password() {
    log "INFO" "Rotating POSTGRES_PASSWORD..."
    local new_password
    new_password=$(generate_password 32)
    update_env_var "POSTGRES_PASSWORD" "${new_password}"

    if [ "${DRY_RUN}" = false ]; then
        log "WARN" "PostgreSQL password rotated — you must also update the password inside PostgreSQL:"
        log "WARN" "  docker compose exec db psql -U postgres -c \"ALTER USER postgres PASSWORD '${new_password}';\""
        log "WARN" "Then restart ALL services that connect to the database"
    fi
}

rotate_backup_key() {
    log "INFO" "Rotating BACKUP_ENCRYPTION_KEY..."
    local new_key
    new_key=$(generate_base64_secret 32)

    # Update in backup .env if it exists
    local backup_env="${COMPOSE_DIR}/backup/.env"
    if [ -f "${backup_env}" ]; then
        if grep -q "^BACKUP_ENCRYPTION_KEY=" "${backup_env}" 2>/dev/null; then
            if [ "${DRY_RUN}" = false ]; then
                sed -i "s|^BACKUP_ENCRYPTION_KEY=.*|BACKUP_ENCRYPTION_KEY=${new_key}|" "${backup_env}"
                log "INFO" "Updated BACKUP_ENCRYPTION_KEY in backup/.env"
            else
                log "INFO" "[DRY RUN] Would update BACKUP_ENCRYPTION_KEY in backup/.env"
            fi
        fi
    fi

    if [ "${DRY_RUN}" = false ]; then
        log "WARN" "CRITICAL: Old backups encrypted with the PREVIOUS key cannot be decrypted with the new key"
        log "WARN" "Store the old key securely until all old backups expire"
    fi
}

# ---------------------------------------------------------------------------
# Determine which services to restart based on rotations
# ---------------------------------------------------------------------------
get_affected_services() {
    local services=()

    for rotation in "${ROTATIONS[@]}"; do
        case "${rotation}" in
            jwt)       services+=(rest auth edge-functions powersync) ;;
            webhook)   services+=(edge-functions) ;;
            cron)      services+=(edge-functions) ;;
            mongo)     services+=(mongo powersync) ;;
            postgres)  services+=(db rest auth meta edge-functions powersync) ;;
            backup-key) ;; # No service restart needed
        esac
    done

    # Deduplicate
    printf '%s\n' "${services[@]}" | sort -u | tr '\n' ' '
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)    DRY_RUN=true; shift ;;
            --all)        ROTATIONS=(jwt webhook cron mongo backup-key); shift ;;
            --jwt)        ROTATIONS+=(jwt); shift ;;
            --webhook)    ROTATIONS+=(webhook); shift ;;
            --cron)       ROTATIONS+=(cron); shift ;;
            --mongo)      ROTATIONS+=(mongo); shift ;;
            --postgres)   ROTATIONS+=(postgres); shift ;;
            --backup-key) ROTATIONS+=(backup-key); shift ;;
            -h|--help)
                echo "Usage: $0 [--dry-run] [--all|--jwt|--webhook|--cron|--mongo|--postgres|--backup-key]"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Usage: $0 [--dry-run] [--all|--jwt|--webhook|--cron|--mongo|--postgres|--backup-key]"
                exit 1
                ;;
        esac
    done

    if [ ${#ROTATIONS[@]} -eq 0 ]; then
        echo "No rotations specified. Use --help for usage."
        exit 1
    fi

    log "INFO" "Starting secret rotation (dry_run=${DRY_RUN}, rotations=${ROTATIONS[*]})"

    # Backup current .env
    if [ "${DRY_RUN}" = false ]; then
        backup_env
    fi

    # Execute rotations
    for rotation in "${ROTATIONS[@]}"; do
        case "${rotation}" in
            jwt)        rotate_jwt_secret ;;
            webhook)    rotate_webhook_secret ;;
            cron)       rotate_cron_secret ;;
            mongo)      rotate_mongo_password ;;
            postgres)   rotate_postgres_password ;;
            backup-key) rotate_backup_key ;;
        esac
    done

    # Restart affected services
    local affected
    affected=$(get_affected_services)
    if [ -n "${affected}" ]; then
        # shellcheck disable=SC2086
        restart_services ${affected}
    fi

    log "INFO" "Secret rotation complete"
}

main "$@"
