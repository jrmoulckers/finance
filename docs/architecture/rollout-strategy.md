# Rollout Strategy

**Status:** Implemented
**Date:** 2026-06-15
**Author:** AI agent (Architect), with human direction
**Related:** [Environment Architecture](environments.md) · [ADR-0006: CI/CD Strategy](0006-cicd-strategy.md) · [ADR-0007: Hosting Strategy](0007-hosting-strategy.md) · [Roadmap](roadmap.md)

---

## Overview

This document defines the phased rollout strategy for the Finance app across all four platforms (Android, iOS, Web, Windows). Each platform has its own distribution channel, review process, and rollback mechanism. The strategy is designed for a solo/small-team project where "ship when ready" is the release cadence — no release trains, no fixed schedules.

### Principles

1. **Incremental exposure** — start with the smallest audience (internal), then gradually widen. Never go from zero to 100% in one step.
2. **Each platform ships independently** — an iOS release does not block or require an Android release. Version numbers are per-platform.
3. **Feature flags decouple deploy from release** — code ships to production behind flags. Features activate independently of app store updates.
4. **Automated rollback where possible** — web and backend can rollback instantly. Mobile and desktop require store-specific procedures.
5. **Offline-first resilience** — even a bad server deploy doesn't break the app. Clients work offline; sync resumes when the backend recovers.

---

## 1. Platform Rollout Phases

### 1.1 Android (Google Play)

```
Internal Testing → Closed Beta → Open Beta → Production (Staged Rollout)
```

| Phase                | Audience                     | Duration  | Entry Criteria                      | Exit Criteria                                           |
| -------------------- | ---------------------------- | --------- | ----------------------------------- | ------------------------------------------------------- |
| **Internal Testing** | Project owner + 5            | 1–3 days  | APK builds, basic smoke test passes | No P0/P1 crashes, core flows work                       |
| **Closed Beta**      | ~20 invited testers          | 1–2 weeks | Internal testing signed off         | Crash-free rate ≥ 99.5%, sync works, feedback addressed |
| **Open Beta**        | Anyone who opts in           | 2–4 weeks | Closed beta metrics met             | Crash-free rate ≥ 99.8%, no data loss reports           |
| **Production**       | Staged: 1% → 5% → 25% → 100% | 1–2 weeks | Open beta signed off                | Each stage: no anomalies in crash/ANR rate for 24h      |

**Release workflow:**

```
Tag: android/v1.0.0
  → release-android.yml triggers
  → Gradle assembleRelease + sign (GitHub Actions)
  → Upload AAB to Play Console (internal track) via Fastlane `supply`
  → Manual promotion: internal → closed → open → production
```

**Key details:**

- **Signing:** App signing by Google Play (upload key in GitHub Secrets, signing key managed by Google)
- **Version format:** `versionName: 1.0.0`, `versionCode: auto-increment` (CI build number)
- **Staged rollout:** Google Play's built-in percentage rollout (1% → 5% → 25% → 100%)
- **Rollback:** Halt staged rollout in Play Console. Users on bad version keep it until next update. Cannot force downgrade — ship a hotfix instead.

### 1.2 iOS (App Store)

```
Internal TestFlight → External TestFlight → App Store (Phased Release)
```

| Phase                   | Audience                              | Duration    | Entry Criteria                                    | Exit Criteria                                       |
| ----------------------- | ------------------------------------- | ----------- | ------------------------------------------------- | --------------------------------------------------- |
| **Internal TestFlight** | Project owner + 5 (Apple ID invited)  | 1–3 days    | IPA builds, basic smoke test passes               | No P0/P1 crashes, core flows work                   |
| **External TestFlight** | Up to 10,000 beta testers             | 2–4 weeks   | Internal signed off, TestFlight review passed     | Crash-free ≥ 99.5%, no data loss, privacy review OK |
| **App Store (Phased)**  | 1% → 2% → 5% → 10% → 20% → 50% → 100% | 7 days auto | External beta signed off, App Store review passed | Each day: no anomalies in crash rate                |

**Release workflow:**

```
Tag: ios/v1.0.0
  → release-ios.yml triggers (macOS runner)
  → Fastlane `gym` builds + signs IPA
  → Fastlane `pilot` uploads to TestFlight
  → Manual promotion: internal → external → App Store submission
  → App Store Review (1–3 days)
  → Phased release: Apple auto-advances over 7 days (can pause/halt)
```

