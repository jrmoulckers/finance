# Disaster Recovery Procedures

**Status:** Active
**Date:** 2026-03-25
**Issues:** #887, #900

---

## Overview

This document describes recovery procedures for the Finance backend. All procedures assume you have access to the VPS, the backup encryption key, and S3 credentials.

> **Critical:** The backup encryption key (`BACKUP_ENCRYPTION_KEY`) MUST be stored separately from the backups. If you lose this key, encrypted backups are irrecoverable. Store it in a password manager or hardware security module.

---

## Recovery Time Objectives

| Scenario                      | RTO Target | RPO Target | Priority |
| ----------------------------- | ---------- | ---------- | -------- |
| Database corruption           | < 1 hour   | < 24 hours | P0       |
| Full VPS failure              | < 4 hours  | < 24 hours | P0       |
| Single service crash          | < 5 min    | 0 (auto)   | P1       |
| Data loss (accidental delete) | < 2 hours  | < 24 hours | P1       |
| Region outage (cloud)         | < 8 hours  | < 24 hours | P2       |

---

## 1. Single Service Recovery

Docker Compose automatically restarts crashed services (`restart: unless-stopped`). If a service is unhealthy:

```bash
# Check service status
cd ~/finance/deploy
docker compose ps

# Restart a single service
docker compose restart <service-name>

# If restart fails, recreate the container
docker compose up -d --force-recreate <service-name>

# Check logs for root cause
docker compose logs --tail=100 <service-name>
```

### Common Service Issues

| Service        | Symptom              | Action                                    |
| -------------- | -------------------- | ----------------------------------------- |
| db             | Connection refused   | Check disk space, restart, check WAL size |
| rest           | 503 errors           | Restart, check db connectivity            |
| auth           | Login failures       | Restart, verify JWT_SECRET matches db     |
| edge-functions | 500 on all functions | Restart, check env vars                   |
| powersync      | Sync not working     | Check replication slot, restart           |
| caddy          | TLS errors           | Check certificate, restart                |

---

## 2. Database Recovery from Backup

### 2a. Restore from Local Backup

```bash
cd ~/finance/deploy/backup

# List available backups (newest first)
ls -lt volumes/db/backups/finance-*.dump.enc

# Verify backup integrity
source .env
./backup-database.sh --verify volumes/db/backups/<backup-file>.dump.enc

# Stop services that write to the database
cd ~/finance/deploy
docker compose stop rest auth edge-functions powersync

# Restore (this REPLACES current database contents)
cd ~/finance/deploy/backup
source .env
./backup-database.sh --restore volumes/db/backups/<backup-file>.dump.enc

# Restart all services
cd ~/finance/deploy
docker compose up -d

# Verify services are healthy
docker compose ps
```

### 2b. Restore from S3 Backup

```bash
cd ~/finance/deploy/backup
source .env

# List available S3 backups
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" \
  ${S3_ENDPOINT:+--endpoint-url $S3_ENDPOINT}

# Download the backup and checksum
aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}<backup-file>.dump.enc" \
  volumes/db/backups/ \
  ${S3_ENDPOINT:+--endpoint-url $S3_ENDPOINT}

aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}<backup-file>.dump.enc.sha256" \
  volumes/db/backups/ \
  ${S3_ENDPOINT:+--endpoint-url $S3_ENDPOINT}

# Verify and restore (same as 2a)
./backup-database.sh --verify volumes/db/backups/<backup-file>.dump.enc
./backup-database.sh --restore volumes/db/backups/<backup-file>.dump.enc
```

---

## 3. Full VPS Recovery

If the VPS is completely lost (hardware failure, provider outage):

### Step 1: Provision New VPS

Follow [staging-provisioning.md](./staging-provisioning.md) for VPS setup, replacing staging values with production values.

### Step 2: Restore Configuration

```bash
# Clone the repository
git clone https://github.com/jrmoulckers/finance.git
cd finance/deploy

# Restore .env from your secure secret storage
# (Password manager, vault, etc.)
cp /path/to/secured/.env .env
cp /path/to/secured/backup/.env backup/.env
```

### Step 3: Start Services (Without Data)

```bash
docker compose up -d
# Wait for all services to be healthy
docker compose ps
```

### Step 4: Restore Database

