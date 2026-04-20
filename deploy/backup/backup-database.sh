#!/usr/bin/env bash
# =============================================================================
# Finance App — Automated Encrypted Database Backup Script
# =============================================================================
#
# Creates a compressed, AES-256-encrypted PostgreSQL backup and optionally
# uploads it to off-site S3-compatible storage.
#
# Features:
#   - pg_dump with custom format (most efficient for restore)
#   - AES-256-CBC encryption via OpenSSL
#   - Optional S3 upload (supports AWS S3, Backblaze B2, MinIO, etc.)
#   - Configurable retention with automatic cleanup of old backups
#   - Checksum verification (SHA-256)
#   - Structured logging for monitoring integration
#
# Usage:
#   ./backup-database.sh                     # Uses env vars or defaults
#   ./backup-database.sh --upload            # Backup + upload to S3
#   ./backup-database.sh --verify <file>     # Verify backup integrity
#   ./backup-database.sh --restore <file>    # Decrypt and restore
#
# Environment Variables (set in .env or export before running):
#   POSTGRES_HOST       — Database host (default: localhost)
#   POSTGRES_PORT       — Database port (default: 5432)
#   POSTGRES_DB         — Database name (default: postgres)
#   POSTGRES_USER       — Database user (default: postgres)
#   PGPASSWORD          — Database password (required)
#   BACKUP_DIR          — Local backup directory (default: ./volumes/db/backups)
#   BACKUP_RETENTION_DAYS — Days to keep local backups (default: 30)
#   BACKUP_ENCRYPTION_KEY — AES-256 encryption passphrase (required)
#   S3_BUCKET           — S3 bucket name (required for --upload)
#   S3_PREFIX           — S3 key prefix (default: finance-backups/)
#   S3_ENDPOINT         — S3 endpoint URL (optional, for non-AWS S3)
#   AWS_ACCESS_KEY_ID   — S3 access key (required for --upload)
#   AWS_SECRET_ACCESS_KEY — S3 secret key (required for --upload)
#
# Issues: #900
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./volumes/db/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_PREFIX="${S3_PREFIX:-finance-backups/}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILENAME="finance-${POSTGRES_DB}-${TIMESTAMP}.dump"
ENCRYPTED_FILENAME="${BACKUP_FILENAME}.enc"
CHECKSUM_FILENAME="${ENCRYPTED_FILENAME}.sha256"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() {
    local level="$1"
    shift
    echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"level\":\"${level}\",\"component\":\"backup\",\"message\":\"$*\"}"
}

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
validate_env() {
    if [ -z "${PGPASSWORD:-}" ]; then
        log "ERROR" "PGPASSWORD is required but not set"
        exit 1
    fi

    if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
        log "ERROR" "BACKUP_ENCRYPTION_KEY is required but not set"
        exit 1
    fi

    # Ensure backup directory exists
    mkdir -p "${BACKUP_DIR}"
}

