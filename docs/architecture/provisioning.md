# Environment Provisioning Guide

**Status:** Implemented
**Date:** 2026-06-15
**Author:** AI agent (Architect), with human direction
**Related:** [Environment Architecture](environments.md) · [ADR-0007: Hosting Strategy](0007-hosting-strategy.md) · [Deployment Guide](../../deploy/README.md)

---

## Overview

This guide provides step-by-step provisioning instructions for each Finance app environment. It covers Supabase project setup, PowerSync configuration, CI/CD secrets, database migrations, Edge Function deployment, and CDN setup for the web app.

**Audience:** Project owner setting up infrastructure from scratch.

**Time estimate:** ~4 hours for full stack (VPS + staging + production).

---

## 1. Supabase Project Setup

### 1.1 Local Development (Supabase CLI)

The local development environment runs entirely on your machine using the Supabase CLI, which orchestrates Docker containers for PostgreSQL, GoTrue, PostgREST, and Edge Functions.

**Prerequisites:**

- Docker Desktop (or Docker Engine on Linux)
- Node.js 22+
- Supabase CLI: `npm install -g supabase`

**Steps:**

```bash
# 1. Navigate to the API service directory
cd services/api

# 2. Start the local Supabase stack
supabase start

# Output will display:
#   API URL:      http://localhost:54321
#   DB URL:       postgresql://postgres:postgres@localhost:54322/postgres
#   Studio URL:   http://localhost:54323
#   Anon key:     eyJ...
#   Service key:  eyJ...

# 3. Apply migrations and seed data
supabase db reset

# 4. Start Edge Functions in watch mode
supabase functions serve

# 5. Verify
curl http://localhost:54321/functions/v1/health-check
```

**Local config file:** `services/api/supabase/config.toml` — already configured for local development with ports 54321–54323.

### 1.2 Staging Environment

Staging runs on the same VPS as production, isolated via Docker Compose project namespacing and a separate PostgreSQL database.

**Steps:**

```bash
# 1. SSH into the VPS
ssh -p <SSH_PORT> deploy@<VPS_IP>

# 2. Navigate to the staging deployment directory
cd /opt/finance/staging

# 3. Create the staging .env from the template
cp /opt/finance/deploy/.env.example .env

# 4. Configure staging-specific values
#    Edit .env with the following overrides:
#    DOMAIN=staging.finance.example.com
#    POSTGRES_DB=finance_staging
#    POSTGRES_PORT=5433
#    JWT_SECRET=<generate: openssl rand -base64 32>
#    SITE_URL=https://staging.finance.example.com
#    AUTH_REDIRECT_URLS=https://staging.finance.example.com/auth/callback
#    MAILER_AUTOCONFIRM=true  (for testing convenience)

# 5. Start the staging stack
docker compose -p staging up -d

# 6. Apply migrations
#    From your local machine (with Supabase CLI):
supabase db push --db-url "postgres://postgres:<STAGING_PW>@<VPS_IP>:5433/finance_staging"

# 7. Verify
curl -sf https://staging.finance.example.com/health | jq .
```

### 1.3 Production Environment

Production follows the deployment guide in `deploy/README.md`. Summarized here for completeness.

**Steps:**

```bash
# 1. SSH into the VPS
ssh -p <SSH_PORT> deploy@<VPS_IP>

# 2. Clone or update the repository
cd /opt/finance
git pull origin main

# 3. Create .env from template
cd deploy
cp .env.example .env

# 4. Generate all secrets
#    JWT_SECRET:        openssl rand -base64 32
#    POSTGRES_PASSWORD: openssl rand -base64 24
#    AUTH_WEBHOOK_SECRET: openssl rand -hex 32
#    CRON_SECRET:       openssl rand -hex 32

# 5. Generate Supabase API keys
#    Use the JWT_SECRET to generate ANON_KEY and SERVICE_ROLE_KEY
#    See: https://supabase.com/docs/guides/self-hosting#api-keys

# 6. Configure remaining .env values
#    DOMAIN, SITE_URL, SMTP settings, OAuth keys, etc.

# 7. Start the production stack
docker compose -p prod up -d

# 8. Apply migrations
supabase db push --db-url "postgres://postgres:<PROD_PW>@localhost:5432/postgres"

# 9. Verify all services
curl -sf https://finance.example.com/health | jq .
docker compose -p prod ps
docker compose -p prod logs --tail=20
```