```bash
cd backup
source .env

# Download latest backup from S3
LATEST=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" \
  ${S3_ENDPOINT:+--endpoint-url $S3_ENDPOINT} \
  | grep '.dump.enc$' | sort | tail -1 | awk '{print $4}')

aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}${LATEST}" volumes/db/backups/
aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}${LATEST}.sha256" volumes/db/backups/

# Verify and restore
./backup-database.sh --verify "volumes/db/backups/${LATEST}"
./backup-database.sh --restore "volumes/db/backups/${LATEST}"
```

### Step 5: Restore PowerSync Replication

```bash
# The replication slot was lost with the old database
# Re-create it on the new database
docker compose exec db psql -U postgres -d postgres -c \
  "SELECT pg_create_logical_replication_slot('powersync', 'pgoutput');"

docker compose exec db psql -U postgres -d postgres -c \
  "CREATE PUBLICATION powersync FOR TABLE
    users, households, household_members, accounts, categories,
    transactions, budgets, goals, household_invitations,
    recurring_transaction_templates, passkey_credentials;"

# Restart PowerSync to pick up the new slot
docker compose restart powersync
```

### Step 6: Verify

```bash
# Health check
curl https://your-domain.com/health

# Auth
curl https://your-domain.com/auth/health

# PowerSync
curl https://your-domain.com/sync/api/status

# Test a full sync from a client device
```

---

## 4. PowerSync Recovery

### Replication Slot Lost

```bash
# Check if the slot exists
docker compose exec db psql -U postgres -c \
  "SELECT * FROM pg_replication_slots WHERE slot_name = 'powersync';"

# If missing, recreate:
docker compose exec db psql -U postgres -c \
  "SELECT pg_create_logical_replication_slot('powersync', 'pgoutput');"

# Restart PowerSync
docker compose restart powersync
```

### Replication Lag Too High

```bash
# Check replication lag
docker compose exec db psql -U postgres -c \
  "SELECT slot_name, confirmed_flush_lsn, pg_current_wal_lsn(),
   (pg_current_wal_lsn() - confirmed_flush_lsn) AS lag_bytes
   FROM pg_replication_slots WHERE slot_name = 'powersync';"

# If lag > 1GB, consider dropping and recreating the slot
# WARNING: This forces a full re-sync for all clients
docker compose exec db psql -U postgres -c \
  "SELECT pg_drop_replication_slot('powersync');"
docker compose exec db psql -U postgres -c \
  "SELECT pg_create_logical_replication_slot('powersync', 'pgoutput');"
docker compose restart powersync
```

### MongoDB Data Corruption

PowerSync uses MongoDB for bucket storage. If MongoDB data is corrupted:

```bash
# Stop PowerSync
docker compose stop powersync

# Reset MongoDB (WARNING: causes full re-sync for all clients)
docker compose down mongo
docker volume rm finance_mongodata
docker compose up -d mongo

# Wait for MongoDB to be healthy
docker compose ps mongo

# Restart PowerSync (will rebuild bucket storage from PostgreSQL)
docker compose up -d powersync
```

---

## 5. Monitoring Recovery

### Uptime Kuma Down

```bash
cd ~/finance/deploy/monitoring
docker compose -f docker-compose.monitoring.yml restart uptime-kuma

# If data is lost, reconfigure monitors per monitors.md
```

---

## 6. Post-Recovery Checklist

After any recovery procedure:

- [ ] All Docker services show as healthy (`docker compose ps`)
- [ ] Health check endpoint returns 200 (`curl https://domain/health`)
- [ ] Auth service responds (`curl https://domain/auth/health`)
- [ ] PowerSync is connected and syncing
- [ ] A test client can sync data successfully
- [ ] Uptime Kuma shows all monitors green
- [ ] Backup cron job is still scheduled (`crontab -l`)
- [ ] Review audit_log for any anomalies during the outage
- [ ] Write a post-incident report documenting:
  - Root cause
  - Timeline of events
  - Recovery steps taken
  - Lessons learned
  - Action items to prevent recurrence

---

## 7. Emergency Contacts

| Role              | Responsibility                          | Contact Method      |
| ----------------- | --------------------------------------- | ------------------- |
| Backend Engineer  | Database, Edge Functions, sync layer    | Primary on-call     |
| Platform Engineer | CI/CD, infrastructure, DNS              | Secondary on-call   |
| Security Lead     | Incident response, data breach protocol | Security escalation |

> **Incident Response:** Follow the [Incident Response Runbook](../../../docs/architecture/incident-response-runbook.md) for all production incidents.
