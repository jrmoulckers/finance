# Staging Environment Provisioning Guide

**Status:** Active
**Date:** 2026-03-25
**Issues:** #881, #883

---

## Overview

This guide covers provisioning a staging environment for the Finance backend on a VPS. The staging environment mirrors production but uses:

- **Let's Encrypt Staging CA** (untrusted certificates — avoids rate limits)
- **Auto-confirmed email signups** (no SMTP required for basic QA)
- **Lower resource limits** (sized for a 2–4 vCPU, 4–8 GB RAM VPS)
- **Exposed debug ports** (PostgreSQL and MongoDB accessible for troubleshooting)
- **Self-hosted PowerSync** with MongoDB bucket storage

---

## Prerequisites

| Requirement    | Minimum             | Recommended         |
| -------------- | ------------------- | ------------------- |
| VPS CPU        | 2 vCPU              | 4 vCPU              |
| VPS RAM        | 4 GB                | 8 GB                |
| VPS Disk       | 40 GB SSD           | 80 GB SSD           |
| OS             | Ubuntu 22.04 LTS    | Ubuntu 24.04 LTS    |
| Docker         | 24.0+               | Latest stable       |
| Docker Compose | 2.20+               | Latest stable       |
| Domain         | staging.example.com | staging.example.com |
| DNS A record   | Pointing to VPS IP  | Pointing to VPS IP  |

---

## 1. VPS Initial Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker (official method)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to the docker group (log out and back in after)
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

---

## 2. Firewall Configuration

```bash
# Allow SSH, HTTP, HTTPS only
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status
```

> **Security Note:** Do NOT expose PostgreSQL (5432) or MongoDB (27017) to the internet. Access them via SSH tunnel if needed:
>
> ```bash
> ssh -L 5432:localhost:5432 user@staging.example.com
> ssh -L 27017:localhost:27017 user@staging.example.com
> ```

---

## 3. Clone Repository & Configure

```bash
# Clone the repository
git clone https://github.com/jrmoulckers/finance.git
cd finance/deploy

# Create environment file from staging template
cp .env.staging.example .env

# Generate secrets (copy these into .env)
echo "JWT_SECRET: $(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD: $(openssl rand -base64 24)"
echo "MONGO_PASSWORD: $(openssl rand -base64 24)"
echo "AUTH_WEBHOOK_SECRET: $(openssl rand -hex 32)"
echo "CRON_SECRET: $(openssl rand -hex 32)"

# Edit .env with your actual values
nano .env
```

### Required .env Changes

| Variable                        | Action                                 |
| ------------------------------- | -------------------------------------- |
| `DOMAIN`                        | Set to your staging domain             |
| `TLS_EMAIL`                     | Set to your email for Let's Encrypt    |
| `POSTGRES_PASSWORD`             | Set to generated password              |
| `JWT_SECRET`                    | Set to generated secret                |
| `ANON_KEY`                      | Generate JWT with `role: anon`         |
| `SERVICE_ROLE_KEY`              | Generate JWT with `role: service_role` |
| `MONGO_PASSWORD`                | Set to generated password              |
| `POWERSYNC_MONGO_URI`           | Update password in connection string   |
| `AUTH_WEBHOOK_SECRET`           | Set to generated secret                |
| `CRON_SECRET`                   | Set to generated secret                |
| `POWERSYNC_SUPABASE_PROJECT_ID` | Set to your Supabase project ID        |

### Generating Supabase API Keys

Use the JWT secret to generate anon and service_role keys:

```bash
# Install jwt-cli or use https://supabase.com/docs/guides/self-hosting#api-keys
# Anon key payload: {"role": "anon", "iss": "supabase", "iat": <now>, "exp": <+10yr>}
# Service role payload: {"role": "service_role", "iss": "supabase", "iat": <now>, "exp": <+10yr>}
```

---

## 4. Start the Stack

```bash
# Start all services with staging overrides
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# Watch logs during first startup
docker compose -f docker-compose.yml -f docker-compose.staging.yml logs -f

# Check all services are healthy
docker compose -f docker-compose.yml -f docker-compose.staging.yml ps
```

Expected healthy services:

