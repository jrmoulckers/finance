# Infrastructure & Resource Naming Standards

**Status:** Active
**Date:** 2026-05-12
**Owner:** @architect
**Scope:** All environments, platforms, and infrastructure for the Finance monorepo
**Related:** [Hosting Strategy (ADR-0007)](../architecture/0007-hosting-strategy.md) · [Environments](environments.md) · [Monitoring Setup](monitoring-setup.md) · [Launch Readiness Plan](launch-readiness-plan.md)

---

> **This document is the single source of truth** for all naming conventions across the Finance project's infrastructure, CI/CD, databases, code artifacts, and operational tooling. Every new resource, service, pipeline, or artifact MUST follow these standards. Deviations require an ADR.

## Table of Contents

- [Quick-Reference Table](#quick-reference-table)
- [1. Azure Resource Naming](#1-azure-resource-naming)
- [2. Environment Strategy](#2-environment-strategy)
- [3. Resource Tagging Strategy](#3-resource-tagging-strategy)
- [4. Docker & Container Naming](#4-docker--container-naming)
- [5. DNS & Domain Naming](#5-dns--domain-naming)
- [6. Secret & Configuration Naming](#6-secret--configuration-naming)
- [7. GitHub Repository Standards](#7-github-repository-standards)
- [8. Monitoring & Alerting Naming](#8-monitoring--alerting-naming)
- [9. CI/CD Pipeline Naming](#9-cicd-pipeline-naming)
- [10. Database Naming](#10-database-naming)
- [11. Code Artifact Naming](#11-code-artifact-naming)
- [12. Security Standards](#12-security-standards)
- [Migration Notes](#migration-notes)

---

## Quick-Reference Table

| Resource              | Pattern                              | Example                             |
| --------------------- | ------------------------------------ | ----------------------------------- |
| Azure Resource Group  | `{app}-{env}-{region}-rg`            | `finance-prod-eastus-rg`            |
| Azure VM              | `{app}-{env}-{role}-vm`              | `finance-prod-api-vm`               |
| Azure NSG             | `{app}-{env}-{role}-nsg`             | `finance-prod-api-nsg`              |
| Azure VNet            | `{app}-{env}-{region}-vnet`          | `finance-prod-eastus-vnet`          |
| Azure Subnet          | `{app}-{env}-{purpose}-snet`         | `finance-prod-backend-snet`         |
| Azure NIC             | `{app}-{env}-{role}-nic`             | `finance-prod-api-nic`              |
| Azure Public IP       | `{app}-{env}-{role}-pip`             | `finance-prod-api-pip`              |
| Azure OS Disk         | `{app}-{env}-{role}-osdisk`          | `finance-prod-api-osdisk`           |
| Azure Data Disk       | `{app}-{env}-{role}-datadisk-{n}`    | `finance-prod-api-datadisk-1`       |
| Azure Key Vault       | `{app}-{env}-kv`                     | `finance-prod-kv`                   |
| Docker container      | `finance-{service}`                  | `finance-postgres`                  |
| Docker volume         | `finance-{service}-data`             | `finance-postgres-data`             |
| Docker network        | `finance-{scope}`                    | `finance-internal`                  |
| Docker image tag      | `finance/{service}:{semver}`         | `finance/edge-functions:1.2.3`      |
| Domain (prod)         | `finance.{base-domain}`              | `finance.jrmoulckers.com`           |
| Subdomain (staging)   | `finance-staging.{base-domain}`      | `finance-staging.jrmoulckers.com`   |
| API endpoint          | `{domain}/rest/`                     | `finance.jrmoulckers.com/rest/`     |
| Env variable          | `{SERVICE}_{KEY}`                    | `POSTGRES_PASSWORD`                 |
| GitHub Actions secret | `{SERVICE}_{KEY}` (env-scoped)       | `SUPABASE_URL` (in `staging` env)   |
| GitHub branch         | `{type}/{description}-{issue#}`      | `feat/budget-rollover-134`          |
| Git tag               | `v{major}.{minor}.{patch}`           | `v1.2.3`                            |
| GitHub Environment    | Full word                            | `staging`, `production`             |
| Sentry project        | `finance-{platform}`                 | `finance-web`                       |
| UptimeRobot monitor   | `Finance — {Service} ({env})`        | `Finance — API (prod)`              |
| CI workflow file      | `{purpose}.yml`                      | `deploy-staging.yml`                |
| CI artifact           | `{app}-{platform}-{version}`         | `finance-android-1.2.3`             |
| DB table              | `snake_case`, singular               | `transaction`                       |
| DB index              | `idx_{table}_{columns}`              | `idx_transaction_account_id`        |
| DB FK constraint      | `fk_{table}_{ref_table}`             | `fk_transaction_account`            |
| DB migration          | `{YYYYMMDDHHMMSS}_{description}.sql` | `20260306000001_initial_schema.sql` |
| Feature flag          | `ff_{feature_name}`                  | `ff_budget_rollover`                |
| KMP package           | `com.finance.{module}`               | `com.finance.core`                  |
| Test file             | `{SourceFile}.test.{ext}`            | `BudgetCalculator.test.ts`          |

---

## 1. Azure Resource Naming

### Why

Azure resources persist for months or years. Consistent naming enables at-a-glance identification of an resource's purpose, environment, and region — critical during incidents when seconds matter. These conventions follow Microsoft's [Cloud Adoption Framework (CAF) naming conventions](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming).

### Conventions

All Azure resource names use **lowercase**, **hyphen-delimited** segments. The general pattern is:

```
{app}-{env}-{qualifier}-{resource-type-suffix}
```

- `{app}` — Always `finance`
- `{env}` — Environment short code: `dev`, `stg`, `prod`
- `{qualifier}` — Role, region, or purpose (context-dependent)
- `{resource-type-suffix}` — CAF-aligned abbreviation (`rg`, `vm`, `nsg`, `vnet`, `snet`, `nic`, `pip`, `kv`)

### Resource Group

| Component             | Value                     |
| --------------------- | ------------------------- |
| **Pattern**           | `{app}-{env}-{region}-rg` |
| **Example (prod)**    | `finance-prod-eastus-rg`  |
| **Example (staging)** | `finance-stg-eastus-rg`   |

**Why region is included:** Resource groups are region-scoped. Including it prevents ambiguity if the project ever spans regions.

### Virtual Machine

| Component             | Value                   |
| --------------------- | ----------------------- |
| **Pattern**           | `{app}-{env}-{role}-vm` |
| **Example (prod)**    | `finance-prod-api-vm`   |
| **Example (staging)** | `finance-stg-api-vm`    |

Current deployment uses a single Azure B2s VM running the full Docker Compose stack. The role is `api` because the VM's purpose is serving the backend API and sync layer.

### Network Security Group (NSG)

| Component   | Value                    |
| ----------- | ------------------------ |
| **Pattern** | `{app}-{env}-{role}-nsg` |
| **Example** | `finance-prod-api-nsg`   |

NSGs are attached per-NIC or per-subnet. Name them after their attachment point.

### Virtual Network & Subnet

| Component          | Value                        |
| ------------------ | ---------------------------- |
| **VNet pattern**   | `{app}-{env}-{region}-vnet`  |
| **VNet example**   | `finance-prod-eastus-vnet`   |
| **Subnet pattern** | `{app}-{env}-{purpose}-snet` |
| **Subnet example** | `finance-prod-backend-snet`  |

### Network Interface & Public IP

| Component             | Value                    |
| --------------------- | ------------------------ |
| **NIC pattern**       | `{app}-{env}-{role}-nic` |
| **NIC example**       | `finance-prod-api-nic`   |
| **Public IP pattern** | `{app}-{env}-{role}-pip` |
| **Public IP example** | `finance-prod-api-pip`   |

### Managed Disks

| Component             | Value                             |
| --------------------- | --------------------------------- |
| **OS disk pattern**   | `{app}-{env}-{role}-osdisk`       |
| **OS disk example**   | `finance-prod-api-osdisk`         |
| **Data disk pattern** | `{app}-{env}-{role}-datadisk-{n}` |
| **Data disk example** | `finance-prod-api-datadisk-1`     |

### Key Vault (future use)

| Component   | Value             |
| ----------- | ----------------- |
| **Pattern** | `{app}-{env}-kv`  |
| **Example** | `finance-prod-kv` |

> **Note:** Key Vault names must be globally unique across Azure (3–24 chars, alphanumeric and hyphens). If `finance-prod-kv` is taken, append a short disambiguator: `finance-prod-kv1`.

### Anti-patterns

| ❌ Don't                                                   | ✅ Do                    |
| ---------------------------------------------------------- | ------------------------ |
| `FinanceVM` (PascalCase, no env/role)                      | `finance-prod-api-vm`    |
| `prod-rg` (no app prefix)                                  | `finance-prod-eastus-rg` |
| `finance_prod_api_vm` (underscores)                        | `finance-prod-api-vm`    |
| `financeapp-production-apiserver-virtualmachine` (verbose) | `finance-prod-api-vm`    |
| `vm1`, `rg2` (opaque numbering)                            | `finance-stg-api-vm`     |

---

## 2. Environment Strategy

### Why

Clear environment boundaries prevent accidental cross-environment data leaks — catastrophic for a financial app. Every engineer and every automation must know exactly which environment they're targeting.

### Environment Definitions

| Environment     | Code   | Purpose                                         | Where It Runs                                                   | Branch                   |
| --------------- | ------ | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| **Development** | `dev`  | Local development and testing                   | Developer's machine (Docker Desktop)                            | Any feature branch       |
| **Staging**     | `stg`  | Pre-release validation, QA, integration testing | Azure VM (Docker Compose with staging overrides) or separate VM | `main`, `release/*`      |
| **Production**  | `prod` | Live user-facing service                        | Azure VM (Docker Compose, primary)                              | `main` (tagged releases) |

### Environment Details

#### Development (`dev`)

- Runs locally via `docker compose up` with the base `docker-compose.yml`
- Uses `.env` populated from `.env.example` with local-only credentials
- Postgres data is ephemeral (can be wiped with `docker compose down -v`)
- Auto-confirm email signups enabled
- Debug logging on all services
- No TLS required (Caddy runs in HTTP mode or is bypassed)

#### Staging (`stg`)

- Runs on Azure VM using `docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d`
- Uses `.env` populated from `.env.staging.example` with staging-specific credentials
- Staging subdomain: `staging.{domain}` with Let's Encrypt staging CA certificates
- Lower resource limits than production (see `docker-compose.staging.yml`)
- Auto-confirm email signups enabled for QA convenience
- Debug-level logging on Edge Functions
- Postgres and MongoDB ports exposed for debugging
- Backup retention: 7 days

#### Production (`prod`)

- Runs on Azure VM using `docker compose up -d` with the base `docker-compose.yml`
- Uses `.env` populated from `.env.example` with production credentials
- Production domain with production Let's Encrypt certificates
- Full resource limits as specified in `docker-compose.yml`
- Email confirmation required
- Minimal logging (`log_min_duration_statement=1000`, DDL-only statement logging)
- No database ports exposed externally
- Backup retention: 30 days (7 daily + 4 weekly + 3 monthly)

### Promotion Flow

```
dev (local) ──→ staging (Azure VM) ──→ production (Azure VM)
                    │                        │
                    └─ Auto on main push     └─ Manual approval (2 reviewers)
                       or manual dispatch       + 5-min cooling-off period
```

1. Developer works on feature branch locally (`dev`)
2. PR merged to `main` → auto-deploys to `staging`
3. QA validates on staging
4. Git tag `vX.Y.Z` pushed → triggers `production` deployment with approval gate

### GitHub Environment Mapping

| GitHub Environment | Env code | Notes                               |
| ------------------ | -------- | ----------------------------------- |
| `development`      | `dev`    | PR previews, feature branch testing |
| `staging`          | `stg`    | Pre-release validation              |
| `production`       | `prod`   | Live releases, requires 2 approvers |

> **Important:** GitHub Environments use full words (`staging`, `production`), while resource naming and env variables use short codes (`stg`, `prod`). This follows GitHub's convention while keeping infrastructure names concise.

### Anti-patterns

| ❌ Don't                                    | ✅ Do                                                          |
| ------------------------------------------- | -------------------------------------------------------------- |
| Use `test` or `qa` as an environment        | Use `stg` — one pre-production environment keeps things simple |
| Share credentials between `stg` and `prod`  | Generate unique secrets per environment                        |
| Deploy to `prod` without staging validation | Always promote through staging first                           |
| Use `prod` database for development         | Use local Docker Compose with ephemeral data                   |

---

## 3. Resource Tagging Strategy

### Why

Tags enable cost tracking, ownership identification, and automated governance across Azure resources. With $150/mo Azure credits, knowing where spend goes is essential. Tags are also critical for automated cleanup of orphaned resources.

### Required Tags

Every Azure resource MUST have these tags. Resources without required tags should be flagged for remediation.

| Tag Key       | Description                    | Allowed Values                          |
| ------------- | ------------------------------ | --------------------------------------- |
| `app`         | Application name               | `finance`                               |
| `env`         | Environment                    | `dev`, `stg`, `prod`                    |
| `owner`       | Team or individual responsible | `jrmoulckers`                           |
| `cost-center` | Budget allocation group        | `finance-infra`                         |
| `managed-by`  | How the resource is managed    | `manual`, `github-actions`, `terraform` |

### Optional Tags

| Tag Key        | Description                          | Example                          |
| -------------- | ------------------------------------ | -------------------------------- |
| `created-by`   | Who or what created the resource     | `github-actions`, `jrmoulckers`  |
| `created-date` | ISO 8601 creation date               | `2026-05-12`                     |
| `ttl`          | Time-to-live for temporary resources | `7d`, `30d`, `never`             |
| `component`    | Specific service component           | `postgres`, `caddy`, `powersync` |
| `ticket`       | Related GitHub issue                 | `#268`, `#881`                   |

### Tag Value Rules

- All tag values are **lowercase**
- Use **hyphens** as word separators (not underscores or spaces)
- No special characters except hyphens
- Maximum 256 characters per value (Azure limit)

### Example Tag Sets

#### Production VM

```json
{
  "app": "finance",
  "env": "prod",
  "owner": "jrmoulckers",
  "cost-center": "finance-infra",
  "managed-by": "manual",
  "component": "api-stack",
  "created-date": "2026-05-12"
}
```

#### Staging VM

```json
{
  "app": "finance",
  "env": "stg",
  "owner": "jrmoulckers",
  "cost-center": "finance-infra",
  "managed-by": "manual",
  "component": "api-stack",
  "ttl": "never"
}
```

#### Temporary Debug Resource

```json
{
  "app": "finance",
  "env": "dev",
  "owner": "jrmoulckers",
  "cost-center": "finance-infra",
  "managed-by": "manual",
  "created-by": "jrmoulckers",
  "ttl": "7d"
}
```

### Anti-patterns

| ❌ Don't                                         | ✅ Do                                         |
| ------------------------------------------------ | --------------------------------------------- |
| `Env: Production` (PascalCase, inconsistent key) | `env: prod`                                   |
| Leave resources untagged                         | Apply all 5 required tags at creation time    |
| Use freeform text in tag values                  | Use controlled vocabulary from tables above   |
| Tag only VMs but not disks/NICs                  | Tag every resource, including child resources |

---

## 4. Docker & Container Naming

### Why

The Docker Compose stack has 7 services running on a single VM. Clear, predictable container names let operators quickly identify services in `docker ps`, logs, and monitoring. Consistent volume names prevent accidental data loss during stack recreation.

### Container Names

| Pattern        | `finance-{service}`                                                                     |
| -------------- | --------------------------------------------------------------------------------------- |
| **Convention** | Prefix all containers with `finance-`. Service names are short, descriptive, lowercase. |

| Service        | Container Name           | Current (`docker-compose.yml`) |
| -------------- | ------------------------ | ------------------------------ |
| PostgreSQL     | `finance-postgres`       | `db` (implicit)                |
| PostgREST      | `finance-rest`           | `rest` (implicit)              |
| GoTrue Auth    | `finance-auth`           | `auth` (implicit)              |
| Postgres Meta  | `finance-meta`           | `meta` (implicit)              |
| Edge Functions | `finance-edge-functions` | `edge-functions` (implicit)    |
| PowerSync      | `finance-powersync`      | `powersync` (implicit)         |
| MongoDB        | `finance-mongo`          | `mongo` (implicit)             |
| Caddy          | `finance-caddy`          | `caddy` (implicit)             |

> **Current state:** The existing `docker-compose.yml` uses implicit container names derived from the service key (e.g., service `db` gets container name `deploy-db-1`). See [Migration Notes](#migration-notes) for the recommended transition.

### Volume Naming

| Pattern        | `finance-{service}-data`                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Convention** | Volumes store persistent data. Name them after the service they belong to, suffixed with `-data`. Config volumes use `-config`. |

| Volume          | Recommended Name        | Current Name   |
| --------------- | ----------------------- | -------------- |
| PostgreSQL data | `finance-postgres-data` | `pgdata`       |
| MongoDB data    | `finance-mongo-data`    | `mongodata`    |
| Caddy TLS certs | `finance-caddy-data`    | `caddy_data`   |
| Caddy config    | `finance-caddy-config`  | `caddy_config` |

### Network Naming

| Pattern        | `finance-{scope}`                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convention** | Networks are named by scope. The internal network carries all inter-service traffic. The external network is the Caddy-only egress network. |

| Network  | Name               | Purpose                                                   |
| -------- | ------------------ | --------------------------------------------------------- |
| Internal | `finance-internal` | All service-to-service traffic (bridge, `internal: true`) |
| External | `finance-external` | Caddy → internet (bridge, allows egress)                  |

> **Current state:** The existing `docker-compose.yml` already uses `finance-internal` and `finance-external`. ✅ No change needed.

### Image Tagging Strategy

For custom-built images (currently none, but planned for custom Edge Functions or sidecar containers):

| Pattern       | `finance/{service}:{tag}` |
| ------------- | ------------------------- |
| **Tag types** | See table below           |

| Tag        | When Used                                       | Example                          |
| ---------- | ----------------------------------------------- | -------------------------------- |
| `latest`   | Default development build                       | `finance/edge-functions:latest`  |
| `{semver}` | Release builds                                  | `finance/edge-functions:1.2.3`   |
| `{sha}`    | CI builds for traceability                      | `finance/edge-functions:a1b2c3d` |
| `{env}`    | Environment-specific builds (avoid if possible) | `finance/edge-functions:staging` |

**Prefer immutable semver tags over `latest` in all compose files that target staging or production.**

### Anti-patterns

| ❌ Don't                                               | ✅ Do                                          |
| ------------------------------------------------------ | ---------------------------------------------- |
| `postgres_container_1` (auto-generated)                | `finance-postgres` (explicit)                  |
| `data` (ambiguous volume name)                         | `finance-postgres-data`                        |
| `mynetwork` (generic)                                  | `finance-internal`                             |
| Use `latest` tag in production compose files           | Pin to a specific version or SHA               |
| Mix underscores and hyphens (`caddy_data` vs `pgdata`) | Use hyphens consistently: `finance-caddy-data` |

---

## 5. DNS & Domain Naming

### Why

DNS names are the most visible identifier of the project. They appear in TLS certificates, OAuth redirect URIs, mobile deep links, and user-facing error messages. A consistent scheme prevents OAuth misconfiguration and simplifies TLS management.

### Domain Structure

The alpha deployment uses a subdomain of the owner's personal domain. A dedicated product domain will be registered before public launch.

| Level               | Pattern                         | Alpha Value                       |
| ------------------- | ------------------------------- | --------------------------------- |
| **Production**      | `finance.{base-domain}`         | `finance.jrmoulckers.com`         |
| **Staging**         | `finance-staging.{base-domain}` | `finance-staging.jrmoulckers.com` |
| **Transact. email** | `mail.{base-domain}`            | `mail.jrmoulckers.com`            |
| **Base domain**     | (owner's domain)                | `jrmoulckers.com` (Namecheap)     |

> **Note:** All configurations use the `DOMAIN` environment variable, so migrating to a dedicated domain (e.g., `financetrackerapp.com`) later requires updating only `.env` — no code changes.

> **Transactional email** is sent via **Resend** from a dedicated `mail.{base-domain}` subdomain (`mail.jrmoulckers.com`), verified with SPF/DKIM/DMARC. The from-address is `finance@mail.jrmoulckers.com` (`SMTP_ADMIN_EMAIL`). Keeping the sending domain separate from the app domain (`finance.jrmoulckers.com`) isolates email authentication from the app's own DNS. See [password-reset-email.md](password-reset-email.md).

### Path-Based Routing (Current Architecture)

The current self-hosted architecture uses **path-based routing** through Caddy on a single domain, not separate subdomains per service. This is simpler to manage, requires only one TLS certificate, and works well at the current scale.

| Path           | Backend Service        | Purpose                         |
| -------------- | ---------------------- | ------------------------------- |
| `/rest/*`      | PostgREST `:3000`      | RESTful API                     |
| `/auth/*`      | GoTrue `:9999`         | Authentication                  |
| `/sync/*`      | PowerSync `:8080`      | Offline-first sync              |
| `/functions/*` | Edge Functions `:9000` | Serverless functions            |
| `/health`      | Edge Functions `:9000` | Health check endpoint           |
| `/*`           | Caddy file server      | PWA static files (SPA fallback) |

### Subdomain Strategy (Future Scale)

If the project grows beyond a single VM and requires dedicated hosts per service, migrate to subdomains:

| Subdomain         | Service     | When to Use                 |
| ----------------- | ----------- | --------------------------- |
| `api.{domain}`    | PostgREST   | Dedicated API host          |
| `auth.{domain}`   | GoTrue      | Dedicated auth host         |
| `sync.{domain}`   | PowerSync   | Dedicated sync host         |
| `app.{domain}`    | Web PWA     | Separate CDN/Vercel hosting |
| `status.{domain}` | Status page | Public uptime page          |

### Environment Subdomains

| Pattern        | `finance-{env}.{base-domain}` for subdomained deployments                          |
| -------------- | ---------------------------------------------------------------------------------- |
| **Convention** | Environment suffix on the app subdomain. NOT a sub-subdomain of the app subdomain. |

| Environment | URL                                       |
| ----------- | ----------------------------------------- |
| Production  | `https://finance.jrmoulckers.com`         |
| Staging     | `https://finance-staging.jrmoulckers.com` |
| Development | `http://localhost` (no DNS)               |

> **Rationale:** `finance-staging.jrmoulckers.com` avoids multi-level subdomain complexity (no `staging.finance.jrmoulckers.com`). DNS A records are simpler — each is a direct entry on the base domain. When migrating to a dedicated domain, staging becomes `staging.{domain}`.

### Vercel (Web Frontend)

The web PWA may also be deployed to Vercel (free tier) for preview deployments:

| Purpose             | URL Pattern                                 |
| ------------------- | ------------------------------------------- |
| Production (Vercel) | `finance-web.vercel.app` (or custom domain) |
| PR preview          | `finance-web-{hash}.vercel.app`             |

### OAuth Redirect URIs

Configured in `.env` via `AUTH_REDIRECT_URLS`:

| Platform              | URI Pattern                                             |
| --------------------- | ------------------------------------------------------- |
| Web (prod)            | `https://finance.jrmoulckers.com/auth/callback`         |
| Web (staging)         | `https://finance-staging.jrmoulckers.com/auth/callback` |
| iOS/Android           | `com.finance.app://auth/callback`                       |
| iOS/Android (staging) | `com.finance.staging://auth/callback`                   |

### Internal Service Names

Within the Docker Compose network, services reference each other by their Compose service key:

| DNS Name         | Resolves To             | Used By                                      |
| ---------------- | ----------------------- | -------------------------------------------- |
| `db`             | PostgreSQL container    | PostgREST, GoTrue, Edge Functions, PowerSync |
| `rest`           | PostgREST container     | Caddy, Edge Functions                        |
| `auth`           | GoTrue container        | Caddy                                        |
| `edge-functions` | Deno runtime container  | Caddy                                        |
| `powersync`      | PowerSync container     | Caddy                                        |
| `mongo`          | MongoDB container       | PowerSync                                    |
| `caddy`          | Reverse proxy container | (internet-facing)                            |

These are Docker's internal DNS names and are not externally resolvable.

### Anti-patterns

| ❌ Don't                                                  | ✅ Do                             |
| --------------------------------------------------------- | --------------------------------- |
| `staging.finance.jrmoulckers.com` (sub-sub-domain)        | `finance-staging.jrmoulckers.com` |
| `finance-api-prod.azurewebsites.net` (provider in domain) | Use a custom domain               |
| Hardcode domain in source code                            | Use `DOMAIN` env var everywhere   |
| Use IP addresses in client configs                        | Always use DNS names              |

---

## 6. Secret & Configuration Naming

### Why

The Finance backend has 30+ environment variables across 8 services. Consistent naming prevents misconfiguration that could leak data between environments or services. Secret naming also drives GitHub Actions secret organization and rotation procedures.

### Environment Variable Naming

| Pattern | `{SERVICE}_{KEY}` (uppercase, underscore-delimited) |
| ------- | --------------------------------------------------- |

#### Conventions

1. **Service prefix** — Group variables by the service that consumes them
2. **UPPERCASE** — All env vars use SCREAMING_SNAKE_CASE
3. **No `FINANCE_` prefix** — Within the `.env` file, the context is already Finance. Adding a redundant prefix increases verbosity without value
4. **Boolean values** — Use `true` / `false` (lowercase string)
5. **List values** — Comma-separated, no spaces

#### Current Variable Groups (from `.env.example`)

| Group           | Prefix/Pattern                   | Examples                                            |
| --------------- | -------------------------------- | --------------------------------------------------- |
| Domain & TLS    | `DOMAIN`, `TLS_EMAIL`            | `DOMAIN=financetrackerapp.com`                      |
| PostgreSQL      | `POSTGRES_*`                     | `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` |
| JWT             | `JWT_*`                          | `JWT_SECRET`, `JWT_EXPIRY`                          |
| Supabase keys   | `*_KEY`                          | `ANON_KEY`, `SERVICE_ROLE_KEY`                      |
| Auth (GoTrue)   | `AUTH_*`, `SITE_URL`, `MAILER_*` | `AUTH_REDIRECT_URLS`, `AUTH_RATE_LIMIT_EMAIL`       |
| SMTP            | `SMTP_*`                         | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`  |
| OAuth providers | `{PROVIDER}_*`                   | `APPLE_AUTH_ENABLED`, `GOOGLE_CLIENT_ID`            |
| WebAuthn        | `WEBAUTHN_*`                     | `WEBAUTHN_RP_NAME`, `WEBAUTHN_RP_ID`                |
| Edge Functions  | `*_SECRET`, `ALLOWED_ORIGINS`    | `AUTH_WEBHOOK_SECRET`, `CRON_SECRET`                |
| PowerSync       | `POWERSYNC_*`                    | `POWERSYNC_URL`, `POWERSYNC_PUBLIC_KEY`             |
| MongoDB         | `MONGO_*`                        | `MONGO_USER`, `MONGO_PASSWORD`                      |
| Paths           | `*_PATH`                         | `EDGE_FUNCTIONS_PATH`, `WEB_DIST_PATH`              |
| Backups         | `BACKUP_*`                       | `BACKUP_RETENTION_DAYS`                             |

### GitHub Actions Secrets

GitHub Actions uses **environment-scoped secrets** (recommended) rather than prefixed repository-level secrets.

| Approach                              | Pattern                                          | Example                         |
| ------------------------------------- | ------------------------------------------------ | ------------------------------- |
| **Environment-scoped** (✅ preferred) | `{SERVICE}_{KEY}` scoped to a GitHub Environment | `SUPABASE_URL` in `staging` env |
| **Repository-level** (shared)         | `{KEY}`                                          | `TURBO_TOKEN`, `CODECOV_TOKEN`  |

#### Environment-Scoped Secrets

Secrets are scoped to GitHub Environments (`staging`, `production`). The same secret name resolves to different values per environment:

```yaml
# In workflow YAML:
environment: staging # ← unlocks staging-scoped secrets
# secrets.SUPABASE_URL → staging Supabase URL

environment: production # ← unlocks production-scoped secrets
# secrets.SUPABASE_URL → production Supabase URL
```

| Secret Name                    | Used In         | Per-Environment |
| ------------------------------ | --------------- | --------------- |
| `SUPABASE_URL`                 | Backend deploy  | ✅              |
| `SUPABASE_ANON_KEY`            | Backend deploy  | ✅              |
| `POWERSYNC_URL`                | Backend deploy  | ✅              |
| `DEPLOY_HOST`                  | SSH deploy      | ✅              |
| `DEPLOY_SSH_KEY`               | SSH deploy      | ✅              |
| `DEPLOY_USER`                  | SSH deploy      | ✅              |
| `VERCEL_TOKEN`                 | Web deploy      | ✅              |
| `VERCEL_ORG_ID`                | Web deploy      | ✅              |
| `VERCEL_PROJECT_ID`            | Web deploy      | ✅              |
| `ANDROID_KEYSTORE_BASE64`      | Android signing | ✅              |
| `IOS_DISTRIBUTION_CERT_BASE64` | iOS signing     | ✅              |

| Secret Name     | Used In     | Per-Environment |
| --------------- | ----------- | --------------- |
| `TURBO_TOKEN`   | Build cache | ❌ (repo-level) |
| `TURBO_TEAM`    | Build cache | ❌ (repo-level) |
| `CODECOV_TOKEN` | Coverage    | ❌ (repo-level) |

### Secret Rotation

| Label                    | Meaning                                         |
| ------------------------ | ----------------------------------------------- |
| `rotation:quarterly`     | Rotate every 3 months (API keys, deploy tokens) |
| `rotation:annual`        | Rotate annually (signing certificates)          |
| `rotation:on-compromise` | Rotate immediately if exposed                   |

Track rotation dates in a private wiki or issue. See [environments.md](environments.md) for the full rotation schedule.

### Anti-patterns

| ❌ Don't                                            | ✅ Do                                        |
| --------------------------------------------------- | -------------------------------------------- |
| `STAGING_POSTGRES_PASSWORD` (env prefix in name)    | Scope to GitHub Environment instead          |
| `DB_PASS` (ambiguous abbreviation)                  | `POSTGRES_PASSWORD` (explicit service + key) |
| `finance_prod_supabase_url` (redundant app prefix)  | `SUPABASE_URL` scoped to `production` env    |
| Store secrets in `.env` files committed to git      | Use `.env.example` with placeholders         |
| Reuse the same `JWT_SECRET` across `stg` and `prod` | Generate unique secrets per environment      |

---

## 7. GitHub Repository Standards

### Why

Branch names, tags, labels, and PR conventions are the project's collaboration language. Consistent naming enables automation (changelog generation, release workflows, sprint boards) and makes the git history a readable narrative.

### Branch Naming

| Pattern        | `{type}/{short-description}-{issue#}`                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| **Convention** | Type prefix from conventional commits, kebab-case description, issue number suffix. |

| Type       | Use Case                          | Example                           |
| ---------- | --------------------------------- | --------------------------------- |
| `feat`     | New feature                       | `feat/budget-rollover-134`        |
| `fix`      | Bug fix                           | `fix/auth-token-refresh-127`      |
| `docs`     | Documentation only                | `docs/api-reference-86`           |
| `chore`    | Maintenance, tooling              | `chore/cleanup-unused-files-446`  |
| `refactor` | Code refactor (no feature change) | `refactor/extract-sync-logic-201` |
| `test`     | Test additions or fixes           | `test/budget-edge-cases-155`      |
| `ci`       | CI/CD changes                     | `ci/cache-optimization-300`       |
| `perf`     | Performance improvement           | `perf/query-optimization-250`     |

### Tag & Release Naming

| Pattern        | `v{major}.{minor}.{patch}[-{pre-release}][-{platform}]`              |
| -------------- | -------------------------------------------------------------------- |
| **Convention** | Semantic versioning with optional pre-release and platform suffixes. |

| Tag              | Purpose              | Triggers              |
| ---------------- | -------------------- | --------------------- |
| `v1.2.3`         | All-platform release | `release.yml`         |
| `v1.2.3-android` | Android-only release | `release-android.yml` |
| `v1.2.3-ios`     | iOS-only release     | `release-ios.yml`     |
| `v1.2.3-web`     | Web-only release     | `release-web.yml`     |
| `v1.2.3-windows` | Windows-only release | `release-windows.yml` |
| `v1.2.3-rc.1`    | Release candidate    | `deploy-staging.yml`  |
| `v1.2.3-beta.1`  | Beta release         | Manual distribution   |

### GitHub Environment Names

| Environment | Name          | Notes                                      |
| ----------- | ------------- | ------------------------------------------ |
| Feature/PR  | `development` | Auto-deploy, any branch                    |
| Pre-release | `staging`     | Auto or gated, `main` / `release/*`        |
| Live        | `production`  | 2 required reviewers, `main` / `release/*` |

> **Convention:** Use full words, not abbreviations, for GitHub Environment names. This matches GitHub's UI conventions and avoids confusion with the short codes (`stg`, `prod`) used in infrastructure naming.

### Label Taxonomy

The project uses a comprehensive label taxonomy documented in [`docs/architecture/labels.md`](../architecture/labels.md). Key categories:

| Category  | Prefix      | Examples                                                                                                      |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Type      | (none)      | `feature`, `bug`, `task`, `spike`                                                                             |
| Platform  | `platform:` | `platform:ios`, `platform:android`, `platform:web`, `platform:windows`, `platform:shared`, `platform:backend` |
| Component | `comp:`     | `comp:core`, `comp:models`, `comp:sync`, `comp:api`, `comp:docs`, `comp:ci-cd`                                |
| Priority  | `priority:` | `priority:critical`, `priority:high`, `priority:medium`, `priority:low`                                       |
| Effort    | `effort:`   | `effort:xs`, `effort:s`, `effort:m`, `effort:l`, `effort:xl`                                                  |

#### Recommended Additions

| Label              | Color     | Description                                  |
| ------------------ | --------- | -------------------------------------------- |
| `infrastructure`   | `#d4c5f9` | Azure, Docker, DNS, hosting changes          |
| `security`         | `#b60205` | Security-related work                        |
| `accessibility`    | `#0075ca` | WCAG/a11y improvements                       |
| `breaking-change`  | `#b60205` | Requires migration or major version bump     |
| `needs-decision`   | `#fbca04` | Blocked on architectural or product decision |
| `good-first-issue` | `#7057ff` | Suitable for new contributors                |

### Issue & PR Title Conventions

| Type      | Pattern                                     | Example                                               |
| --------- | ------------------------------------------- | ----------------------------------------------------- |
| **Issue** | `{Brief description}`                       | `Budget rollover not carrying forward unused amounts` |
| **PR**    | `{type}({scope}): {description} (#{issue})` | `feat(core): implement budget rollover (#134)`        |

### Commit Message Format

```
{type}({scope}): {description} (#{issue})

{optional body}

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

### Anti-patterns

| ❌ Don't                              | ✅ Do                                             |
| ------------------------------------- | ------------------------------------------------- |
| `my-branch` (no type, no issue)       | `feat/budget-rollover-134`                        |
| `1.2.3` (no `v` prefix)               | `v1.2.3`                                          |
| `release-1.2.3` (non-semver tag)      | `v1.2.3`                                          |
| `PROD` or `prod` (GitHub Environment) | `production`                                      |
| `Update stuff` (vague PR title)       | `fix(auth): handle expired refresh tokens (#127)` |

---

## 8. Monitoring & Alerting Naming

### Why

During an incident, operators grep logs, scan dashboards, and read alert titles under time pressure. Consistent naming across Sentry, UptimeRobot, and log streams enables instant recognition of what's broken, where, and in which environment.

### Sentry Projects

| Pattern | `finance-{platform}` |
| ------- | -------------------- |

| Project Name      | Platform                 | SDK                              |
| ----------------- | ------------------------ | -------------------------------- |
| `finance-web`     | Web PWA                  | `@sentry/react`                  |
| `finance-android` | Android                  | `sentry-android`                 |
| `finance-ios`     | iOS                      | `sentry-cocoa`                   |
| `finance-windows` | Windows                  | `sentry-java` (JVM)              |
| `finance-api`     | Backend (Edge Functions) | `@sentry/deno` or `@sentry/node` |

**Sentry environment tag:** Use `production`, `staging`, `development` (matching GitHub Environment names) to filter issues per environment within each project.

### UptimeRobot Monitors

| Pattern | `Finance — {Service} ({env})` |
| ------- | ----------------------------- |

| Monitor Name              | URL                                | Check Interval |
| ------------------------- | ---------------------------------- | -------------- |
| `Finance — Health (prod)` | `https://{domain}/health`          | 5 min          |
| `Finance — Auth (prod)`   | `https://{domain}/auth/v1/health`  | 5 min          |
| `Finance — Sync (prod)`   | `https://{domain}/sync/api/status` | 5 min          |
| `Finance — API (prod)`    | `https://{domain}/rest/`           | 5 min          |
| `Finance — Health (stg)`  | `https://staging.{domain}/health`  | 15 min         |
| `Finance — Web (prod)`    | `https://{domain}`                 | 5 min          |

### Alert Channel Naming

| Channel           | Pattern                   | Example                                |
| ----------------- | ------------------------- | -------------------------------------- |
| Email             | `finance-alerts@{domain}` | `finance-alerts@financetrackerapp.com` |
| Sentry alert rule | `{severity}: {condition}` | `Critical: Error rate > 10/min`        |
| UptimeRobot alert | (uses monitor name)       | Alert from `Finance — Health (prod)`   |

### Log Format Standards

All backend services emit **structured JSON logs** via Caddy's JSON log format. Application logs should follow the same structure:

```json
{
  "timestamp": "2026-05-12T10:30:00.000Z",
  "level": "error",
  "service": "finance-auth",
  "message": "Token refresh failed",
  "request_id": "req_abc123",
  "user_id": null,
  "error_code": "AUTH_TOKEN_EXPIRED",
  "duration_ms": 45
}
```

| Field         | Required | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| `timestamp`   | ✅       | ISO 8601 UTC                                |
| `level`       | ✅       | `debug`, `info`, `warn`, `error`, `fatal`   |
| `service`     | ✅       | `finance-{service}` matching container name |
| `message`     | ✅       | Human-readable description                  |
| `request_id`  | ⬜       | Correlation ID for distributed tracing      |
| `user_id`     | ⬜       | Anonymized user identifier (never raw PII)  |
| `error_code`  | ⬜       | Machine-readable error classification       |
| `duration_ms` | ⬜       | Operation duration in milliseconds          |

> **Privacy rule:** NEVER log raw financial data (account numbers, balances, transaction amounts). Log only anonymized IDs and error codes.

### Anti-patterns

| ❌ Don't                              | ✅ Do                                     |
| ------------------------------------- | ----------------------------------------- |
| `My App Monitor` (generic)            | `Finance — Health (prod)`                 |
| `sentry-project-1` (opaque)           | `finance-web`                             |
| Log in plain text                     | Emit structured JSON                      |
| Log `user.email` or `account.balance` | Log anonymized `user_id` and `error_code` |
| Different log formats per service     | Standardize on the JSON schema above      |

---

## 9. CI/CD Pipeline Naming

### Why

With 35+ workflow files in `.github/workflows/`, clear naming is the difference between finding the right workflow instantly and scrolling through an alphabetical list guessing. The naming scheme encodes the workflow's trigger, target, and purpose.

### Workflow File Naming

| Pattern | `{purpose}[-{qualifier}].yml` |
| ------- | ----------------------------- |

#### Current Workflow Inventory

| Category        | File Name                 | Description                             |
| --------------- | ------------------------- | --------------------------------------- |
| **Core CI**     | `ci.yml`                  | Main CI pipeline (lint, test, build)    |
|                 | `lint-format.yml`         | Prettier + ESLint checks                |
|                 | `kotlin-lint.yml`         | Detekt for Kotlin code                  |
|                 | `pr-title.yml`            | PR title conventional commit validation |
|                 | `merge-queue.yml`         | Merge queue checks                      |
| **Platform CI** | `android-ci.yml`          | Android build + test                    |
|                 | `ios-ci.yml`              | iOS build + test                        |
|                 | `web-ci.yml`              | Web build + test                        |
|                 | `windows-ci.yml`          | Windows build + test                    |
| **Deploy**      | `deploy-staging.yml`      | Deploy to staging environment           |
|                 | `deploy-production.yml`   | Deploy to production environment        |
|                 | `preview-deploy.yml`      | PR preview deployments                  |
|                 | `canary-deploy.yml`       | Canary releases                         |
| **Release**     | `release.yml`             | Generic GitHub Release                  |
|                 | `release-android.yml`     | Android release (Play Store)            |
|                 | `release-ios.yml`         | iOS release (App Store)                 |
|                 | `release-web.yml`         | Web release (Vercel)                    |
|                 | `release-windows.yml`     | Windows release (Microsoft Store)       |
|                 | `release-artifacts.yml`   | Build release artifacts                 |
|                 | `release-train.yml`       | Coordinated multi-platform release      |
| **Security**    | `security.yml`            | CodeQL SAST + secret scanning           |
|                 | `dependency-audit.yml`    | npm + Gradle vulnerability audit        |
|                 | `pen-test.yml`            | Automated penetration testing           |
| **Quality**     | `build-perf.yml`          | Build performance tracking              |
|                 | `ci-health.yml`           | CI success rate monitoring              |
|                 | `load-tests.yml`          | Load/stress testing                     |
|                 | `feature-flags-ci.yml`    | Feature flag validation                 |
|                 | `observability.yml`       | Observability checks                    |
| **Maintenance** | `stale-detection.yml`     | Stale issue/PR detection                |
|                 | `changesets.yml`          | Changeset version management            |
|                 | `mobile-cache-warm.yml`   | Mobile build cache warming              |
|                 | `auto-add-to-project.yml` | Auto-add issues to project board        |

#### Naming Rules

1. Use **kebab-case** (lowercase, hyphens)
2. Platform-specific workflows use `{platform}-{purpose}.yml` (e.g., `android-ci.yml`)
3. Deploy workflows use `deploy-{environment}.yml`
4. Release workflows use `release-{platform}.yml`
5. The generic `ci.yml` is the main entry point; platform CIs are `{platform}-ci.yml`

### Job Naming Within Workflows

| Pattern | `{verb}-{target}` (kebab-case) |
| ------- | ------------------------------ |

| Job ID              | Display Name           | Example               |
| ------------------- | ---------------------- | --------------------- |
| `lint`              | `Lint & Format`        | Format + ESLint check |
| `test-unit`         | `Unit Tests`           | Run unit tests        |
| `test-integration`  | `Integration Tests`    | Run integration tests |
| `build-android`     | `Build Android`        | Compile Android APK   |
| `build-web`         | `Build Web`            | Vite build            |
| `deploy-staging`    | `Deploy to Staging`    | SSH + docker compose  |
| `deploy-production` | `Deploy to Production` | SSH + docker compose  |
| `sign-apk`          | `Sign APK`             | Android signing       |

### Artifact Naming

| Pattern | `{app}-{platform}-{version}[-{qualifier}]` |
| ------- | ------------------------------------------ |

| Artifact      | Example                           |
| ------------- | --------------------------------- |
| Android APK   | `finance-android-1.2.3.apk`       |
| Android AAB   | `finance-android-1.2.3.aab`       |
| iOS IPA       | `finance-ios-1.2.3.ipa`           |
| Web bundle    | `finance-web-1.2.3.zip`           |
| Windows MSIX  | `finance-windows-1.2.3.msix`      |
| Debug APK     | `finance-android-1.2.3-debug.apk` |
| Staging build | `finance-web-1.2.3-rc.1.zip`      |

### Cache Key Naming

| Pattern | `{platform}-{tool}-{hash}` |
| ------- | -------------------------- |

| Cache Key                                             | What It Caches               |
| ----------------------------------------------------- | ---------------------------- |
| `node-modules-${{ hashFiles('package-lock.json') }}`  | npm dependencies             |
| `gradle-${{ hashFiles('**/*.gradle.kts') }}`          | Gradle dependencies          |
| `konan-${{ runner.os }}`                              | Kotlin/Native compiler cache |
| `turbo-${{ github.sha }}`                             | Turborepo build cache        |
| `cocoapods-${{ hashFiles('apps/ios/Podfile.lock') }}` | iOS CocoaPods                |

### Anti-patterns

| ❌ Don't                                           | ✅ Do                                        |
| -------------------------------------------------- | -------------------------------------------- |
| `build.yml` (too generic for 4 platforms)          | `android-ci.yml`, `web-ci.yml`               |
| `deploy_prod.yml` (underscore)                     | `deploy-production.yml` (hyphen + full word) |
| `workflow1.yml` (opaque)                           | `dependency-audit.yml` (descriptive)         |
| `Build and Test` (job display name with no target) | `Build Android` (specific)                   |
| `artifact-latest` (mutable name)                   | `finance-android-1.2.3.apk` (versioned)      |

---

## 10. Database Naming

### Why

Database objects outlive application code. Renaming a table requires a migration, a deployment, and coordination across 4 client platforms. Getting names right the first time avoids expensive renames. These conventions align with PostgreSQL community best practices and the existing migration history.

### Schema Naming

| Pattern            | Lowercase, no prefix                                |
| ------------------ | --------------------------------------------------- |
| **Default schema** | `public` — all application tables                   |
| **Auth schema**    | `auth` — Supabase/GoTrue managed tables             |
| **Extensions**     | `extensions` — PostgreSQL extensions (if separated) |

### Table Naming

| Pattern | `snake_case`, singular noun |
| ------- | --------------------------- |

| ✅ Current Tables                | Notes                              |
| -------------------------------- | ---------------------------------- |
| `account`                        | Financial accounts                 |
| `transaction`                    | Financial transactions             |
| `budget`                         | Budget periods                     |
| `goal`                           | Savings goals                      |
| `category`                       | Transaction categories             |
| `household`                      | Multi-user household               |
| `household_member`               | Household membership               |
| `household_invitation`           | Pending invites                    |
| `recurring_transaction_template` | Recurring rules                    |
| `passkey_credential`             | WebAuthn credentials               |
| `feature_flag`                   | Feature flags (synced to clients)  |
| `user`                           | User profiles (in `public` schema) |

#### Table Naming Rules

1. **Singular** — `transaction`, not `transactions` (the table represents the entity type, not a collection)
2. **snake_case** — `household_member`, not `householdMember`
3. **No prefixes** — `account`, not `tbl_account` or `fin_account`
4. **Junction tables** — `{table_a}_{table_b}` alphabetically: `household_member`
5. **Descriptive** — `recurring_transaction_template`, not `rec_txn_tmpl`

> **Note:** The existing schema uses plural table names in some places (e.g., the publication uses `users`, `households`, `accounts`, `transactions`, etc.). See [Migration Notes](#migration-notes).

### Column Naming

| Pattern | `snake_case` |
| ------- | ------------ |

| Convention | Example |
| --------------- | ----------------------------------------------- | ------------------------------------------- |
| Primary key | `id` (UUID) |
| Foreign key | `{referenced_table}_id` | `account_id`, `household_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` |
| Booleans | `is_{adjective}` or `has_{noun}` | `is_synced`, `is_rollover`, `has_passkey` |
| Ownership | `owner_id` (references `auth.users`) |
| Sync fields | `sync_version`, `is_synced` |
| Soft delete | `deleted_at` (nullable timestamp) |
| Monetary values | Named descriptively, stored as `BIGINT` (cents) | `amount`, `target_amount`, `current_amount` |

### Index Naming

| Pattern | `idx_{table}_{column(s)}` |
| ------- | ------------------------- |

| Example                          | Index On                             |
| -------------------------------- | ------------------------------------ |
| `idx_transaction_account_id`     | `transaction(account_id)`            |
| `idx_transaction_created_at`     | `transaction(created_at)`            |
| `idx_budget_household_id_period` | `budget(household_id, period_start)` |
| `idx_goal_owner_id`              | `goal(owner_id)`                     |

For composite indexes, list columns in order separated by underscores. If the name exceeds 63 characters (PostgreSQL limit), abbreviate the table name.

### Constraint Naming

| Constraint Type | Pattern                                      | Example                  |
| --------------- | -------------------------------------------- | ------------------------ |
| Primary key     | `pk_{table}`                                 | `pk_transaction`         |
| Foreign key     | `fk_{table}_{referenced_table}`              | `fk_transaction_account` |
| Unique          | `uq_{table}_{column(s)}`                     | `uq_user_email`          |
| Check           | `chk_{table}_{description}`                  | `chk_goal_status`        |
| Not null        | (use column definition, no named constraint) | —                        |

If a table has multiple FKs to the same referenced table, disambiguate:

- `fk_transaction_account` (primary account)
- `fk_transaction_transfer_transaction` (self-referential transfer link)

### Migration File Naming

| Pattern | `{YYYYMMDDHHMMSS}_{description}.sql` |
| ------- | ------------------------------------ |

| Example                                                     | Description                    |
| ----------------------------------------------------------- | ------------------------------ |
| `20260306000001_initial_schema.sql`                         | Initial tables and RLS         |
| `20260306000002_rls_policies.sql`                           | Row-level security policies    |
| `20260323000001_cleanup_and_balance_triggers.sql`           | Balance recalculation triggers |
| `20260326000002_add_transfer_recurring_to_transactions.sql` | Schema alignment               |

#### Migration Rules

1. **Timestamp prefix** — `YYYYMMDDHHMMSS` format ensures global ordering
2. **Descriptive suffix** — What the migration does, in `snake_case`
3. **One concern per migration** — Don't combine unrelated schema changes
4. **Reversible** — Include `down` migration (or document why it's irreversible)
5. **Idempotent** — Use `IF NOT EXISTS`, `IF EXISTS` guards where possible
6. **Sequential within a day** — Increment the seconds portion: `000001`, `000002`, `000003`

### Trigger & Function Naming

| Object     | Pattern                        | Example                            |
| ---------- | ------------------------------ | ---------------------------------- |
| Trigger    | `trg_{table}_{event}_{timing}` | `trg_transaction_insert_after`     |
| Function   | `fn_{purpose}`                 | `fn_recalculate_balance`           |
| RLS policy | `{action}_{table}_{role}`      | `select_transaction_authenticated` |

### Anti-patterns

| ❌ Don't                             | ✅ Do                               |
| ------------------------------------ | ----------------------------------- |
| `tbl_transactions` (prefix + plural) | `transaction`                       |
| `idx1`, `idx2` (opaque)              | `idx_transaction_account_id`        |
| `FK_12345` (auto-generated)          | `fk_transaction_account`            |
| `20260306_stuff.sql` (vague)         | `20260306000001_initial_schema.sql` |
| Store money as `DECIMAL` or `FLOAT`  | Store as `BIGINT` (cents)           |
| `accountId` (camelCase column)       | `account_id` (snake_case)           |

---

## 11. Code Artifact Naming

### Why

A monorepo with 4 platforms, 3 shared packages, and a backend needs strict naming to prevent cross-platform confusion. These conventions ensure that anyone can locate the right file, package, or module instantly.

### Package & Module Naming

| Platform         | Convention                       | Example                                                      |
| ---------------- | -------------------------------- | ------------------------------------------------------------ |
| **KMP (shared)** | `com.finance.{module}`           | `com.finance.core`, `com.finance.models`, `com.finance.sync` |
| **Android**      | `com.finance.android.{feature}`  | `com.finance.android.ui.transactions`                        |
| **iOS**          | `Finance{Module}` (Swift module) | `FinanceCore`, `FinanceSync`                                 |
| **Web**          | `@finance/{package}` (npm scope) | `@finance/web`                                               |
| **Windows**      | `com.finance.desktop.{feature}`  | `com.finance.desktop.ui.dashboard`                           |

### Source File Naming

| Platform          | Convention                                            | Example                                           |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------- |
| **Kotlin**        | `PascalCase.kt`                                       | `BudgetCalculator.kt`, `TransactionRepository.kt` |
| **Swift**         | `PascalCase.swift`                                    | `AccountsView.swift`, `SyncManager.swift`         |
| **TypeScript/JS** | `PascalCase.tsx` (components), `camelCase.ts` (utils) | `AccountsPage.tsx`, `sqliteWasm.ts`               |
| **SQL**           | `snake_case.sql`                                      | `initial_schema.sql`                              |
| **Config**        | `kebab-case.{ext}`                                    | `docker-compose.yml`, `eslint.config.mjs`         |

### Test File Naming

| Pattern | `{SourceFileName}.test.{ext}` (co-located) |
| ------- | ------------------------------------------ |

| Source File                | Test File                       |
| -------------------------- | ------------------------------- |
| `BudgetCalculator.kt`      | `BudgetCalculatorTest.kt`       |
| `AccountsPage.tsx`         | `AccountsPage.test.tsx`         |
| `SyncManager.swift`        | `SyncManagerTests.swift`        |
| `TransactionRepository.ts` | `TransactionRepository.test.ts` |

**Kotlin test convention:** `{ClassName}Test.kt` (no dot before `Test`)
**Swift test convention:** `{ClassName}Tests.swift` (plural, no dot)
**TypeScript test convention:** `{FileName}.test.{ext}` (dot-separated)

### Config File Naming

| File                   | Convention                             | Location                  |
| ---------------------- | -------------------------------------- | ------------------------- |
| Gradle build           | `build.gradle.kts`                     | Each module root          |
| Gradle settings        | `settings.gradle.kts`                  | Repo root                 |
| Gradle version catalog | `libs.versions.toml`                   | `gradle/`                 |
| npm package            | `package.json`                         | Repo root + `apps/web/`   |
| TypeScript config      | `tsconfig.json`                        | `apps/web/`               |
| ESLint config          | `eslint.config.mjs`                    | Repo root                 |
| Prettier config        | `.prettierrc` or in `package.json`     | Repo root                 |
| Docker Compose         | `docker-compose.yml`                   | `deploy/`                 |
| Caddy                  | `Caddyfile`                            | `deploy/`                 |
| Environment template   | `.env.example`, `.env.staging.example` | `deploy/`                 |
| Sync rules             | `sync-rules.yaml`                      | `services/api/powersync/` |

### Feature Flag Naming

| Pattern | `ff_{feature_name}` (snake_case) |
| ------- | -------------------------------- |

| Flag Name                   | Description                           | Type      |
| --------------------------- | ------------------------------------- | --------- |
| `ff_budget_rollover`        | Enable budget rollover feature        | `boolean` |
| `ff_dark_mode`              | Enable dark mode toggle               | `boolean` |
| `ff_export_csv`             | Enable CSV export option              | `boolean` |
| `ff_passkey_auth`           | Enable passkey authentication         | `boolean` |
| `ff_recurring_transactions` | Enable recurring transaction creation | `boolean` |

#### Feature Flag Rules

1. **Prefix with `ff_`** — Distinguishes flags from other configuration
2. **snake_case** — Consistent with database column naming
3. **Descriptive** — What the flag enables, not implementation details
4. **Boolean by default** — Prefer on/off flags over complex config values
5. **Temporary** — Remove flags after the feature is stable and fully rolled out

### Anti-patterns

| ❌ Don't                                                   | ✅ Do                                   |
| ---------------------------------------------------------- | --------------------------------------- |
| `utils.ts` (generic, will grow unbounded)                  | `currencyFormatter.ts` (specific)       |
| `Helper.kt` (meaningless)                                  | `TransactionMapper.kt` (purpose-driven) |
| `test1.ts` (opaque)                                        | `BudgetCalculator.test.ts`              |
| `ENABLE_FEATURE_X` (env var for flag)                      | `ff_feature_x` (in feature_flags table) |
| `Component.spec.tsx` + `Component.test.tsx` (inconsistent) | Pick `.test.` consistently              |

---

## 12. Security Standards

### Why

This is a financial application. Key and certificate files, if mis-named or misplaced, can be committed to git, served publicly, or overwritten during builds. Strict naming conventions reduce the risk of accidental exposure.

### Key & Certificate File Naming

| File Type       | Pattern              | Example                           |
| --------------- | -------------------- | --------------------------------- |
| TLS private key | `{domain}.key`       | `financetrackerapp.com.key`       |
| TLS certificate | `{domain}.crt`       | `financetrackerapp.com.crt`       |
| TLS chain       | `{domain}.chain.crt` | `financetrackerapp.com.chain.crt` |
| CA bundle       | `ca-bundle.crt`      | `ca-bundle.crt`                   |

> **Note:** In the current architecture, Caddy manages TLS certificates automatically via Let's Encrypt. Manual certificate files are not needed unless using a custom CA.

### Keystore Naming (Mobile Platforms)

| Platform        | Pattern                    | Example                                          |
| --------------- | -------------------------- | ------------------------------------------------ |
| Android debug   | `finance-debug.keystore`   | Stored locally, never committed                  |
| Android release | `finance-release.keystore` | Stored in secure vault, Base64 in GitHub Secrets |
| Android staging | `finance-staging.keystore` | Separate keystore for staging builds             |

### iOS Certificate & Profile Naming

| File Type              | Pattern                                | Example                                 |
| ---------------------- | -------------------------------------- | --------------------------------------- |
| Distribution cert      | `finance-{env}-dist.p12`               | `finance-prod-dist.p12`                 |
| Provisioning profile   | `finance-{env}-{type}.mobileprovision` | `finance-prod-appstore.mobileprovision` |
| Push notification cert | `finance-{env}-push.p12`               | `finance-prod-push.p12`                 |

### Windows Code Signing

| File Type         | Pattern                      | Example                     |
| ----------------- | ---------------------------- | --------------------------- |
| Code signing cert | `finance-{env}-codesign.pfx` | `finance-prod-codesign.pfx` |

### Certificate Alias Naming

| Platform               | Pattern         | Example                            |
| ---------------------- | --------------- | ---------------------------------- |
| Android keystore alias | `finance-{env}` | `finance-release`, `finance-debug` |

### Security File Rules

1. **Never commit** private keys, keystores, or `.p12` / `.pfx` files to git
2. **`.gitignore`** must include: `*.keystore`, `*.jks`, `*.p12`, `*.pfx`, `*.key`, `*.pem` (private)
3. **Store in CI** as Base64-encoded GitHub Secrets (environment-scoped)
4. **Rotate** signing certificates on the schedule defined in [environments.md](environments.md)
5. **Separate per environment** — Never reuse a production signing key for staging

### Anti-patterns

| ❌ Don't                              | ✅ Do                              |
| ------------------------------------- | ---------------------------------- |
| `my-release-key.keystore` (ambiguous) | `finance-release.keystore`         |
| `key.jks` (no context)                | `finance-prod-codesign.pfx`        |
| Commit keystores to git               | Store as Base64 in GitHub Secrets  |
| Reuse debug keystore for release      | Separate keystores per environment |
| `alias=1` (opaque alias)              | `alias=finance-release`            |

---

## Migration Notes

> **This section documents existing naming that deviates from these standards. These are NOT blocking issues — they are tracked here for future cleanup. Do NOT change existing infrastructure without a dedicated issue and migration plan.**

### Docker Compose — Container Names

**Current state:** The `docker-compose.yml` uses implicit container names derived from service keys (e.g., `deploy-db-1`, `deploy-rest-1`). The service keys themselves (`db`, `rest`, `auth`, etc.) are concise but lack the `finance-` prefix.

**Recommendation:** Add explicit `container_name` directives to each service:

```yaml
services:
  db:
    container_name: finance-postgres
    # ...
```

**Risk:** Low — container names are internal. Renaming requires `docker compose down && docker compose up -d`.

**Tracking:** Create a dedicated issue to add container names.

### Docker Compose — Volume Names

**Current state:** Volumes use inconsistent naming: `pgdata`, `mongodata` (no prefix, no hyphens) vs. `caddy_data`, `caddy_config` (underscores). None follow the `finance-{service}-data` pattern.

**Recommendation:** Rename volumes to `finance-postgres-data`, `finance-mongo-data`, `finance-caddy-data`, `finance-caddy-config`.

**Risk:** Medium — volume rename requires data migration (`docker volume create` + `docker run --rm -v old:/from -v new:/to alpine cp -a /from/. /to/`). Schedule during a maintenance window.

**Tracking:** Create a dedicated issue. Include data migration steps in the issue description.

### Docker Compose — Service Key `db`

**Current state:** The PostgreSQL service uses the key `db`, which is generic. Other services reference it as `db` in connection strings (e.g., `@db:5432`).

**Recommendation:** Consider renaming to `postgres` for clarity. However, this requires updating every service's environment variable that references `db`. Defer unless the Compose file is refactored for other reasons.

### Database — Table Name Plurality

**Current state:** The schema migrations and PowerSync publication reference tables in plural form (`users`, `accounts`, `transactions`, `households`, etc.). This is established and consistent.

**Recommendation:** Accept the plural convention as-is. The singular convention recommended in Section 10 applies to _new_ tables going forward. Renaming all existing tables would require coordinated migrations across the database, all 4 client SQLite schemas, PowerSync sync rules, and RLS policies — the cost far outweighs the benefit.

**Decision:** Existing tables retain plural names. New tables use singular. Document this exception in the relevant ADR if it causes confusion.

### GitHub Actions Secrets — Prefix Convention

**Current state:** The `.env.example` documents GitHub secrets with `STAGING_` and `PROD_` prefixes (e.g., `STAGING_SUPABASE_URL`, `PROD_HOST`). The `environments.md` documentation shows the same secrets without prefixes, scoped to GitHub Environments instead.

**Recommendation:** Migrate to environment-scoped secrets (no prefix). This is the approach documented in Section 6 and in `environments.md`. The prefixed names in `.env.example` comments should be updated to reflect the environment-scoped approach.

**Tracking:** Update the comments in `deploy/.env.example` to remove `STAGING_`/`PROD_` prefixes and note that these are environment-scoped.

### Caddy Log Format

**Current state:** Caddy is configured with `format json` for access logs. Application services (GoTrue, PostgREST) emit their own log formats which may not match the structured JSON standard in Section 8.

**Recommendation:** Where possible, configure GoTrue and Edge Functions to emit structured JSON logs. PostgREST and PostgreSQL have their own log formats that are harder to standardize — accept these as-is and parse them separately if log aggregation is added.

---

_Last updated: 2026-05-12_
