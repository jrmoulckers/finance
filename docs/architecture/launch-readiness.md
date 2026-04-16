# Launch Readiness Checklist

**Status:** Proposed
**Date:** 2026-06-15
**Author:** AI agent (Architect), with human direction
**Related:** [Rollout Strategy](rollout-strategy.md) · [Environment Architecture](environments.md) · [Provisioning Guide](provisioning.md) · [Monitoring Infrastructure](monitoring-infrastructure.md)

---

## Overview

This checklist defines every verification that must pass before the Finance app launches on each platform. It is organized into categories, with per-platform specifics where applicable. Every item is actionable, testable, and has a clear pass/fail criterion.

**Usage:**

1. Work through each section sequentially.
2. Check off items as they pass.
3. Any unchecked item in a **blocking** section prevents launch.
4. Non-blocking items are documented as known issues with mitigation plans.

---

## 1. Infrastructure Readiness

### 1.1 Backend Services — BLOCKING

- [ ] **PostgreSQL** — `pg_isready` returns success on production
- [ ] **PostgREST** — `GET /rest/` returns API schema with HTTP 200
- [ ] **GoTrue Auth** — `GET /auth/health` returns HTTP 200
- [ ] **Edge Functions** — `GET /functions/v1/health-check` returns `{"status":"healthy"}`
- [ ] **PowerSync** — Health API returns healthy, replication slot active
- [ ] **Caddy** — TLS certificate valid, HSTS header present, security headers correct
- [ ] **Docker Compose** — All containers running, no restart loops (restart count = 0 for 24h)
- [ ] **Resource headroom** — VPS CPU < 50% baseline, RAM < 70% baseline (room for traffic spikes)

### 1.2 Networking — BLOCKING

- [ ] **DNS** — `finance.example.com` resolves to VPS IP (verified from multiple locations)
- [ ] **TLS** — Certificate chain valid, Let's Encrypt issued, expiry > 30 days
- [ ] **HTTPS redirect** — HTTP → HTTPS redirect working (port 80 → 443)
- [ ] **Firewall** — Only ports 80, 443, and SSH exposed (verified via port scan)
- [ ] **Internal network** — `finance-internal` Docker network is `internal: true` (no external access to backend ports)
- [ ] **CORS** — `ALLOWED_ORIGINS` correctly configured for production domain

### 1.3 Database — BLOCKING

- [ ] **Migrations** — All migrations applied, `supabase db migrations list` shows complete
- [ ] **RLS policies** — Enabled on all user-data tables (verified with query against `pg_tables`)
- [ ] **RLS tests** — Automated RLS policy tests pass (anon cannot read data, wrong household cannot access)
- [ ] **Indexes** — Performance indexes applied (verify `20260324000002_performance_indexes.sql`)
- [ ] **Logical replication** — Publication `powersync_publication` exists with all required tables
- [ ] **Connection limits** — `max_connections` set appropriately, connection pooling configured
- [ ] **WAL configuration** — `wal_level=logical`, `max_wal_senders=10`, `max_replication_slots=10`

### 1.4 Backups — BLOCKING

- [ ] **Automated backup** — `pg_dump` cron job configured, runs daily
- [ ] **Backup verification** — At least one backup successfully restored to a test database
- [ ] **Off-site storage** — Backups uploaded to S3-compatible storage (different provider than VPS)
- [ ] **Encryption** — Backup files encrypted with AES-256 before upload
- [ ] **Retention policy** — 7 daily + 4 weekly + 3 monthly configured
- [ ] **Restore procedure** — Documented and tested (time to restore < 1 hour)

---

## 2. Security Sign-Off

### 2.1 Authentication — BLOCKING

- [ ] **Passkey registration** — Complete WebAuthn ceremony works on all platforms
- [ ] **Passkey authentication** — Login via passkey works on all platforms
- [ ] **OAuth (Apple)** — Sign in with Apple works (production credentials)
- [ ] **OAuth (Google)** — Sign in with Google works (production credentials)
- [ ] **Token refresh** — Access token refresh works transparently (no user-visible interruption)
- [ ] **Token rotation** — Refresh token rotation active, reuse detection triggers family invalidation
- [ ] **Rate limiting** — Auth rate limits active: email send limit, token refresh limit
- [ ] **PKCE** — OAuth flows use PKCE (verify `code_challenge` in authorization requests)
- [ ] **JWT expiry** — Access tokens expire in ≤ 3600s, refresh tokens in ≤ 30 days
- [ ] **Session termination** — Logout invalidates all tokens, clears local secure storage

