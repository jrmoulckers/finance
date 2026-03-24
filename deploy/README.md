# Self-Hosted Deployment Guide

Deploy the full Finance backend stack on any Linux VPS with Docker. This guide
targets a **$10–20/month** commodity server (2 vCPU, 2–4 GB RAM, 40 GB SSD) from
providers like Hetzner, DigitalOcean, or Linode.

**Issue:** [#268](https://github.com/jrmoulckers/finance/issues/268)

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration Reference](#configuration-reference)
- [Database Migrations](#database-migrations)
- [Backup Procedures](#backup-procedures)
- [Monitoring](#monitoring)
- [Updating & Migrations](#updating--migrations)
- [Troubleshooting](#troubleshooting)
- [Security Hardening](#security-hardening)
- [Cost Estimate](#cost-estimate)

---

## Prerequisites

| Requirement        | Minimum            | Recommended      |
| ------------------ | ------------------ | ---------------- |
| **OS**             | Ubuntu 22.04 LTS   | Ubuntu 24.04 LTS |
| **Docker**         | 24.0+              | 27.0+            |
| **Docker Compose** | v2.20+             | v2.30+           |
| **RAM**            | 2 GB               | 4 GB             |
| **Disk**           | 20 GB SSD          | 40 GB SSD        |
| **CPU**            | 1 vCPU             | 2 vCPU           |
| **Domain name**    | Required           | —                |
| **Email for TLS**  | Required           | —                |
| **DNS A record**   | Points to your VPS | —                |

Install Docker on a fresh Ubuntu server:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker compose version
```

---

## Quick Start

Get a running instance in five steps:

### Step 1 — Clone the repository

```bash
git clone https://github.com/jrmoulckers/finance.git
cd finance/deploy
```

### Step 2 — Configure environment

```bash
cp .env.example .env

# Generate secrets
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "AUTH_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env
echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" >> .env

# Edit .env and fill in remaining values:
#   - DOMAIN, TLS_EMAIL
#   - SMTP settings (for email auth)
#   - ANON_KEY and SERVICE_ROLE_KEY (see below)
nano .env
```

**Generating Supabase API keys:**

The `ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with your `JWT_SECRET`.
Use the [Supabase API key generator](https://supabase.com/docs/guides/self-hosting/docker#api-keys)
or generate them manually:

```bash
# Install jwt-cli (or use any JWT library)
# Anon key payload: {"role": "anon", "iss": "supabase", "iat": <now>, "exp": <+10y>}
# Service role payload: {"role": "service_role", "iss": "supabase", "iat": <now>, "exp": <+10y>}
```

### Step 3 — Start the stack

```bash
docker compose up -d
```

Wait for all services to become healthy:

```bash
docker compose ps       # All services should show "healthy"
docker compose logs -f  # Watch logs for errors (Ctrl+C to exit)
```

### Step 4 — Apply database migrations

```bash
# Install the Supabase CLI (if not already installed)
npm install -g supabase

# Connect to the database and apply all migrations in order
for migration in ../services/api/supabase/migrations/*.sql; do
  echo "Applying: $migration"
  docker compose exec -T db psql \
    -U "${POSTGRES_USER:-postgres}" \
    -d "${POSTGRES_DB:-postgres}" \
    -f - < "$migration"
done
```

Alternatively, apply migrations individually:

```bash
docker compose exec -T db psql \
  -U postgres -d postgres \
  -f - < ../services/api/supabase/migrations/20260306000001_initial_schema.sql

# Repeat for each migration file in chronological order...
```

### Step 5 — Verify the deployment

```bash
# Check the health endpoint
curl -sf https://your-domain.com/health

# Test the REST API (should return 401 without auth)
curl -sf https://your-domain.com/rest/users

# Check auth endpoint
curl -sf https://your-domain.com/auth/v1/health

# View service status
docker compose ps
```

🎉 **Your Finance backend is running!** Configure your client apps to point at
`https://your-domain.com`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Internet                           │
└──────────────────────┬──────────────────────────────────┘
                       │ :443 (HTTPS)
              ┌────────▼────────┐
              │      Caddy      │  Automatic TLS
              │  (reverse proxy)│  Let's Encrypt
              └──┬──────┬───┬───┘
                 │      │   │
      ┌──────────▼┐  ┌──▼──┐  ┌──▼────────────┐
      │ PostgREST │  │Auth │  │Edge Functions  │
      │  (REST)   │  │(JWT)│  │   (Deno)       │
      └──────┬────┘  └──┬──┘  └──┬─────────────┘
             │          │        │
         ┌───▼──────────▼────────▼───┐
         │       PostgreSQL 15       │
         │   (RLS, WAL, backups)     │
         └───────────────────────────┘
```

### Service Roles

| Service             | Port (internal) | Role                                |
| ------------------- | --------------- | ----------------------------------- |
| **PostgreSQL**      | 5432            | Primary data store with RLS + WAL   |
| **PostgREST**       | 3000            | Auto-generated REST API from schema |
| **GoTrue (Auth)**   | 9999            | Authentication, JWT issuance, OAuth |
| **Edge Functions**  | 9000            | Business logic (Deno runtime)       |
| **PostgreSQL Meta** | 8080            | Schema introspection (internal)     |
| **Caddy**           | 80, 443         | TLS termination, reverse proxy      |

### Network Isolation

- **finance-internal** — bridge network (internal, no internet access). All
  backend services communicate here.
- **finance-external** — bridge network with internet access. Only Caddy is
  attached, serving as the sole ingress point.

---

## Configuration Reference

### Required Variables

| Variable              | Description                                                | Example                       |
| --------------------- | ---------------------------------------------------------- | ----------------------------- |
| `DOMAIN`              | Fully qualified domain name                                | `finance.example.com`         |
| `TLS_EMAIL`           | Email for Let's Encrypt registration                       | `admin@example.com`           |
| `POSTGRES_PASSWORD`   | PostgreSQL superuser password                              | (generate with `openssl`)     |
| `JWT_SECRET`          | JWT signing secret (≥32 chars, shared across all services) | (generate with `openssl`)     |
| `ANON_KEY`            | Supabase anonymous JWT                                     | `eyJhbG...`                   |
| `SERVICE_ROLE_KEY`    | Supabase service role JWT                                  | `eyJhbG...`                   |
| `SITE_URL`            | Frontend app URL                                           | `https://finance.example.com` |
| `AUTH_WEBHOOK_SECRET` | Shared secret for auth webhook verification                | (generate with `openssl`)     |
| `CRON_SECRET`         | Shared secret for cron-triggered Edge Functions            | (generate with `openssl`)     |
| `ALLOWED_ORIGINS`     | CORS allowed origins (comma-separated)                     | `https://finance.example.com` |

### SMTP (required for email auth)

| Variable           | Description                      | Example                |
| ------------------ | -------------------------------- | ---------------------- |
| `SMTP_HOST`        | SMTP server hostname             | `smtp.postmarkapp.com` |
| `SMTP_PORT`        | SMTP port                        | `587`                  |
| `SMTP_USER`        | SMTP username                    | `your-api-token`       |
| `SMTP_PASS`        | SMTP password                    | `your-api-token`       |
| `SMTP_ADMIN_EMAIL` | Sender email address             | `noreply@example.com`  |
| `SMTP_SENDER_NAME` | Display name for outgoing emails | `Finance App`          |

### OAuth Providers (optional)

| Variable              | Description                            |
| --------------------- | -------------------------------------- |
| `APPLE_AUTH_ENABLED`  | Enable Apple Sign-In (`true`/`false`)  |
| `APPLE_CLIENT_ID`     | Apple Services ID                      |
| `APPLE_SECRET`        | Apple private key                      |
| `GOOGLE_AUTH_ENABLED` | Enable Google Sign-In (`true`/`false`) |
| `GOOGLE_CLIENT_ID`    | Google OAuth client ID                 |
| `GOOGLE_SECRET`       | Google OAuth client secret             |

### WebAuthn / Passkeys

| Variable           | Description                          | Example                       |
| ------------------ | ------------------------------------ | ----------------------------- |
| `WEBAUTHN_RP_NAME` | Relying Party display name           | `Finance App`                 |
| `WEBAUTHN_RP_ID`   | Relying Party ID (must match domain) | `finance.example.com`         |
| `WEBAUTHN_ORIGIN`  | Expected origin URL                  | `https://finance.example.com` |

### Optional

| Variable                  | Default                              | Description                          |
| ------------------------- | ------------------------------------ | ------------------------------------ |
| `POSTGRES_DB`             | `postgres`                           | Database name                        |
| `POSTGRES_USER`           | `postgres`                           | Database superuser name              |
| `POSTGRES_PORT`           | `5432`                               | Host port for direct database access |
| `JWT_EXPIRY`              | `3600`                               | JWT lifetime in seconds              |
| `AUTH_RATE_LIMIT_EMAIL`   | `30`                                 | Max email sends per hour             |
| `AUTH_RATE_LIMIT_REFRESH` | `150`                                | Max token refreshes per hour         |
| `MAILER_AUTOCONFIRM`      | `false`                              | Skip email confirmation (testing)    |
| `AUTH_REDIRECT_URLS`      | —                                    | Allowed OAuth redirect URLs          |
| `EDGE_FUNCTIONS_PATH`     | `../services/api/supabase/functions` | Path to Edge Functions source        |
| `BACKUP_RETENTION_DAYS`   | `30`                                 | Number of daily backups to keep      |
| `POWERSYNC_URL`           | —                                    | PowerSync instance URL (optional)    |
| `POWERSYNC_PUBLIC_KEY`    | —                                    | PowerSync public key (optional)      |

---

## Database Migrations

Migrations are located in `services/api/supabase/migrations/` and must be
applied **in chronological order**. Each migration is idempotent where possible.

### Migration Inventory

| Migration                                         | Description                               |
| ------------------------------------------------- | ----------------------------------------- |
| `20260306000001_initial_schema.sql`               | All core tables (users, households, etc.) |
| `20260306000002_rls_policies.sql`                 | Row-Level Security on all tables          |
| `20260306000003_auth_config.sql`                  | Passkeys, invitations, JWT hook           |
| `20260307000001_monitoring.sql`                   | Sync health logging                       |
| `20260315000001_export_audit_log.sql`             | Data export audit trail                   |
| `20260316000001_edge_function_security.sql`       | Idempotent signup, atomic invite accept   |
| `20260316000001_fix_invitation_rls.sql`           | Restrict invitation UPDATE to owner       |
| `20260323000001_cleanup_and_balance_triggers.sql` | Scheduled cleanup, balance triggers       |
| `20260323000002_recurring_transactions.sql`       | Recurring transaction templates           |
| `20260323000003_rate_limits.sql`                  | Rate limiting table and RPC               |

### Applying Migrations

```bash
# Apply all migrations at once
for migration in ../services/api/supabase/migrations/*.sql; do
  echo "Applying: $(basename $migration)"
  docker compose exec -T db psql -U postgres -d postgres -f - < "$migration"
done

# Verify all tables exist
docker compose exec db psql -U postgres -d postgres -c "\dt public.*"

# Verify RLS is enabled on all tables
docker compose exec db psql -U postgres -d postgres -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
"
```

---

## Backup Procedures

### Automated Daily Backups

Create a cron job for daily database backups:

```bash
# Create the backup script
cat > /opt/finance-backup.sh << 'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/path/to/finance/deploy/volumes/db/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/finance_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump the database (compressed)
docker compose -f /path/to/finance/deploy/docker-compose.yml \
  exec -T db pg_dump \
    -U postgres \
    -d postgres \
    --format=custom \
    --compress=6 \
    --verbose \
  > "$BACKUP_FILE"

# Prune old backups
find "$BACKUP_DIR" -name "finance_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup completed: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
SCRIPT

chmod +x /opt/finance-backup.sh
```

Schedule it with cron:

```bash
# Run daily at 3:00 AM UTC
echo "0 3 * * * /opt/finance-backup.sh >> /var/log/finance-backup.log 2>&1" | crontab -
```

### Manual Backup

```bash
# Full database dump
docker compose exec -T db pg_dump -U postgres -d postgres \
  --format=custom --compress=6 > backup_$(date +%Y%m%d).dump

# Specific table
docker compose exec -T db pg_dump -U postgres -d postgres \
  --table=transactions --format=custom > transactions_backup.dump
```

### Restoring from Backup

```bash
# Stop the stack (except the database)
docker compose stop rest auth edge-functions caddy

# Restore the backup
docker compose exec -T db pg_restore \
  -U postgres -d postgres \
  --clean --if-exists \
  < backup_20260323.dump

# Restart all services
docker compose up -d
```

### Backup Verification

Test your backups monthly:

```bash
# Spin up a temporary PostgreSQL container to validate the backup
docker run --rm -d --name backup-test \
  -e POSTGRES_PASSWORD=test \
  postgres:15-alpine

docker exec -i backup-test pg_restore \
  -U postgres -d postgres \
  --clean --if-exists \
  < backup_20260323.dump

docker exec backup-test psql -U postgres -d postgres \
  -c "SELECT count(*) FROM transactions;"

docker stop backup-test
```

---

## Monitoring

### Health Checks

All services have built-in health checks. Docker automatically restarts
unhealthy containers (via `restart: unless-stopped`).

```bash
# Check service health
docker compose ps

# Service-specific health
curl -sf https://your-domain.com/health            # Edge Functions
curl -sf https://your-domain.com/auth/v1/health     # GoTrue Auth
```

### External Uptime Monitoring

Set up a free uptime monitor (e.g., [Uptime Robot](https://uptimerobot.com),
[Healthchecks.io](https://healthchecks.io)) to ping:

- **URL:** `https://your-domain.com/health`
- **Interval:** 60 seconds
- **Alert on:** HTTP status ≠ 200

### Log Monitoring

```bash
# View all service logs
docker compose logs -f

# View specific service logs
docker compose logs -f db              # PostgreSQL
docker compose logs -f auth            # GoTrue
docker compose logs -f rest            # PostgREST
docker compose logs -f edge-functions  # Edge Functions
docker compose logs -f caddy           # Reverse proxy

# View Caddy access logs
docker compose exec caddy cat /data/access.log | tail -20
```

### Database Monitoring

```bash
# Active connections
docker compose exec db psql -U postgres -d postgres -c "
  SELECT count(*) as total_connections,
         state,
         wait_event_type
  FROM pg_stat_activity
  GROUP BY state, wait_event_type;
"

# Table sizes
docker compose exec db psql -U postgres -d postgres -c "
  SELECT relname as table,
         pg_size_pretty(pg_total_relation_size(relid)) as total_size
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
"

# Slow queries (queries > 1 second, configured in PostgreSQL)
docker compose exec db psql -U postgres -d postgres -c "
  SELECT query, calls, mean_exec_time, total_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"
```

### Disk Usage Alerts

Add a simple disk check to cron:

```bash
# Alert if disk usage exceeds 80%
echo '*/30 * * * * [ $(df / --output=pcent | tail -1 | tr -d " %%") -gt 80 ] && echo "DISK WARNING: $(df -h /)" | mail -s "Finance: Disk Alert" admin@example.com' | crontab -
```

---

## Updating & Migrations

### Updating Service Images

```bash
# Pull latest images
docker compose pull

# Restart with new images (zero-downtime for stateless services)
docker compose up -d

# Verify health
docker compose ps
```

### Applying New Migrations

When new migrations are added to `services/api/supabase/migrations/`:

```bash
# Pull latest code
git pull origin main

# Apply only the new migration(s)
docker compose exec -T db psql -U postgres -d postgres \
  -f - < ../services/api/supabase/migrations/NEW_MIGRATION.sql

# Verify
docker compose exec db psql -U postgres -d postgres -c "\dt public.*"
```

### Rolling Back

Each migration file contains a `DOWN` section (commented out at the bottom).
To roll back:

1. Extract the `DOWN` SQL from the migration file
2. Review the impact (**destructive changes require human approval**)
3. Apply the rollback SQL manually:

```bash
docker compose exec -T db psql -U postgres -d postgres -c "
  -- Paste the DOWN SQL here
"
```

> ⚠️ **Never run rollback SQL without reading it first.** Some rollbacks
> include `DROP TABLE` which permanently destroys data.

---

## Troubleshooting

### Services Won't Start

```bash
# Check which services are failing
docker compose ps

# View logs for the failing service
docker compose logs <service-name>

# Common issues:
# - Port conflicts: check POSTGRES_PORT isn't already in use
# - DNS not propagated: Caddy can't get TLS cert
# - Missing .env values: check all required vars are set
```

### Database Connection Issues

```bash
# Test direct database connection
docker compose exec db psql -U postgres -d postgres -c "SELECT 1;"

# Check PostgreSQL logs
docker compose logs db | tail -50

# Verify PostgreSQL is accepting connections
docker compose exec db pg_isready -U postgres
```

### TLS Certificate Issues

```bash
# Check Caddy logs for certificate errors
docker compose logs caddy | grep -i "tls\|cert\|acme"

# Verify DNS resolution
dig +short your-domain.com

# Test with staging certificates first (add to Caddyfile):
# tls {$TLS_EMAIL} {
#   ca https://acme-staging-v02.api.letsencrypt.org/directory
# }
```

### Edge Function Errors

```bash
# Check edge function logs
docker compose logs edge-functions

# Test a specific function
curl -sf https://your-domain.com/functions/health-check

# Verify function files are mounted
docker compose exec edge-functions ls -la /home/deno/functions/
```

---

## Security Hardening

### Firewall

Only ports 80, 443, and SSH should be exposed:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### PostgreSQL Access

The database port (`5432`) is exposed to the host by default for direct access
during setup. In production, restrict it:

```yaml
# In docker-compose.yml, change:
ports:
  - "${POSTGRES_PORT:-5432}:5432"
# To bind only to localhost:
ports:
  - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
```

Or remove the `ports` directive entirely if you don't need direct access.

### Docker Security

```bash
# Run containers as non-root (default for most images)
# Enable Docker content trust
export DOCKER_CONTENT_TRUST=1

# Keep Docker updated
sudo apt update && sudo apt upgrade docker-ce docker-ce-cli
```

### Secrets Rotation

Rotate secrets periodically:

1. Generate new values for `JWT_SECRET`, `AUTH_WEBHOOK_SECRET`, `CRON_SECRET`
2. Update `.env`
3. Re-generate `ANON_KEY` and `SERVICE_ROLE_KEY` with the new `JWT_SECRET`
4. Restart all services: `docker compose up -d`

> ⚠️ Rotating `JWT_SECRET` invalidates all existing sessions. Users will need
> to re-authenticate.

---

## Cost Estimate

Running the full stack on a single VPS:

| Provider         | Plan                  | Specs               | Monthly Cost |
| ---------------- | --------------------- | ------------------- | ------------ |
| **Hetzner**      | CX22                  | 2 vCPU, 4 GB, 40 GB | **€4.35**    |
| **DigitalOcean** | Basic Droplet         | 2 vCPU, 2 GB, 50 GB | **$12**      |
| **Linode**       | Nanode 2 GB           | 1 vCPU, 2 GB, 50 GB | **$12**      |
| **Vultr**        | Cloud Compute (Intel) | 1 vCPU, 2 GB, 55 GB | **$12**      |
| **Hetzner**      | CX32                  | 4 vCPU, 8 GB, 80 GB | **€7.59**    |

**Additional costs:**

| Item                      | Cost/Month | Notes                       |
| ------------------------- | ---------- | --------------------------- |
| Domain name               | ~$1        | Annual cost amortized       |
| SMTP (Postmark)           | Free–$15   | Free tier: 100 emails/month |
| SMTP (Resend)             | Free–$20   | Free tier: 100 emails/day   |
| Monitoring (Uptime Robot) | Free       | Free tier: 50 monitors      |
| PowerSync                 | Free–$49   | Free for up to 500 users    |
| **Total**                 | **$10–20** | Typical self-hosted monthly |

> 💡 TLS certificates are free via Let's Encrypt (handled automatically by Caddy).

---

## Further Reading

- [Production Checklist](../services/api/docs/production-checklist.md) — full
  deployment verification checklist
- [Backend Sync Architecture](../docs/architecture/0002-backend-sync-architecture.md) —
  PowerSync integration details
- [Auth Security Architecture](../docs/architecture/0004-auth-security-architecture.md) —
  authentication design decisions
- [Supabase Self-Hosting Docs](https://supabase.com/docs/guides/self-hosting) —
  official reference