---

## 2. PowerSync Instance Configuration

### 2.1 PowerSync Configuration File

Create `deploy/powersync.yaml` (used by the Docker container):

```yaml
# PowerSync Service Configuration
# Deployed alongside Supabase via Docker Compose

# Database connection (PostgreSQL logical replication)
replication:
  # Connection to the Supabase PostgreSQL instance
  connections:
    - type: postgresql
      uri: !env POWERSYNC_DB_URI
      # Slot name for logical replication
      slot_name: powersync_slot
      # Publication name
      publication_name: powersync_publication

# Client authentication (validates Supabase JWTs)
client_auth:
  supabase_jwt_secret: !env JWT_SECRET

# Sync rules (referenced from the API service)
sync_rules_path: /config/sync-rules.yaml

# Storage for replication state
storage:
  type: mongodb
  uri: !env POWERSYNC_STORAGE_URI
```

### 2.2 Add PowerSync to Docker Compose

Add to `deploy/docker-compose.yml`:

```yaml
# After the edge-functions service:

powersync:
  image: journeyapps/powersync-service:latest
  restart: unless-stopped
  environment:
    POWERSYNC_DB_URI: postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-postgres}
    JWT_SECRET: ${JWT_SECRET}
    POWERSYNC_STORAGE_URI: ${POWERSYNC_STORAGE_URI:-mongodb://mongo:27017/powersync}
  volumes:
    - ./powersync.yaml:/config/powersync.yaml:ro
    - ../services/api/powersync/sync-rules.yaml:/config/sync-rules.yaml:ro
  healthcheck:
    test: ['CMD-SHELL', 'curl -sf http://localhost:8080/api/health || exit 1']
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 20s
  depends_on:
    db:
      condition: service_healthy
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 256M
      reservations:
        cpus: '0.1'
        memory: 64M
  networks:
    - finance-internal

# MongoDB for PowerSync state storage
mongo:
  image: mongo:7
  restart: unless-stopped
  volumes:
    - mongodata:/data/db
  deploy:
    resources:
      limits:
        cpus: '0.25'
        memory: 256M
  networks:
    - finance-internal
```

Add `mongodata` to the volumes section and update Caddy to route `/sync/*` to PowerSync.

### 2.3 PostgreSQL Logical Replication Setup

PowerSync requires logical replication. The Docker Compose already configures this in the `db` service command:

```yaml
command: >
  postgres
  -c wal_level=logical
  -c max_wal_senders=10
  -c max_replication_slots=10
```

**Create the publication** (run once per environment):

```sql
-- Run in PostgreSQL after migrations:
CREATE PUBLICATION powersync_publication FOR TABLE
  households,
  accounts,
  transactions,
  categories,
  budgets,
  goals,
  household_members,
  household_invitations,
  recurring_transaction_templates,
  users,
  passkey_credentials;
```

Add this to a migration file (`services/api/supabase/migrations/`) so it's applied automatically.

### 2.4 Environment-Specific PowerSync URLs

| Environment | PowerSync URL                              |
| ----------- | ------------------------------------------ |
| Local       | `http://localhost:8080` (or bypass in dev) |
| Staging     | `https://staging.finance.example.com/sync` |
| Production  | `https://finance.example.com/sync`         |

---

## 3. CI/CD Environment Variables and Secrets

### 3.1 GitHub Repository Secrets

Navigate to **Repository Settings → Secrets and variables → Actions**.

**Repository-level secrets** (shared across all workflows):