**Key details:**

- **Signing:** Fastlane Match (certificates + profiles stored in encrypted Git repo)
- **Version format:** `CFBundleShortVersionString: 1.0.0`, `CFBundleVersion: CI build number`
- **Phased release:** Apple's built-in 7-day phased release (1% → 2% → 5% → 10% → 20% → 50% → 100%)
- **Rollback:** Pause phased release in App Store Connect. Remove the version from sale (extreme). Ship a hotfix build. Cannot force-downgrade — users who downloaded keep the version.
- **Expedited review:** Available for critical fixes (Apple approves within hours for genuine emergencies).

### 1.3 Web (CDN Deployment)

```
Staging → Canary (Shadow) → Production CDN
```

| Phase          | Audience                 | Duration  | Entry Criteria                       | Exit Criteria                                   |
| -------------- | ------------------------ | --------- | ------------------------------------ | ----------------------------------------------- |
| **Staging**    | Project owner + testers  | Automatic | Merge to main, CI passes             | Manual smoke test passes                        |
| **Canary**     | 5% of production traffic | 1–2 hours | Staging signed off, manual promotion | Error rate ≤ baseline, no P0/P1, performance OK |
| **Production** | 100% of traffic          | Instant   | Canary signed off                    | Monitoring confirms stability                   |

**Release workflow:**

```
Tag: web/v1.0.0 (or merge to main for continuous deployment)
  → release-web.yml triggers
  → npm run build (Vite production build)
  → Deploy to staging CDN (automatic)
  → Manual promotion: staging → canary (5% traffic split)
  → Monitor for 1–2 hours
  → Promote: canary → production (100%)
```

**Key details:**

- **CDN:** Cloudflare Pages, Vercel, or Caddy static file serving on the VPS (decision based on ADR-0007 self-hosting preference — start with VPS-served, add CDN layer when traffic warrants)
- **Canary implementation:** Caddy `handle` with weighted `reverse_proxy` upstreams, or Cloudflare Workers for edge-level traffic splitting
- **Rollback:** Instant — re-deploy previous build artifact. CDN cache invalidation takes seconds.
- **Service worker:** Versioned service worker ensures clients pick up the new version on next navigation. Show a "New version available" toast — never force-reload during active use.

### 1.4 Windows (Microsoft Store)

```
Sideload (Dev) → Windows Insider / Flight Ring → Microsoft Store
```

| Phase                            | Audience             | Duration  | Entry Criteria                              | Exit Criteria                     |
| -------------------------------- | -------------------- | --------- | ------------------------------------------- | --------------------------------- |
| **Sideload**                     | Project owner        | 1–3 days  | MSIX package builds, basic smoke test       | No P0/P1 crashes, core flows work |
| **Flight Ring (Package Flight)** | ~20 invited testers  | 1–2 weeks | Sideload signed off                         | Crash-free ≥ 99.5%, sync works    |
| **Microsoft Store**              | General availability | Immediate | Flight ring signed off, Store review passed | Monitoring confirms stability     |

**Release workflow:**

```
Tag: windows/v1.0.0
  → release-windows.yml triggers (windows runner)
  → dotnet publish → MSIX packaging
  → Upload to Partner Center (flight ring) via Store CLI
  → Manual promotion: flight → general availability
```

**Key details:**

- **Signing:** MSIX signed with a code signing certificate (stored in GitHub Secrets)
- **Version format:** `1.0.0.0` (four-part MSIX version)
- **Package flights:** Microsoft Store's built-in flight ring feature for staged rollout to specific user groups
- **Rollback:** Submit a new package with a higher version number. Cannot force-remove — ship a hotfix. For sideloaded versions, distribute the previous MSIX directly.
- **Auto-update:** Microsoft Store handles auto-update. Sideloaded: manual update distribution.

---

## 2. Feature Flag Strategy

### 2.1 Architecture

Feature flags enable decoupling **deployment** (shipping code) from **release** (activating features). This is critical for:

- Gradual feature rollouts across platforms
- Kill switches for broken features
- A/B testing
- Platform-specific feature availability