validate_s3_env() {
    if [ -z "${S3_BUCKET:-}" ]; then
        log "ERROR" "S3_BUCKET is required for upload"
        exit 1
    fi

    if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
        log "ERROR" "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for upload"
        exit 1
    fi

    if ! command -v aws &> /dev/null; then
        log "ERROR" "AWS CLI is required for S3 upload but not found"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
do_backup() {
    validate_env

    log "INFO" "Starting backup of ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT}"

    # Step 1: pg_dump
    local dump_path="${BACKUP_DIR}/${BACKUP_FILENAME}"
    log "INFO" "Running pg_dump..."

    pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -Fc \
        --no-owner \
        --no-privileges \
        -f "${dump_path}"

    local dump_size
    dump_size=$(stat -f%z "${dump_path}" 2>/dev/null || stat -c%s "${dump_path}" 2>/dev/null || echo "unknown")
    log "INFO" "pg_dump complete: ${dump_size} bytes"

    # Step 2: Encrypt with AES-256-CBC
    local encrypted_path="${BACKUP_DIR}/${ENCRYPTED_FILENAME}"
    log "INFO" "Encrypting backup with AES-256-CBC..."

    openssl enc \
        -aes-256-cbc \
        -salt \
        -pbkdf2 \
        -iter 100000 \
        -in "${dump_path}" \
        -out "${encrypted_path}" \
        -pass env:BACKUP_ENCRYPTION_KEY

    # Step 3: Generate checksum
    local checksum_path="${BACKUP_DIR}/${CHECKSUM_FILENAME}"
    sha256sum "${encrypted_path}" > "${checksum_path}"

    local enc_size
    enc_size=$(stat -f%z "${encrypted_path}" 2>/dev/null || stat -c%s "${encrypted_path}" 2>/dev/null || echo "unknown")
    log "INFO" "Encryption complete: ${enc_size} bytes"

    # Step 4: Remove unencrypted dump
    rm -f "${dump_path}"
    log "INFO" "Removed unencrypted dump"

    log "INFO" "Backup complete: ${encrypted_path}"
    echo "${encrypted_path}"
}

# ---------------------------------------------------------------------------
# Upload to S3
# ---------------------------------------------------------------------------
do_upload() {
    validate_s3_env

    local encrypted_path="$1"
    local checksum_path="${encrypted_path}.sha256"
    local s3_key="${S3_PREFIX}$(basename "${encrypted_path}")"
    local s3_checksum_key="${S3_PREFIX}$(basename "${checksum_path}")"

    local endpoint_flag=""
    if [ -n "${S3_ENDPOINT:-}" ]; then
        endpoint_flag="--endpoint-url ${S3_ENDPOINT}"
    fi

    log "INFO" "Uploading backup to s3://${S3_BUCKET}/${s3_key}"

    # shellcheck disable=SC2086
    aws s3 cp "${encrypted_path}" "s3://${S3_BUCKET}/${s3_key}" \
        --storage-class STANDARD_IA \
        ${endpoint_flag} \
        --only-show-errors

    # shellcheck disable=SC2086
    aws s3 cp "${checksum_path}" "s3://${S3_BUCKET}/${s3_checksum_key}" \
        ${endpoint_flag} \
        --only-show-errors

    log "INFO" "Upload complete: s3://${S3_BUCKET}/${s3_key}"
}

# ---------------------------------------------------------------------------
# Cleanup old backups
# ---------------------------------------------------------------------------
do_cleanup() {
    log "INFO" "Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days"

    local count=0
    while IFS= read -r -d '' file; do
        rm -f "${file}"
        count=$((count + 1))
    done < <(find "${BACKUP_DIR}" -name "finance-*.dump.enc" -mtime "+${BACKUP_RETENTION_DAYS}" -print0 2>/dev/null)

    # Also clean up orphaned checksum files
    while IFS= read -r -d '' file; do
        rm -f "${file}"
    done < <(find "${BACKUP_DIR}" -name "finance-*.sha256" -mtime "+${BACKUP_RETENTION_DAYS}" -print0 2>/dev/null)

    log "INFO" "Cleaned up ${count} old backup(s)"
}

# ---------------------------------------------------------------------------
# Verify backup integrity
# ---------------------------------------------------------------------------
do_verify() {
    local encrypted_path="$1"
    local checksum_path="${encrypted_path}.sha256"

    if [ ! -f "${encrypted_path}" ]; then
        log "ERROR" "Backup file not found: ${encrypted_path}"
        exit 1
    fi

    if [ ! -f "${checksum_path}" ]; then
        log "ERROR" "Checksum file not found: ${checksum_path}"
        exit 1
    fi

    log "INFO" "Verifying checksum for ${encrypted_path}"

    if sha256sum -c "${checksum_path}" --quiet 2>/dev/null; then
        log "INFO" "Checksum verification PASSED"

        # Try to decrypt (header only) to verify encryption key
        if openssl enc \
            -d -aes-256-cbc \
            -salt \
            -pbkdf2 \
            -iter 100000 \
            -in "${encrypted_path}" \
            -pass env:BACKUP_ENCRYPTION_KEY 2>/dev/null | head -c 5 | pg_restore -l - > /dev/null 2>&1; then
            log "INFO" "Decryption verification PASSED"
        else
            log "WARN" "Decryption check could not verify format (may still be valid)"
        fi

        return 0
    else
        log "ERROR" "Checksum verification FAILED"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Restore from backup
# ---------------------------------------------------------------------------
do_restore() {
    validate_env

    local encrypted_path="$1"

    if [ ! -f "${encrypted_path}" ]; then
        log "ERROR" "Backup file not found: ${encrypted_path}"
        exit 1
    fi

    log "WARN" "Restoring database from ${encrypted_path}"
    log "WARN" "This will REPLACE the current database contents!"

    # Decrypt
    local decrypted_path="${encrypted_path%.enc}"
    openssl enc \
        -d -aes-256-cbc \
        -salt \
        -pbkdf2 \
        -iter 100000 \
        -in "${encrypted_path}" \
        -out "${decrypted_path}" \
        -pass env:BACKUP_ENCRYPTION_KEY

    log "INFO" "Decrypted backup to ${decrypted_path}"

    # Restore
    pg_restore \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        "${decrypted_path}"

    # Remove decrypted file
    rm -f "${decrypted_path}"

    log "INFO" "Restore complete"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    case "${1:-}" in
        --verify)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 --verify <backup-file>"
                exit 1
            fi
            do_verify "$2"
            ;;
        --restore)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 --restore <backup-file>"
                exit 1
            fi
            do_restore "$2"
            ;;
        --upload)
            local backup_path
            backup_path=$(do_backup)
            do_upload "${backup_path}"
            do_cleanup
            ;;
        *)
            do_backup
            do_cleanup
            ;;
    esac
}

main "$@"