| Secret              | Purpose                            | How to Generate                     |
| ------------------- | ---------------------------------- | ----------------------------------- |
| `SENTRY_AUTH_TOKEN` | Upload source maps/dSYMs to Sentry | Sentry → Settings → Auth Tokens     |
| `CODECOV_TOKEN`     | Upload coverage reports            | Codecov dashboard                   |
| `TURBO_TOKEN`       | Turborepo remote cache             | `npx turbo login && npx turbo link` |
| `TURBO_TEAM`        | Turborepo team slug                | From Vercel dashboard               |

### 3.2 GitHub Environment Secrets

**Environment: `staging`**

| Secret                     | Purpose                               |
| -------------------------- | ------------------------------------- |
| `STAGING_DEPLOY_SSH_KEY`   | SSH private key for VPS deployment    |
| `STAGING_VPS_HOST`         | VPS IP/hostname for staging           |
| `STAGING_VPS_USER`         | SSH user on VPS                       |
| `STAGING_SUPABASE_URL`     | `https://staging.finance.example.com` |
| `STAGING_ANON_KEY`         | Staging Supabase anon key             |
| `STAGING_SERVICE_ROLE_KEY` | Staging Supabase service role key     |

**Environment: `production`** (with manual approval gate)

| Secret                  | Purpose                            |
| ----------------------- | ---------------------------------- |
| `PROD_DEPLOY_SSH_KEY`   | SSH private key for VPS deployment |
| `PROD_VPS_HOST`         | VPS IP/hostname for production     |
| `PROD_VPS_USER`         | SSH user on VPS                    |
| `PROD_SUPABASE_URL`     | `https://finance.example.com`      |
| `PROD_ANON_KEY`         | Production Supabase anon key       |
| `PROD_SERVICE_ROLE_KEY` | Production service role key        |

**Platform release secrets** (in `production` environment):

| Secret                      | Purpose                             |
| --------------------------- | ----------------------------------- |
| `APPLE_API_KEY_ID`          | App Store Connect API key ID        |
| `APPLE_API_KEY_ISSUER_ID`   | App Store Connect issuer ID         |
| `APPLE_API_KEY_CONTENT`     | App Store Connect API private key   |
| `MATCH_PASSWORD`            | Fastlane Match encryption password  |
| `MATCH_GIT_URL`             | Git repo URL for Match certificates |
| `GOOGLE_PLAY_JSON_KEY`      | Play Console service account JSON   |
| `ANDROID_KEYSTORE`          | Base64-encoded release keystore     |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                   |
| `ANDROID_KEY_ALIAS`         | Key alias within keystore           |
| `ANDROID_KEY_PASSWORD`      | Key password                        |
| `WINDOWS_SIGNING_CERT`      | Base64-encoded MSIX signing cert    |
| `WINDOWS_SIGNING_CERT_PW`   | Certificate password                |
| `MS_STORE_SELLER_ID`        | Microsoft Partner Center seller ID  |
| `MS_STORE_CLIENT_ID`        | Azure AD app client ID              |
| `MS_STORE_CLIENT_SECRET`    | Azure AD app client secret          |

### 3.3 GitHub Environment Configuration

```
Settings → Environments:

staging:
  - Protection rules: None (auto-deploy on merge)
  - Deployment branches: main only

production:
  - Protection rules: Required reviewers (project owner)
  - Wait timer: 0 (manual approval, no delay after)
  - Deployment branches: main only
```

---

## 4. Database Migration Strategy Across Environments

### 4.1 Migration File Convention

All migrations live in `services/api/supabase/migrations/` with the naming convention:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20260306000001_initial_schema.sql`

### 4.2 Migration Flow per Environment

```
Developer writes migration
    │
    ├── Local: `supabase db reset` (drops and recreates — full replay)
    │          or `supabase db push` (incremental — for testing)
    │
    ├── CI:    `supabase db reset` (clean slate every run)
    │
    ├── Staging (automated on merge to main):
    │   └── SSH → `supabase db push --db-url <staging_connection_string>`
    │       Runs only NEW migrations (tracks applied via supabase_migrations table)
    │
    └── Production (manual approval required):
        └── GitHub Environment approval → SSH → `supabase db push --db-url <prod_connection_string>`
            Same incremental approach as staging