```
┌─────────────────────────────────┐
│  Feature Flag Evaluation        │
│                                 │
│  Client-side (edge-first):      │
│  ┌───────────────────────────┐  │
│  │ 1. Local defaults (code)  │  │  ← Always available, even offline
│  │ 2. Cached remote config   │  │  ← Synced when online
│  │ 3. Remote config (fresh)  │  │  ← Fetched on app foreground
│  └───────────────────────────┘  │
│                                 │
│  Evaluation order:              │
│  Remote (if fresh) > Cache > Default │
└─────────────────────────────────┘
```

### 2.2 Flag Definition Schema

```kotlin
// packages/core — shared across all platforms
data class FeatureFlag(
    val key: String,          // e.g., "recurring_transactions"
    val defaultValue: Boolean,
    val platform: Set<Platform>,  // which platforms this applies to
    val rolloutPercentage: Int,   // 0-100, based on stable user ID hash
    val minAppVersion: String?,   // minimum app version required
)
```

### 2.3 Flag Types

| Type             | Example                   | Evaluation         | Lifetime          |
| ---------------- | ------------------------- | ------------------ | ----------------- |
| **Release flag** | `enable_csv_import`       | Boolean            | Remove after 100% |
| **Ops flag**     | `enable_powersync_v2`     | Boolean            | Keep permanently  |
| **Experiment**   | `onboarding_flow_variant` | String (A/B/C)     | Remove after test |
| **Permission**   | `enable_premium_features` | Boolean (per-user) | Keep permanently  |
| **Kill switch**  | `disable_bank_sync`       | Boolean            | Keep permanently  |

### 2.4 Flag Storage

**Edge-first approach:** Flags are stored as a JSON document in the PostgreSQL database (synced via PowerSync to all clients):

```sql
CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Synced to all clients via PowerSync (add to sync-rules.yaml)
-- Clients cache locally and evaluate without network
```

**Why not a third-party flag service (LaunchDarkly, Unleash)?**

- Cost: LaunchDarkly is $10/seat/month minimum — disproportionate for a solo project
- Privacy: third-party flag services receive user context (even if anonymized)
- Offline: our clients must evaluate flags offline — requires local caching anyway
- Simplicity: a PostgreSQL table + PowerSync sync + KMP evaluation logic is trivial to build and own

### 2.5 Percentage-Based Rollouts

Rollout percentage is evaluated deterministically using a hash of the user's stable ID:

```kotlin
fun isFeatureEnabled(flag: FeatureFlag, userId: String): Boolean {
    if (!flag.platform.contains(currentPlatform)) return false
    if (flag.minAppVersion != null && appVersion < flag.minAppVersion) return false

    val hash = murmurHash3(flag.key + userId) % 100
    return hash < flag.rolloutPercentage
}
```

**Properties:**

- Same user always gets the same result for the same flag (stable bucketing)
- Increasing the percentage from 10% to 20% adds new users — never removes existing ones
- Different flags use different hash inputs — users aren't always in the same bucket

### 2.6 Rollout Lifecycle

```
Flag created (default: false, 0%)
    │
    ├── Internal testing:  rolloutPercentage = 100, platform = [developer_device_ids]
    │
    ├── Beta:              rolloutPercentage = 100, platform = [all] (beta environment)
    │
    ├── Canary:            rolloutPercentage = 5
    │   └── Monitor for 24-48h
    │
    ├── Staged rollout:    rolloutPercentage = 25 → 50 → 100
    │   └── Monitor at each stage
    │
    ├── GA:                rolloutPercentage = 100
    │   └── Feature is fully live
    │
    └── Cleanup:           Remove flag, delete conditional code
        └── Ship cleanup in next release
```

---

## 3. Rollback Procedures

### 3.1 Rollback Decision Matrix

| Component       | Rollback Speed | Rollback Method                              | User Impact During Rollback             |
| --------------- | -------------- | -------------------------------------------- | --------------------------------------- |
| Web app         | Seconds        | Re-deploy previous build artifact            | Brief flash; service worker update      |
| Edge Functions  | Seconds        | `docker compose` restart with previous image | Functions unavailable for ~5s           |
| Database schema | Minutes–Hours  | Run reverse migration                        | Depends on migration (see §3.3)         |
| PowerSync rules | Minutes        | Redeploy previous sync-rules.yaml            | Clients re-sync (may be slow)           |
| Android app     | Days           | Halt rollout + ship hotfix                   | Users on bad version stuck until update |
| iOS app         | Days           | Pause phased release + ship hotfix           | Users on bad version stuck until update |
| Windows app     | Days           | Ship new flight + hotfix                     | Users on bad version stuck until update |