### 2.2 Data Protection — BLOCKING

- [ ] **SQLCipher** — Local database encrypted with AES-256-GCM on all platforms (verified by attempting to read `.db` file with standard SQLite)
- [ ] **TLS everywhere** — All client-server communication uses TLS 1.2+ (no plaintext HTTP in any client build)
- [ ] **Secure token storage** — Tokens stored in platform-specific secure storage (Keychain, Keystore, DPAPI, HttpOnly cookies) — not in localStorage, SharedPreferences, or plaintext files
- [ ] **Biometric gating** — Biometric unlock gates access to cached tokens on iOS, Android, Windows
- [ ] **Key hierarchy** — Envelope encryption implemented: DEK encrypted by KEK in Keychain/Keystore
- [ ] **No PII in logs** — Verified that server logs, Sentry events, and client telemetry contain zero PII

### 2.3 Authorization — BLOCKING

- [ ] **Household isolation** — User A cannot access User B's household data (tested via API with wrong JWT)
- [ ] **Role enforcement** — Viewer cannot create transactions, Member cannot delete household (tested per RBAC matrix)
- [ ] **RLS defense-in-depth** — Even with a valid JWT, direct PostgREST queries respect RLS (tested)
- [ ] **PowerSync isolation** — Sync rules only deliver data for user's own households (tested with multiple test accounts)
- [ ] **Admin functions** — Admin Edge Functions require `service_role` key (not accessible with `anon` key)

### 2.4 Security Scanning — BLOCKING