```

### 4.3 Migration Safety Checklist

Before merging any migration:

- [ ] Forward migration tested locally (`supabase db reset`)
- [ ] Reverse migration written and tested (`.down.sql`)
- [ ] Migration is idempotent (safe to re-run — use `IF NOT EXISTS`, `CREATE OR REPLACE`)
- [ ] No destructive changes without expand/contract pattern
- [ ] RLS policies updated if new tables added
- [ ] PowerSync sync rules updated if schema changes affect synced tables
- [ ] Performance: `EXPLAIN ANALYZE` on new queries/indexes with realistic data volume

### 4.4 Emergency Migration Rollback

```bash
# 1. Identify the bad migration
supabase db migrations list --db-url <connection_string>

# 2. Apply the reverse migration
psql <connection_string> -f services/api/supabase/migrations/<timestamp>_description.down.sql

# 3. Update the migrations tracking table
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '<timestamp>';

# 4. Verify
supabase db migrations list --db-url <connection_string>
```

---

## 5. Edge Function Deployment per Environment

### 5.1 Function Inventory

Current Edge Functions in `services/api/supabase/functions/`:

| Function               | Auth Required  | Purpose                                  |
| ---------------------- | -------------- | ---------------------------------------- |
| `health-check`         | No             | Service health verification              |
| `auth-webhook`         | Webhook secret | Auth event processing                    |
| `passkey-register`     | JWT            | WebAuthn registration ceremony           |
| `passkey-authenticate` | JWT            | WebAuthn authentication ceremony         |
| `household-invite`     | JWT            | Send/manage household invitations        |
| `account-deletion`     | JWT            | GDPR account deletion (crypto-shredding) |
| `data-export`          | JWT            | GDPR data export                         |
| `process-recurring`    | Cron secret    | Generate recurring transactions          |
| `send-notification`    | Service role   | Push notification dispatch               |
| `sync-health-report`   | JWT            | Client sync health reporting             |
| `admin-dashboard`      | Service role   | Admin metrics and management             |
| `manage-webhooks`      | JWT            | Webhook configuration                    |

### 5.2 Deployment per Environment

**Local:**

```bash
# Hot-reload all functions
cd services/api
supabase functions serve
```

**Staging and Production (via Docker):**

Edge Functions are deployed as a volume mount in Docker Compose:

```yaml
edge-functions:
  volumes:
    - ${EDGE_FUNCTIONS_PATH:-../services/api/supabase/functions}:/home/deno/functions:ro