### 3.2 Backend Rollback (< 5 minutes)

```bash
# 1. Identify the issue
docker compose -p prod logs --tail=100 <service>

# 2. Roll back to previous image version
# Edit .env to pin previous image tags, then:
docker compose -p prod up -d --no-deps <service>

# 3. If database migration is the issue, run reverse migration:
supabase db push --db-url postgres://... < reverse_migration.sql

# 4. Verify
curl -sf https://finance.example.com/health | jq .
```

### 3.3 Database Migration Rollback

**Rule: Every forward migration must have a tested reverse migration.**

```
services/api/supabase/migrations/
├── 20260306000001_initial_schema.sql
├── 20260306000001_initial_schema.down.sql   ← reverse
```

**Rollback safety categories:**

| Category            | Example                          | Rollback Risk | Strategy                                   |
| ------------------- | -------------------------------- | ------------- | ------------------------------------------ |
| Additive (safe)     | Add column, add table, add index | None          | Drop column/table/index                    |
| Destructive (risky) | Drop column, change type         | Data loss     | Never do in one step — use expand/contract |
| Data migration      | Backfill column, merge tables    | Data loss     | Keep old column readable during transition |

**Expand/Contract pattern for risky migrations:**

```
Step 1 (expand): Add new column, dual-write
Step 2 (migrate): Backfill old → new
Step 3 (verify): Confirm new column is correct
Step 4 (contract): Drop old column (separate release, after soak period)
```

### 3.4 Client App Rollback

Mobile and desktop apps cannot be remotely downgraded. Rollback strategy:

1. **Feature flag kill switch** — if the broken feature is behind a flag, disable it immediately (takes effect on next app foreground).
2. **Halt rollout** — stop the staged rollout in the store console. No new users get the bad version.
3. **Ship hotfix** — fast-track a fix through the pipeline:
   - Android: internal → production (skip beta for P0 fixes)
   - iOS: expedited review request to Apple
   - Windows: direct MSIX push
4. **Server-side mitigation** — if the bug is in sync/API interaction, fix server-side without requiring a client update.

---

## 4. Canary Deployment Patterns

### 4.1 Web Canary

```
                    Incoming traffic
                         │
                    ┌────┴────┐
                    │  Caddy  │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │ 95%      │          │ 5%
              ▼          │          ▼
        ┌──────────┐     │    ┌──────────┐
        │ Stable   │     │    │ Canary   │
        │ v1.2.0   │     │    │ v1.3.0   │
        └──────────┘     │    └──────────┘
                         │
                    Caddy weighted
                    reverse_proxy
```

**Caddy configuration for canary:**

```
handle /app/* {
    reverse_proxy {
        to stable-web:3000 canary-web:3000
        lb_policy weighted_round_robin 95 5
    }
}
```

**Canary success criteria (must all pass before promotion):**

- Error rate ≤ stable error rate + 0.5%
- P95 latency ≤ stable P95 + 200ms
- No new P0/P1 errors in Sentry
- Sync success rate ≥ 99%

### 4.2 Backend Canary

For Edge Function changes, use a canary Edge Function deployment:

1. Deploy new function version alongside existing (e.g., `process-recurring-v2`)
2. Route 5% of traffic to the new version via Caddy path routing
3. Monitor for 1–2 hours
4. Promote or rollback

---

## 5. A/B Testing Infrastructure

### 5.1 Architecture

A/B testing uses the same feature flag infrastructure (§2) with multi-variant support:

```kotlin
data class Experiment(
    val key: String,               // e.g., "onboarding_flow"
    val variants: List<Variant>,   // [A, B, C]
    val allocation: Map<String, Int>,  // {"A": 50, "B": 25, "C": 25}
    val startDate: Instant,
    val endDate: Instant?,
)

data class Variant(
    val name: String,
    val config: Map<String, Any>,  // variant-specific parameters
)
```

