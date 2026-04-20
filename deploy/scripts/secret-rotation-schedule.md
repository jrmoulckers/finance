# Secret Rotation Schedule & Procedures

**Status:** Active
**Date:** 2026-03-25
**Issue:** #899

---

## Overview

All application secrets must be rotated on a regular schedule. This document defines the rotation schedule, procedures, and responsibilities.

---

## Rotation Schedule

| Secret                  | Rotation Frequency  | Impact                           | Downtime |
| ----------------------- | ------------------- | -------------------------------- | -------- |
| `JWT_SECRET`            | Quarterly (90 days) | Invalidates all sessions         | ~2 min   |
| `AUTH_WEBHOOK_SECRET`   | Monthly (30 days)   | Webhook verification key changes | ~30 sec  |
| `CRON_SECRET`           | Monthly (30 days)   | Cron function auth key changes   | ~30 sec  |
| `POSTGRES_PASSWORD`     | Quarterly (90 days) | Database auth changes            | ~2 min   |
| `MONGO_PASSWORD`        | Quarterly (90 days) | PowerSync storage auth changes   | ~1 min   |
| `BACKUP_ENCRYPTION_KEY` | Annually (365 days) | New backups use new key          | None     |
| `ANON_KEY`              | With JWT_SECRET     | Client API key changes           | ~2 min   |
| `SERVICE_ROLE_KEY`      | With JWT_SECRET     | Server API key changes           | ~2 min   |

> **Note:** `ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with `JWT_SECRET`. They MUST be regenerated whenever `JWT_SECRET` is rotated.

---

## Quick Reference

### Rotate All Non-Database Secrets

```bash
cd deploy/scripts
./rotate-secrets.sh --webhook --cron
```

### Rotate JWT (Quarterly)

```bash
# 1. Generate new JWT secret
cd deploy/scripts
./rotate-secrets.sh --jwt

# 2. Regenerate API keys with the new JWT secret
# Use https://supabase.com/docs/guides/self-hosting#api-keys
# Update ANON_KEY and SERVICE_ROLE_KEY in deploy/.env

# 3. Restart all services
cd ../
docker compose restart

# 4. Update client applications with new ANON_KEY
```

### Rotate Database Password (Quarterly)

```bash
# 1. Preview the change
cd deploy/scripts
./rotate-secrets.sh --dry-run --postgres

# 2. Update PostgreSQL password INSIDE the database first
docker compose exec db psql -U postgres -c "ALTER USER postgres PASSWORD '<new_password>';"

# 3. Update .env and restart services
./rotate-secrets.sh --postgres
```

### Rotate MongoDB Password (Quarterly)

```bash
# 1. Preview the change
cd deploy/scripts
./rotate-secrets.sh --dry-run --mongo

# 2. Update MongoDB password INSIDE MongoDB first
docker compose exec mongo mongosh -u powersync -p '<old_password>' --eval "db.changeUserPassword('powersync', '<new_password>')"

# 3. Update .env and restart services
./rotate-secrets.sh --mongo
```

### Rotate Backup Encryption Key (Annually)

```bash
# IMPORTANT: Old backups encrypted with the previous key CANNOT be
# decrypted with the new key. Store the old key securely until all
# old backups have expired past the retention period.

cd deploy/scripts
./rotate-secrets.sh --backup-key

# Verify new backups work:
cd ../backup
source .env
./backup-database.sh
./backup-database.sh --verify <new-backup-file>
```

---

## Dry Run Mode

Always preview rotations before applying:

```bash
./rotate-secrets.sh --dry-run --all
```

This shows what would change without modifying any files or restarting services.

---

## Emergency Rotation

If a secret is compromised, rotate it immediately:

```bash
# 1. Rotate the compromised secret
./rotate-secrets.sh --<secret-type>

# 2. Check audit logs for unauthorized access
docker compose exec db psql -U postgres -c \
  "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50;"

# 3. Review PowerSync sync logs
docker compose logs powersync --tail=100

# 4. If JWT was compromised, force-logout all users
# (Rotating JWT_SECRET automatically invalidates all sessions)

# 5. File an incident report per the incident response runbook
```

---

## Automation with Cron

Add to the VPS crontab for automated rotation:

```bash
# Monthly: rotate webhook and cron secrets (low-impact)
0 4 1 * * cd ~/finance/deploy/scripts && ./rotate-secrets.sh --webhook --cron >> /var/log/finance-secret-rotation.log 2>&1

# Quarterly: rotate JWT and database secrets (higher impact — schedule during maintenance window)
# Manual rotation recommended for quarterly secrets due to session invalidation impact
```

---

## Audit Trail

The rotation script outputs structured JSON logs. Capture them for compliance:

```bash
./rotate-secrets.sh --all 2>&1 | tee -a /var/log/finance-secret-rotation.log
```

Each rotation event is logged with timestamp, secret name (not value), and affected services.

---

## Rollback

If a rotation causes issues:

1. The script creates a timestamped backup of `.env` before each rotation
2. Find the backup: `ls -la deploy/.env.backup.*`
3. Restore: `cp deploy/.env.backup.<timestamp> deploy/.env`
4. Restart services: `docker compose restart`

> **Exception:** Database password rotations cannot be rolled back by restoring the `.env` file alone — you must also revert the password inside PostgreSQL/MongoDB.