- [ ] **Dependency audit** — `npm audit` and `gradle dependencyCheckAnalyze` report zero critical/high vulnerabilities
- [ ] **SAST** — CodeQL or equivalent scans pass with zero high-severity findings
- [ ] **Secret scanning** — GitHub push protection enabled, no secrets in commit history
- [ ] **OWASP top 10** — Reviewed for: injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, known vulnerabilities, insufficient logging
- [ ] **MASVS compliance** — Mobile apps reviewed against [OWASP MASVS](https://mas.owasp.org/) (see existing audit docs)

### 2.5 Privacy Compliance — BLOCKING

- [ ] **Privacy policy** — Published at `https://finance.example.com/privacy`, covers GDPR + CCPA
- [ ] **Terms of service** — Published at `https://finance.example.com/terms`
- [ ] **Consent management** — Analytics/telemetry consent prompt implemented, respects user choice
- [ ] **Data export** — `data-export` Edge Function works, produces complete machine-readable output
- [ ] **Account deletion** — `account-deletion` Edge Function works, crypto-shredding destroys all data
- [ ] **Cookie consent** — Web app shows cookie consent banner where required (EU)
- [ ] **Data minimization** — Server stores only what's needed for sync; no unnecessary PII retention

---

## 3. Performance Benchmarks — BLOCKING

All metrics must meet the targets defined in [Performance Baselines](performance-baselines.md).

### 3.1 App Startup

| Platform | Target Cold Start | Measured | Pass? |
| -------- | ----------------- | -------- | ----- |
| Android  | < 2.0s            | \_\_\_ms | [ ]   |
| iOS      | < 1.5s            | \_\_\_ms | [ ]   |
| Web      | < 2.0s (TTI)      | \_\_\_ms | [ ]   |
| Windows  | < 2.0s            | \_\_\_ms | [ ]   |

### 3.2 Core Operations

| Operation                | Target  | Measured  | Pass? |
| ------------------------ | ------- | --------- | ----- |
| Dashboard load           | < 200ms | \_\_\_ms  | [ ]   |
| SQLite aggregation query | < 100ms | \_\_\_ms  | [ ]   |
| Transaction creation     | < 50ms  | \_\_\_ms  | [ ]   |
| List scroll (60fps)      | ≥ 60fps | \_\_\_fps | [ ]   |
| Memory usage             | < 150MB | \_\_\_MB  | [ ]   |

### 3.3 Sync Performance

| Metric                     | Target | Measured | Pass? |
| -------------------------- | ------ | -------- | ----- |
| Initial sync (100 records) | < 5s   | \_\_\_s  | [ ]   |
| Delta sync (10 changes)    | < 2s   | \_\_\_s  | [ ]   |
| Conflict resolution        | < 1s   | \_\_\_s  | [ ]   |
| Sync after offline (1h)    | < 10s  | \_\_\_s  | [ ]   |

### 3.4 Web Core Vitals

| Metric | Target  | Measured | Pass? |
| ------ | ------- | -------- | ----- |
| LCP    | < 2.5s  | \_\_\_s  | [ ]   |
| FID    | < 100ms | \_\_\_ms | [ ]   |
| CLS    | < 0.1   | \_\_\_   | [ ]   |
| TTI    | < 3.5s  | \_\_\_s  | [ ]   |

### 3.5 API Performance

| Endpoint               | Target P95 | Measured P95 | Pass? |
| ---------------------- | ---------- | ------------ | ----- |
| `health-check`         | < 200ms    | \_\_\_ms     | [ ]   |
| `passkey-authenticate` | < 1s       | \_\_\_ms     | [ ]   |
| PostgREST queries      | < 200ms    | \_\_\_ms     | [ ]   |

---

## 4. Accessibility Compliance — BLOCKING

All platforms must meet WCAG 2.2 AA as mandated in ADR-0001.

### 4.1 All Platforms

- [ ] **Screen reader** — All interactive elements have accessible labels (tested with VoiceOver, TalkBack, Narrator, browser screen reader)
- [ ] **Keyboard navigation** — All functionality reachable via keyboard (Web, Windows)
- [ ] **Color contrast** — All text meets 4.5:1 contrast ratio (AA), large text meets 3:1
- [ ] **Touch targets** — All interactive elements ≥ 44×44pt (iOS), ≥ 48×48dp (Android)
- [ ] **Motion** — Respects `prefers-reduced-motion` (Web), system accessibility settings (mobile)
- [ ] **Text scaling** — App remains usable at 200% text scale
- [ ] **Focus indicators** — Visible focus indicators on all interactive elements

### 4.2 iOS-Specific

- [ ] **VoiceOver** — Complete task flow (create account → add transaction → view budget) with VoiceOver
- [ ] **Dynamic Type** — All text respects Dynamic Type settings up to `xxxLarge`
- [ ] **Reduce Motion** — Animations disabled when Reduce Motion is on
- [ ] **Smart Invert** — UI renders correctly with Smart Invert enabled

### 4.3 Android-Specific

- [ ] **TalkBack** — Complete task flow with TalkBack
- [ ] **Font Scale** — UI usable at system font scale 2.0×
- [ ] **High Contrast** — UI usable with High Contrast Text enabled
- [ ] **Switch Access** — All elements reachable via Switch Access

### 4.4 Web-Specific

- [ ] **Lighthouse Accessibility** — Score ≥ 95
- [ ] **axe-core** — Zero critical/serious violations
- [ ] **ARIA** — Correct ARIA roles, states, and properties
- [ ] **Focus management** — Focus correctly managed during route changes and modal dialogs
- [ ] **Skip navigation** — "Skip to main content" link present

### 4.5 Windows-Specific

- [ ] **Narrator** — Complete task flow with Narrator
- [ ] **High Contrast themes** — UI renders correctly in all Windows high contrast themes
- [ ] **UI Automation** — All elements expose correct UIA properties

---

## 5. Platform-Specific Pre-Launch

### 5.1 Android (Google Play)

- [ ] **App signing** — Upload key configured in Play Console, Google manages signing key
- [ ] **Store listing** — Title, description, screenshots, feature graphic uploaded
- [ ] **Content rating** — IARC questionnaire completed
- [ ] **Data safety** — Data safety form completed (declare: local storage encrypted, no data sharing, sync to own servers)
- [ ] **Target API level** — Meets Google Play's current target API requirement (API 34+)
- [ ] **64-bit** — App bundle includes arm64-v8a and x86_64
- [ ] **ProGuard/R8** — Minification enabled, mapping file uploaded to Sentry
- [ ] **ANR rate** — < 0.47% (Play Console threshold for "bad behavior")
- [ ] **Crash rate** — < 1.09% (Play Console threshold for "bad behavior")

### 5.2 iOS (App Store)

- [ ] **App Store Connect** — App record created, bundle ID registered
- [ ] **Certificates** — Distribution certificate and provisioning profile valid
- [ ] **Store listing** — Title, subtitle, description, screenshots (6.7", 6.1", iPad), preview video (optional)
- [ ] **App Review guidelines** — Self-audit against [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **Privacy nutrition labels** — App privacy details completed in App Store Connect
- [ ] **Export compliance** — ECCN/encryption declarations completed (uses SQLCipher AES-256)
- [ ] **Minimum OS** — iOS 16+ (required for passkey support)
- [ ] **TestFlight feedback** — All P0/P1 issues from beta addressed

### 5.3 Web

- [ ] **Service worker** — Installed and caching correctly, update flow tested
- [ ] **PWA manifest** — `manifest.json` with correct icons, theme color, display mode
- [ ] **Offline mode** — App functional offline (reads from cached data)
- [ ] **CSP** — Content Security Policy configured and tested (no violations in console)
- [ ] **CORS** — Cross-origin requests work correctly for all API calls
- [ ] **Bundle size** — Initial JS bundle < 200KB gzipped (per performance budget)
- [ ] **robots.txt** — Configured (app routes not indexed, marketing pages indexed)
- [ ] **Open Graph** — OG meta tags for social sharing on marketing pages
- [ ] **404 page** — Custom 404 page for unknown routes

### 5.4 Windows (Microsoft Store)

- [ ] **MSIX package** — Built and signed with valid code signing certificate
- [ ] **Partner Center** — App registered, store listing completed
- [ ] **Certification** — Passes Windows App Certification Kit (WACK)
- [ ] **Minimum OS** — Windows 10 21H2+ or Windows 11
- [ ] **Package flight** — Tested in flight ring with real users

---

## 6. Data Integrity Verification

### 6.1 Sync Correctness — BLOCKING

- [ ] **Bidirectional sync** — Changes on device A appear on device B within 30 seconds
- [ ] **Offline → online** — Changes made offline sync correctly when connectivity returns
- [ ] **Conflict resolution** — LWW conflict resolution produces correct results (last writer wins)
- [ ] **Multi-device** — Same account on 3+ devices stays consistent
- [ ] **Soft deletes** — Deleted items are soft-deleted (not hard-deleted), sync correctly
- [ ] **Household sharing** — Changes by household member A visible to member B
- [ ] **Selective sync** — Users only receive data for their own households (verified with SQL query against replication)

### 6.2 Data Consistency — BLOCKING

- [ ] **Balance calculations** — Account balances match sum of transactions
- [ ] **Budget calculations** — Budget spent amounts match transaction totals per category/period
- [ ] **Currency handling** — All monetary values stored as integer cents, no floating point
- [ ] **Timezone handling** — Transaction dates display correctly across timezones
- [ ] **Edge cases** — Empty states, zero balances, negative balances, very large amounts all display correctly

---

## 7. Monitoring & Alerting Verification — BLOCKING

- [ ] **Uptime monitoring** — Uptime Kuma (or equivalent) configured for all endpoints
- [ ] **Alert routing** — P0 alerts reach the on-call person within 1 minute (tested)
- [ ] **Sentry** — Configured for all platforms, test error event received
- [ ] **Source maps** — Sentry shows deobfuscated stack traces for all platforms
- [ ] **Dashboard** — Launch readiness dashboard showing all green
- [ ] **Backup alerts** — Alert fires if backup job fails (tested by simulating failure)
- [ ] **Disk space alerts** — Alert fires when disk > 80% (tested)

---

## 8. Disaster Recovery Verification — NON-BLOCKING (but strongly recommended)

- [ ] **Full restore test** — Complete database restoration from backup to a fresh VPS
- [ ] **Time to recovery** — Full restore completes in < 1 hour
- [ ] **Data integrity after restore** — Spot-check 10 records match pre-backup state
- [ ] **VPS replacement** — Documented procedure to set up a new VPS from scratch (using `deploy/` directory)
- [ ] **Domain failover** — DNS TTL is low enough (300s) to point to a new IP quickly
- [ ] **Runbook review** — [Incident Response Runbook](incident-response-runbook.md) reviewed and up-to-date

---

## 9. Legal & Compliance — BLOCKING

- [ ] **Privacy policy** — Published, covers GDPR articles 13/14, CCPA/CPRA rights
- [ ] **Terms of service** — Published, covers limitation of liability, acceptable use
- [ ] **Cookie policy** — Published (web), consent banner implemented
- [ ] **Export controls** — ECCN classification determined for SQLCipher/AES-256 (see [EXPORT_CONTROL.md](../../EXPORT_CONTROL.md))
- [ ] **License** — BSL 1.1 license file present, SPDX headers on all source files
- [ ] **Third-party notices** — [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md) complete and accurate
- [ ] **GDPR DPA** — Data Processing Agreement prepared for any sub-processors (Sentry, if used)

---

## 10. Launch Day Operations

### 10.1 Pre-Launch (T-24h)

- [ ] Final backup of production database
- [ ] All monitoring dashboards reviewed and green
- [ ] Hotfix branch prepared (branched from release tag)
- [ ] On-call schedule confirmed
- [ ] Rollback plan reviewed with all team members
- [ ] App store submissions finalized (iOS, Android, Windows)

### 10.2 Launch (T-0)

- [ ] Web app: promote to production
- [ ] iOS: approve phased release in App Store Connect
- [ ] Android: promote to production track (1% staged rollout)
- [ ] Windows: promote from flight ring to general availability
- [ ] Monitor all dashboards for 2 hours post-launch
- [ ] Verify first real user signup and sync

### 10.3 Post-Launch (T+24h)

- [ ] Review crash reports across all platforms
- [ ] Review sync health metrics
- [ ] Review error rates in Sentry
- [ ] Android: advance staged rollout (1% → 5% if no issues)
- [ ] iOS: verify phased release advancing
- [ ] Address any P0/P1 issues immediately
- [ ] Document any incidents in post-launch notes

### 10.4 Post-Launch (T+7d)

- [ ] All platforms at full rollout (100%)
- [ ] Performance metrics within baseline targets
- [ ] Crash-free rate ≥ 99.5% on all platforms
- [ ] No unresolved P0/P1 issues
- [ ] Backup system verified with production data
- [ ] Write launch retrospective

---

## 11. Sign-Off

| Category                 | Status | Verified By | Date |
| ------------------------ | ------ | ----------- | ---- |
| Infrastructure Readiness | ⬜     |             |      |
| Security Sign-Off        | ⬜     |             |      |
| Performance Benchmarks   | ⬜     |             |      |
| Accessibility Compliance | ⬜     |             |      |
| Platform Pre-Launch      | ⬜     |             |      |
| Data Integrity           | ⬜     |             |      |
| Monitoring & Alerting    | ⬜     |             |      |
| Disaster Recovery        | ⬜     |             |      |
| Legal & Compliance       | ⬜     |             |      |
| **LAUNCH APPROVED**      | ⬜     |             |      |

---

## 12. References

- [Rollout Strategy](rollout-strategy.md) — Platform rollout phases
- [Environment Architecture](environments.md) — Environment definitions
- [Provisioning Guide](provisioning.md) — Setup instructions
- [Monitoring Infrastructure](monitoring-infrastructure.md) — Monitoring and dashboards
- [Performance Baselines](performance-baselines.md) — Target metrics
- [Incident Response Runbook](incident-response-runbook.md) — Incident procedures
- [Security Audit v1](security-audit-v1.md) — Security findings
- [Privacy Audit v1](privacy-audit-v1.md) — Privacy findings
- [MASVS Audits](masvs-code-audit.md) — Mobile security review
- [ADR-0004: Auth & Security Architecture](0004-auth-security-architecture.md) — Auth requirements
- [ADR-0009: Legal & Monetization](0009-legal-monetization-analysis.md) — Legal requirements