| Service        | Port (internal) | Health Endpoint     |
| -------------- | --------------- | ------------------- |
| db             | 5432            | `pg_isready`        |
| rest           | 3000            | `GET /ready`        |
| auth           | 9999            | `GET /health`       |
| meta           | 8080            | `GET /health`       |
| edge-functions | 9000            | `GET /health-check` |
| powersync      | 8080            | `GET /api/status`   |
| mongo          | 27017           | `mongosh ping`      |
| caddy          | 80, 443         | `GET /health`       |

---

## 5. Database Setup

### Apply Migrations

```bash
# Option A: Using Supabase CLI from your local machine
supabase db push --db-url "postgres://postgres:<password>@staging.example.com:5432/postgres"

# Option B: Apply migrations directly on the VPS
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec db \
  psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/migrations/20260306000001_initial_schema.sql
# ... repeat for each migration file in order
```

### Set Up PowerSync Replication

```bash
# Connect to the database
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec db \
  psql -U postgres -d postgres

# Create the replication slot
SELECT pg_create_logical_replication_slot('powersync', 'pgoutput');

# Create the publication for all sync-enabled tables
CREATE PUBLICATION powersync FOR TABLE
  users, households, household_members, accounts, categories,
  transactions, budgets, goals, household_invitations,
  recurring_transaction_templates, passkey_credentials;

# Verify
SELECT * FROM pg_replication_slots WHERE slot_name = 'powersync';
SELECT * FROM pg_publication_tables WHERE pubname = 'powersync';
```

### Seed Test Data (Optional)

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec db \
  psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/99-seed.sql
```

---

## 6. Verify Deployment

```bash
# 1. Health check
curl -k https://staging.example.com/health
# Expected: {"status":"healthy"}

# 2. Auth endpoint
curl -k https://staging.example.com/auth/health
# Expected: {"version":"..."}

# 3. REST API
curl -k https://staging.example.com/rest/
# Expected: PostgREST root response

# 4. PowerSync status
curl -k https://staging.example.com/sync/api/status
# Expected: PowerSync status response

# 5. Test auth signup (auto-confirmed in staging)
curl -k -X POST https://staging.example.com/auth/signup \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

> **Note:** The `-k` flag is required because the Let's Encrypt Staging CA issues untrusted certificates.

---

## 7. Updating the Deployment

```bash
# Pull latest code
cd ~/finance
git pull origin main

# Rebuild and restart
cd deploy
docker compose -f docker-compose.yml -f docker-compose.staging.yml pull
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# Apply any new migrations
# (follow the migration order in services/api/supabase/migrations/)
```

---

## 8. Troubleshooting

### Service Won't Start

```bash
# Check logs for specific service
docker compose -f docker-compose.yml -f docker-compose.staging.yml logs <service>

# Common issues:
# - Port already in use: lsof -i :<port>
# - Out of memory: docker stats
# - DNS not resolving: dig staging.example.com
```

### PowerSync Not Syncing

```bash
# Check PowerSync logs
docker compose -f docker-compose.yml -f docker-compose.staging.yml logs powersync

# Verify replication slot is active
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec db \
  psql -U postgres -c "SELECT * FROM pg_replication_slots;"

# Check MongoDB connectivity
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec mongo \
  mongosh --eval "db.adminCommand('ping')"
```

### Database Connection Issues

```bash
# Verify PostgreSQL is healthy
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec db \
  pg_isready -U postgres

# Check connection count
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec db \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

### Certificate Issues

The staging environment uses the Let's Encrypt Staging CA. Certificates will show as untrusted in browsers. This is expected. To test with trusted certificates temporarily:

```bash
# Override the Caddy config to use production CA
# Edit Caddyfile.staging and remove the acme_ca directive
# Then restart Caddy
docker compose -f docker-compose.yml -f docker-compose.staging.yml restart caddy
```

---

## 9. Teardown

```bash
# Stop all services (preserves data volumes)
docker compose -f docker-compose.yml -f docker-compose.staging.yml down

# Stop and remove data volumes (DESTRUCTIVE — deletes all data)
docker compose -f docker-compose.yml -f docker-compose.staging.yml down -v
```
