# Production Deployment Runbook

> **Purpose:** Step-by-step deployment procedures for all Finance platforms.
> **Audience:** Release engineers, on-call developers, project maintainers.
> **Last Updated:** 2026-03-23

---

## Pre-Deployment Checklist

Complete every item before deploying to any environment.

- [ ] All CI checks pass on the release branch (`npm run ci:check`)
- [ ] `node tools/pre-release-check.js` exits cleanly
- [ ] Security scan has no CRITICAL/HIGH findings (CodeQL + Dependabot)
- [ ] Changeset version PR merged — `CHANGELOG.md` updated
- [ ] Release notes reviewed and approved by maintainer
- [ ] Beta testing period complete (minimum 72 hours for minor, 1 week for major)
- [ ] Performance baselines verified against `docs/architecture/performance-baselines.md`
- [ ] Privacy/compliance review complete for any data model changes

---

## Backend Deployment (Supabase)

### Database Migrations

```bash
# 1. Preview pending migrations
npx supabase db diff --linked

# 2. Back up current schema (safety net)
npx supabase db dump --linked -f backup-$(date +%Y%m%d).sql

# 3. Apply migrations
npx supabase db push --linked

# 4. Verify migration applied
npx supabase db diff --linked  # Should show no changes
```

**⚠️ Never run migrations without a backup. Never run against production without human review.**

### Edge Functions

```bash
# Deploy all functions
npx supabase functions deploy --linked

# Deploy a single function
npx supabase functions deploy health-check --linked

# Verify deployment
curl -s https://<project-ref>.supabase.co/functions/v1/health-check | jq .
```

### PowerSync Sync Rules

1. Update `services/api/powersync/sync-rules.yaml`
2. Deploy via PowerSync Dashboard → Sync Rules → Deploy
3. Verify client sync completes within 60 seconds

---

## iOS Deployment

### TestFlight (Beta)

```bash
cd apps/ios
bundle exec fastlane beta  # Archives, uploads to TestFlight
```

**Manual steps:**

1. Open [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to Finance → TestFlight
3. Verify build appears (allow up to 30 minutes for processing)
4. Add release notes → Submit for beta review

### App Store (Production)

```bash
cd apps/ios
bundle exec fastlane release  # Archives with release profile
```

**Manual steps:**

1. App Store Connect → Finance → App Store → Version
2. Select build → Add release notes
3. Submit for review (expect 24–48 hours)
4. After approval: Release → Phased Release (7-day rollout recommended)

| Rollout Day | Percentage |
| ----------- | ---------- |
| Day 1       | 1%         |
| Day 2       | 2%         |
| Day 3       | 5%         |
| Day 4       | 10%        |
| Day 5       | 20%        |
| Day 6       | 50%        |
| Day 7       | 100%       |

---

## Android Deployment

### Internal Testing

```bash
cd apps/android
./gradlew :apps:android:assembleRelease  # Signed APK
./gradlew :apps:android:bundleRelease    # Signed AAB for Play Store
```

### Play Console (Production)

**Manual steps:**

1. Open [Google Play Console](https://play.google.com/console)
2. Finance → Release → Production
3. Upload AAB from `apps/android/build/outputs/bundle/release/`
4. Add release notes → Review and roll out

| Rollout Stage | Percentage | Duration     |
| ------------- | ---------- | ------------ |
| Internal      | Team only  | 24 hours min |
| Closed beta   | Invited    | 72 hours min |
| Open beta     | 10%        | 48 hours     |
| Production    | 25% → 100% | 7 days       |

**Version code:** `MAJOR*10000 + MINOR*100 + PATCH` (see `tools/sync-mobile-versions.js`)

---

## Web Deployment

### Build and Deploy

```bash
npm run build -w apps/web      # Vite production build
# Output in apps/web/dist/
```

**Deployment options:**

- **Vercel/Netlify:** Automatic on push to `main`
- **Self-hosted:** Upload `dist/` to CDN/web server

### Post-Deploy Verification

- [ ] Service worker updated (check `sw.js` hash in DevTools → Application)
- [ ] Offline mode works (disconnect network, verify app loads)
- [ ] Lighthouse scores ≥ 0.95 accessibility, ≥ 0.9 performance
- [ ] All routes load without 404 (test `/accounts`, `/transactions`, `/budgets`, `/goals`)

---

## Windows Deployment

### Build MSIX

```bash
./gradlew :apps:windows:packageMsi
# Output in apps/windows/build/compose/binaries/main-release/msi/
```

### Microsoft Store

**Manual steps:**

1. Open [Partner Center](https://partner.microsoft.com/dashboard)
2. Finance → Submissions → New submission
3. Upload MSIX package
4. Complete store listing, screenshots, age rating
5. Submit for certification (expect 1–3 business days)

---

## Post-Deployment Verification

### Smoke Tests (all platforms)

- [ ] App launches without crash
- [ ] User can log in / authenticate
- [ ] Transaction create/edit/delete works
- [ ] Budget and goal views load with correct data
- [ ] Offline mode: create transaction offline → sync when online
- [ ] Data export produces valid JSON/CSV

### Monitoring Checks

- [ ] Error rate ≤ baseline (check crash reporting dashboard)
- [ ] API response times within p95 targets
- [ ] Sync success rate > 99%
- [ ] No new CodeQL/security alerts triggered

### Action Thresholds

| Error Rate vs Baseline | Action                                     |
| ---------------------- | ------------------------------------------ |
| ≤ 10% increase         | Monitor, no action needed                  |
| 10–25% increase        | Investigate, prepare rollback              |
| > 25% increase         | **Immediate rollback**, create P0 incident |

---

## Rollback Procedures

### Backend

```bash
# Revert Edge Functions to previous version
npx supabase functions deploy <function-name> --linked --version <previous>

# Database: apply down migration (if available)
# ⚠️ Requires human review — data migrations may be irreversible
```

### iOS

- Halt phased release in App Store Connect
- Submit previous version as expedited review
- Timeline: 24–48 hours for review

### Android

- Halt staged rollout in Play Console
- Upload previous AAB with incremented `versionCode`
- Timeline: 2–4 hours for review

### Web

- Revert to previous deployment (Vercel: instant rollback via dashboard)
- Or: `git revert <commit> && git push` to trigger rebuild

### Windows

- Remove submission in Partner Center
- Re-submit previous MSIX package

---

## Emergency Hotfix Process

1. Create hotfix branch: `git checkout -b hotfix/<description> <release-tag>`
2. Apply minimal fix — no feature changes
3. Run `node tools/pre-release-check.js`
4. Tag: `git tag v<version>-hotfix.1`
5. Follow platform-specific deployment above with expedited review
6. Cherry-pick fix back to `main`: `git cherry-pick <hotfix-commit>`
7. Create retrospective issue documenting root cause

---

## References

- [Release Process](./release-process.md)
- [Versioning Strategy](./versioning-strategy.md)
- [Rollback Procedures](./rollback-procedures.md)
- [Store Metadata](./store-metadata.md)
- [Performance Baselines](../architecture/performance-baselines.md)
- [Monitoring Guide](./monitoring.md)
- [Pre-Release Check Script](../../tools/pre-release-check.js)