```

**Deployment is a `git pull` + container restart:**

```bash
# On VPS:
cd /opt/finance
git pull origin main
docker compose -p <env> restart edge-functions
```

### 5.3 Function-Specific Environment Variables

Edge Functions receive environment variables via the Docker Compose configuration. All secrets are injected from the `.env` file — functions never contain hardcoded values.

| Variable              | Used By                                    |
| --------------------- | ------------------------------------------ |
| `JWT_SECRET`          | All authenticated functions                |
| `SUPABASE_DB_URL`     | Functions with direct DB access            |
| `AUTH_WEBHOOK_SECRET` | `auth-webhook`                             |
| `CRON_SECRET`         | `process-recurring`                        |
| `WEBAUTHN_RP_*`       | `passkey-register`, `passkey-authenticate` |
| `ALLOWED_ORIGINS`     | CORS configuration                         |

---

## 6. CDN Configuration for Web App

### 6.1 Initial Approach: VPS-Served Static Files

Per ADR-0007 (self-hosted), the web app is initially served from the VPS via Caddy. This keeps infrastructure minimal and costs at zero marginal increase.

**Caddy static file serving (add to Caddyfile):**

```
# Web app static files
handle /app/* {
    root * /opt/finance/web-dist
    file_server
    try_files {path} /app/index.html  # SPA fallback
    header {
        Cache-Control "public, max-age=31536000, immutable"  # hashed assets
    }
    @html path *.html
    header @html Cache-Control "no-cache"  # HTML always revalidated
}
```

**Deployment:**

```bash
# Build the web app (CI or locally)
cd apps/web
npm run build

# Deploy to VPS
rsync -avz dist/ deploy@<VPS_IP>:/opt/finance/web-dist/
```

### 6.2 Future: CDN Layer (When Traffic Warrants)

When traffic grows beyond what a single VPS can serve efficiently, add Cloudflare in front:

```
Users → Cloudflare CDN (edge cache) → VPS (origin)
```

**Cloudflare configuration:**

- **Caching:** Cache all static assets (JS, CSS, images, fonts) at the edge. HTML is revalidated.
- **Page Rules:** `*.finance.example.com/app/assets/*` — Cache Level: Cache Everything, Edge TTL: 1 month
- **Security:** WAF rules, rate limiting, DDoS protection
- **Headers:** `Cache-Control` and `ETag` set by Caddy, respected by Cloudflare
- **Purge:** On deploy, purge `/app/index.html` only. Hashed asset filenames ensure cache busting.

### 6.3 Service Worker Strategy

The web app uses a service worker for offline support and cache management:

```
┌─────────────────────────────────────────┐
│  Service Worker Cache Strategy           │
│                                          │
│  App shell (HTML, JS, CSS):              │
│    Strategy: StaleWhileRevalidate        │
│    Cache: precache-v{version}            │
│                                          │
│  API calls (/rest/*, /auth/*):           │
│    Strategy: NetworkFirst                │
│    Fallback: cached response             │
│                                          │
│  Static assets (images, fonts):          │
│    Strategy: CacheFirst                  │
│    Cache: assets-v{version}              │
└─────────────────────────────────────────┘
```

**Version update flow:**

1. New build deployed → new service worker version
2. Service worker detects update on next navigation
3. Show "Update available" toast to user
4. User clicks to reload → new version activates
5. Never force-reload during active use

---

## 7. DNS Configuration

### 7.1 Required DNS Records

| Record Type | Host                          | Value                 | TTL  |
| ----------- | ----------------------------- | --------------------- | ---- |
| A           | `finance.example.com`         | `<VPS_IP>`            | 300  |
| A           | `staging.finance.example.com` | `<VPS_IP>`            | 300  |
| CNAME       | `www.finance.example.com`     | `finance.example.com` | 3600 |

### 7.2 DNS Propagation Verification

```bash
# Verify DNS resolution
dig +short finance.example.com
dig +short staging.finance.example.com

# Verify TLS certificate
curl -vI https://finance.example.com 2>&1 | grep "SSL certificate"
```

---

## 8. Post-Provisioning Verification Checklist

Run after completing all provisioning steps:

- [ ] **PostgreSQL** — `pg_isready` returns success for both staging and production
- [ ] **Migrations** — `supabase db migrations list` shows all migrations applied
- [ ] **GoTrue Auth** — `curl https://<domain>/auth/health` returns `200`
- [ ] **PostgREST** — `curl https://<domain>/rest/` returns API schema
- [ ] **Edge Functions** — `curl https://<domain>/functions/v1/health-check` returns healthy JSON
- [ ] **PowerSync** — `curl https://<domain>/sync/api/health` returns healthy
- [ ] **TLS** — Certificates issued by Let's Encrypt, HSTS header present
- [ ] **Firewall** — Only ports 80, 443, and SSH are open (`nmap <VPS_IP>`)
- [ ] **Backups** — Manual `pg_dump` succeeds, backup cron job configured
- [ ] **Monitoring** — Uptime check configured and reporting green
- [ ] **DNS** — All records resolve correctly
- [ ] **OAuth** — Test login with Apple and Google on staging

---

## 9. References

- [Deployment Guide](../../deploy/README.md) — Full deployment instructions
- [Environment Architecture](environments.md) — Environment definitions
- [ADR-0007: Hosting Strategy](0007-hosting-strategy.md) — Self-hosting rationale
- [ADR-0004: Auth & Security Architecture](0004-auth-security-architecture.md) — Auth configuration
- [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [PowerSync Self-Hosting Docs](https://docs.powersync.com/self-hosting)
- [Caddy Documentation](https://caddyserver.com/docs/)