### 5.2 Variant Assignment

```kotlin
fun getVariant(experiment: Experiment, userId: String): Variant {
    val hash = murmurHash3(experiment.key + userId) % 100
    var cumulative = 0
    for ((variantName, percentage) in experiment.allocation) {
        cumulative += percentage
        if (hash < cumulative) {
            return experiment.variants.first { it.name == variantName }
        }
    }
    return experiment.variants.first() // fallback
}
```

### 5.3 Metric Collection

**Privacy-respecting analytics:**

- Variant assignment is logged locally (anonymized user ID + variant name)
- Outcome metrics (conversion, engagement) collected via `MetricsCollector` (consent-gated)
- No PII or financial data in experiment metrics
- Analysis done on aggregated data exported from the client, not on a server-side analytics pipeline

### 5.4 Experiment Lifecycle

```
Design experiment → Create flag → Assign variants → Run (2–4 weeks)
    → Analyze results → Pick winner → Roll out winner at 100%
    → Remove experiment flag → Clean up code
```

---

## 6. Release Tagging Convention

Per ADR-0006, platform-prefixed tags trigger platform-specific release workflows:

| Tag Pattern         | Triggers                       | Example          |
| ------------------- | ------------------------------ | ---------------- |
| `ios/v{semver}`     | `release-ios.yml`              | `ios/v1.3.0`     |
| `android/v{semver}` | `release-android.yml`          | `android/v1.3.0` |
| `web/v{semver}`     | `release-web.yml`              | `web/v2.1.0`     |
| `windows/v{semver}` | `release-windows.yml`          | `windows/v1.3.0` |
| `v{semver}`         | `release.yml` (GitHub Release) | `v1.0.0`         |

**Pre-release tags:**

| Suffix     | Meaning               | Example                  |
| ---------- | --------------------- | ------------------------ |
| `-alpha.N` | Internal testing only | `android/v1.3.0-alpha.1` |
| `-beta.N`  | External beta testing | `ios/v1.3.0-beta.3`      |
| `-rc.N`    | Release candidate     | `web/v2.1.0-rc.1`        |
| (none)     | Production release    | `android/v1.3.0`         |

---

## 7. Platform Launch Order

Based on the roadmap (iOS first, Android in parallel), the recommended launch order:

```
Phase 1: iOS + Web (alpha)
    │  iOS: TestFlight internal
    │  Web: Staging deployment
    │
Phase 2: Android + Web (beta)
    │  Android: Closed beta on Play Console
    │  iOS: External TestFlight
    │  Web: Canary → production
    │
Phase 3: All platforms (GA)
    │  iOS: App Store phased release
    │  Android: Play Store staged rollout
    │  Web: Production
    │  Windows: Microsoft Store submission
    │
Phase 4: Post-launch
    │  Monitor all platforms
    │  Address launch feedback
    │  Iterate based on real usage data
```

---

## 8. Hotfix Process

For critical production issues (P0/P1):

```
Bug reported → Triage (15 min SLA for P0)
    │
    ├── Server-side fix possible?
    │   └── YES → Fix Edge Function/DB → Deploy immediately
    │             (no app store update needed)
    │
    └── Client fix required?
        │
        ├── Feature flag can disable? → Kill switch NOW
        │
        └── Code fix needed:
            │
            ├── Branch from latest release tag
            ├── Fix + minimal test coverage
            ├── Fast-track through CI (skip non-critical checks)
            ├── Deploy per platform:
            │   ├── Web: Immediate redeploy
            │   ├── Android: Internal → Production (skip beta)
            │   ├── iOS: Expedited review request
            │   └── Windows: Direct MSIX push
            └── Post-mortem within 48 hours
```

---

## 9. References

- [ADR-0006: CI/CD Strategy](0006-cicd-strategy.md) — Release workflows and tagging
- [ADR-0007: Hosting Strategy](0007-hosting-strategy.md) — Self-hosted infrastructure
- [Environment Architecture](environments.md) — Environment definitions
- [Incident Response Runbook](incident-response-runbook.md) — P0/P1 response procedures
- [Monitoring Architecture](monitoring.md) — Observability for rollout monitoring
- [Roadmap](roadmap.md) — Platform launch order and phasing
