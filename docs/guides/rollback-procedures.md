# Rollback Procedures

Detailed rollback instructions for every platform, database migration, and sync layer. Use this guide when a released version introduces a regression that requires reverting to a previous version.

**Related:** [Release Process](release-process.md) · [Monitoring Strategy](monitoring.md) · [Monitoring Architecture](../architecture/monitoring.md)

---

## Table of Contents

- [Decision Framework](#decision-framework)
- [Web — Vercel Rollback](#web--vercel-rollback)
- [Android — Google Play Store Rollback](#android--google-play-store-rollback)
- [iOS — App Store Rollback](#ios--app-store-rollback)
- [Windows — Microsoft Store Rollback](#windows--microsoft-store-rollback)
- [Database — Migration Rollback](#database--migration-rollback)
- [Sync — PowerSync Conflict Handling During Rollback](#sync--powersync-conflict-handling-during-rollback)
- [Communication Templates](#communication-templates)
- [Post-Rollback Checklist](#post-rollback-checklist)

---

## Decision Framework

Before initiating a rollback, assess the situation using these criteria:

| Severity | Symptoms | Action |
|----------|----------|--------|
| **P0 — Data loss or corruption** | Users report missing or garbled data; sync writes incorrect values | Immediate rollback on all affected platforms. Halt all staged rollouts. |
| **P1 — Crash on launch** | Crash-free rate drops below 95%; app unusable for a significant portion of users | Immediate rollback. Use hotfix process in parallel. |
| **P2 — Feature broken** | A core feature (transactions, budgets, sync) is broken but app launches | Halt staged rollout. Ship hotfix within 24 hours. Rollback if hotfix timeline exceeds 48 hours. |
| **P3 — Minor regression** | UI glitch, non-critical feature affected | Do NOT roll back. Ship fix in next regular release. |

> **Rule of thumb:** Roll back if the issue affects > 5% of users AND the hotfix cannot ship within 24 hours. For data integrity issues, always roll back immediately regardless of hotfix timeline.

---

## Web — Vercel Rollback

**Time to restore:** < 1 minute (instant redeployment)

Web rollbacks are the simplest because Vercel retains every previous deployment as an immutable artifact.

### Option 1: Vercel Dashboard (Recommended)

1. Open the [Vercel dashboard](https://vercel.com) → select the Finance web project.
2. Navigate to **Deployments**.
3. Find the last known-good production deployment (look for the ✅ marker on the previous version).
4. Click the **⋯** menu → **Promote to Production**.
5. Confirm the promotion. The previous version is live within seconds.
6. Verify by loading the production URL and checking the app version in the footer or console.

### Option 2: Git Revert

If Vercel auto-deploys from `main`, you can revert the commit:

```bash
# Identify the merge commit that introduced the regression
git log --oneline -10

# Revert it
git revert <commit-sha> --no-edit

# Push to main — Vercel auto-deploys the reverted state
git push origin main
```

> ⚠️ **The `git push` above is a remote operation.** Do not execute it without human approval. Prepare the revert commit locally and request approval to push.

### Post-Rollback

- [ ] Verify production URL serves the previous version
- [ ] Check Lighthouse CI scores haven't degraded
- [ ] Confirm service worker cache is invalidated (users may need a hard refresh)
- [ ] Monitor error rates in Sentry for the web platform

---

## Android — Google Play Store Rollback

**Time to restore:** Minutes to hours (depending on rollout stage)

Google Play does not support "reverting" to a previous version. You must publish a new release with a higher `versionCode`.

### If in Staged Rollout (< 100%)

1. Open [Google Play Console](https://play.google.com/console) → select Finance.
2. Navigate to **Release** → **Production** (or the affected track).
3. Click **Halt rollout** to stop the broken version from reaching additional users.
4. Users who already updated will keep the broken version until a fix ships.
5. To restore the previous behavior:
   - Build the previous release source with an **incremented `versionCode`** (e.g., if broken = `10301`, new = `10302`).
   - Upload the AAB and resume rollout with the fix.

### If Fully Rolled Out (100%)

1. **Immediately** begin the [hotfix process](release-process.md#hotfix-process):

   ```bash
   git checkout -b hotfix/android-v1.3.1 android/v1.3.0
   ```

2. Apply the revert/fix, increment `versionCode`, build a signed AAB.
3. Upload to Play Console → **Internal testing** track first.
4. Smoke test on the internal track.
5. Promote directly to **Production** (skip staged rollout for hotfixes if severity is P0/P1).

### Emergency: Managed Publishing

If the broken version has not yet gone live (Play Console shows "In review" or "Pending publication"):

1. Go to **Publishing overview** → enable **Managed publishing** if not already enabled.
2. Find the pending release and **unpublish** it before it goes live.
3. This prevents the broken version from reaching any users.

### Build Number Rules

Android `versionCode` must always increase. When rolling back code to a previous version, you must still increment the `versionCode`:

```
v1.3.0 (versionCode 10300) — working
v1.3.1 (versionCode 10301) — broken ← users got this
v1.3.2 (versionCode 10302) — rollback (same code as v1.3.0, new versionCode)
```

### Post-Rollback

- [ ] Verify the fix build is live on Play Console
- [ ] Monitor crash-free rate in Sentry → Releases → new version
- [ ] Check `sync_health_logs` for Android devices — sync success rate recovering
- [ ] Monitor Play Console → **Android vitals** for ANR rate and crash rate

---

## iOS — App Store Rollback

**Time to restore:** 24–48 hours (App Store review required)

Apple does not support rollbacks in the App Store. Users who have updated cannot downgrade. The only path is to ship a new version with the fix.

### If in TestFlight Only (Not Live in App Store)

1. Open [App Store Connect](https://appstoreconnect.apple.com) → select Finance.
2. Navigate to **TestFlight** → find the broken build.
3. Click the build → **Expire Build**. This removes it from TestFlight and testers revert to the previous available build.
4. If no previous build is available on TestFlight, upload a known-good build:

   ```bash
   git checkout ios/v1.2.0  # previous good tag
   # Build and upload via Fastlane
   ```

### If Live in App Store

1. **Begin the [hotfix process](release-process.md#hotfix-process) immediately:**

   ```bash
   git checkout -b hotfix/ios-v1.3.1 ios/v1.3.0
   ```

2. Apply the revert/fix, bump `CFBundleShortVersionString` to `1.3.1`, increment build number.
3. Build via Fastlane `gym` and upload to TestFlight via `pilot`.
4. Run a rapid smoke test on TestFlight (15–30 min minimum).
5. Submit to App Store for review.

6. **Request Expedited Review:**
   - In App Store Connect, after submitting the build, click **Contact Us** or use the **Request Expedited Review** option.
   - Explain this is a critical bug fix (crash, data loss, security issue).
   - Apple typically processes expedited reviews within 24 hours.

7. **While waiting for review**, communicate to users via:
   - In-app message (if the app still launches) suggesting workarounds.
   - Support channels (email, social media).
   - Status page update (if configured).

### Prevention Strategy

> **For iOS, prevention is the best rollback strategy.** Always:
> - Use TestFlight with a meaningful beta period (minimum 3–7 days) before promoting to App Store.
> - Use phased release (automatic 7-day rollout) rather than immediate release to all users.
> - Enable **Phased Release** in App Store Connect: this distributes the update to 1%, 2%, 5%, 10%, 20%, 50%, 100% over 7 days, giving time to catch issues.

### Post-Rollback

- [ ] Verify the fix build is approved and live in the App Store
- [ ] Monitor Sentry → Releases → new iOS version for crash reports
- [ ] Check TestFlight crash logs for any lingering issues
- [ ] Verify sync health on iOS devices via `sync_health_logs`
- [ ] Update the App Store "What's New" text to mention the fix

---

## Windows — Microsoft Store Rollback

**Time to restore:** 24–48 hours (Store certification required)

### If in Flight Ring Only (Not Live in Store)

1. Open [Partner Center](https://partner.microsoft.com/dashboard) → select Finance.
2. Navigate to **Packages** → **Package flights**.
3. Find the flight ring containing the broken build.
4. Remove the broken MSIX package from the flight and save.
5. Upload a known-good MSIX if testers need a working version.

### If Live in Microsoft Store

1. **Begin the [hotfix process](release-process.md#hotfix-process):**

   ```bash
   git checkout -b hotfix/windows-v1.3.1 windows/v1.3.0
   ```

2. Apply the revert/fix, bump the MSIX version to `1.3.1.0`.
3. Build the MSIX package (`./gradlew :apps:windows:packageMsi`).
4. Submit via Partner Center or the MS Store Submission API.
5. Request **expedited certification** in the submission notes (explain the severity).

### Gradual Rollout

Use Partner Center's **gradual rollout** feature to limit exposure:

1. In the submission, enable **gradual rollout**.
2. Set the initial percentage (e.g., 10%).
3. Monitor error rates before increasing to 50%, then 100%.
4. If issues are detected, **Halt** the rollout from Partner Center.

### MSIX Version Rules

MSIX versions must be four-part (`Major.Minor.Patch.Revision`) and must always increase:

```
1.3.0.0 — working
1.3.1.0 — broken
1.3.2.0 — rollback (same code as 1.3.0.0, higher version number)
```

The fourth segment is reserved by the Store and must be `0`.

### Post-Rollback

- [ ] Verify the fix package passed Store certification
- [ ] Monitor Sentry → Releases → new Windows version
- [ ] Check Windows App Certification Kit (WACK) results
- [ ] Verify auto-update picks up the fix version on test devices

---

## Database — Migration Rollback

Database rollback is the most dangerous operation. Supabase migrations are forward-only by default. Rolling back requires explicit down-migration scripts.

### Prerequisites

Every migration file in `services/api/supabase/migrations/` SHOULD have a corresponding rollback script documented in the migration's header comment or in a `rollback/` companion directory.

### Rollback Steps

1. **Identify the problematic migration:**

   ```bash
   # List recent migrations applied to the database
   ls -la services/api/supabase/migrations/
   ```

2. **Verify the rollback script exists and is safe:**
   - Read the migration file to understand what it changed (new tables, altered columns, new RLS policies).
   - Confirm the rollback script reverses the changes without data loss.
   - **NEVER run `DROP TABLE` or `TRUNCATE` without verifying that no user data will be lost.**

3. **Test the rollback on a staging/local environment first:**

   ```bash
   # Reset local Supabase and apply migrations up to the target version
   npx supabase db reset  # local only
   ```

4. **Apply the rollback to production:**

   > ⚠️ **This is a destructive operation.** Do NOT execute rollback SQL on production without explicit human approval from the project lead. Prepare the SQL, explain its impact, and request approval.

5. **Verify data integrity after rollback:**
   - Run validation queries to confirm row counts and data consistency.
   - Verify RLS policies are intact (run as both `anon` and `authenticated` roles).
   - Check that Edge Functions still work with the rolled-back schema.

### Common Rollback Patterns

| Migration Type | Rollback Approach | Risk Level |
|----------------|-------------------|------------|
| **Add new table** | `DROP TABLE IF EXISTS <table>` (safe if table is unused) | Low |
| **Add new column** | `ALTER TABLE <table> DROP COLUMN <column>` (safe if column is unused) | Low |
| **Alter column type** | `ALTER TABLE <table> ALTER COLUMN <column> TYPE <old_type>` | Medium — may fail if data doesn't fit old type |
| **Add RLS policy** | `DROP POLICY <policy> ON <table>` | Medium — verify no security gap |
| **Drop column** | **Cannot roll back** — data is gone. Must restore from backup. | Critical |
| **Data migration** | **Cannot roll back** — must restore from backup or run reverse data migration. | Critical |

### Backup Verification

Before any database rollback:

- [ ] Confirm Supabase point-in-time recovery (PITR) is enabled
- [ ] Note the current timestamp for potential PITR restore
- [ ] Verify the most recent backup is healthy (Supabase Dashboard → Database → Backups)

---

## Sync — PowerSync Conflict Handling During Rollback

Rolling back a client app version while the sync layer is active creates potential conflicts. Different client versions may have different schemas, different write rules, or different data expectations.

### Scenario: Client Rollback with Schema Change

If the broken release included a database schema change (new column, new table) AND clients already synced data using the new schema:

```
Timeline:
  v1.3.0 (old schema)  →  v1.3.1 (new schema, broken)  →  v1.3.2 (rolled back to old schema)
                              ↑
                     Some clients synced data with new columns
```

**Resolution steps:**

1. **PowerSync sync rules must handle both schemas.** Ensure the PowerSync sync rules (`services/api/powersync/`) accept writes from both old and new schema versions gracefully.

2. **Server-side schema must remain backward-compatible:**
   - Do NOT drop the new columns/tables from the server database during rollback — old-version clients that haven't updated yet will still send data with the old schema, and clients that briefly ran the new version may have writes in the PowerSync upload queue.
   - Instead, make the new columns nullable or add default values so old-version clients don't break.

3. **Handle orphaned data:**
   - Data written to new columns by v1.3.1 clients may be meaningless after rollback. Mark it for cleanup but do not delete it immediately.
   - Add a migration in the next release to clean up orphaned data if needed.

4. **Monitor the PowerSync queue:**
   - Watch for upload failures in `sync_health_logs` — these indicate schema mismatches.
   - Check the PowerSync dashboard for elevated conflict rates.

### Scenario: Client Rollback Without Schema Change

If the broken release did NOT change the database schema (pure UI/logic bug):

- Rollback is safe from a sync perspective.
- Pending mutations from the broken version will still sync correctly because the schema hasn't changed.
- No special PowerSync handling required.

### Scenario: Multiple Client Versions Active Simultaneously

During any rollback, expect a period where multiple client versions are active:

| Client State | Action |
|-------------|--------|
| Never updated (still on v1.3.0) | No action — working normally |
| Updated to v1.3.1 (broken) | Will receive v1.3.2 via auto-update |
| Updated to v1.3.1, has pending offline mutations | Mutations will upload when online — ensure server accepts them |
| Updated to v1.3.2 (fix) | Working normally |

**Key principle:** The server must accept writes from ALL active client versions during the transition period. Use versioned API endpoints or schema-tolerant sync rules.

### PowerSync Conflict Resolution During Rollback

Finance uses PowerSync's CRDT-based conflict resolution. During a rollback:

1. **Last-write-wins (LWW)** applies to most fields — the most recent write wins regardless of client version.
2. **Delete conflicts** — if a rolled-back client doesn't know about a record created by the broken version, it won't delete it. The record persists on the server. Clean up in the next release if needed.
3. **Queue depth monitoring** — watch `pending_mutations` on clients. If it grows unexpectedly, investigate whether the server is rejecting writes from old-schema clients.

### Post-Rollback Sync Verification

- [ ] PowerSync dashboard shows no elevated error rates
- [ ] `sync_health_logs` shows sync success rate recovering to baseline
- [ ] No clients stuck in `Unhealthy` sync status for > 30 minutes
- [ ] Conflict rate returns to baseline (< 5% of syncs)
- [ ] Upload queue depth is stable or decreasing across all platforms

---

## Communication Templates

Use these templates to notify stakeholders during a rollback.

### Internal Team Notification (Slack / Teams)

```
🚨 ROLLBACK IN PROGRESS — [Platform] v[X.Y.Z]

Issue: [Brief description of the regression]
Severity: [P0/P1/P2]
Affected users: [Estimated count or percentage]
Action: Rolling back to v[X.Y.Z-1]. Hotfix branch created.
ETA for fix: [Estimated time]

Tracking: [Link to GitHub issue]
Dashboard: [Link to monitoring dashboard]

Please hold off on any [platform] releases until the all-clear.
```

### User-Facing Status Update (Status Page / Social)

```
We're aware of an issue with the latest [Platform] update (v[X.Y.Z])
that may cause [brief user-visible symptom].

We're rolling out a fix now. Most users will receive the update
automatically within [timeframe].

Your data is safe — [platform]'s offline storage ensures no data
is lost during this process.

We apologize for the inconvenience. Updates will be posted here.
```

### Post-Rollback All-Clear

```
✅ ROLLBACK COMPLETE — [Platform] v[X.Y.Z]

The fix (v[X.Y.Z+1]) is now live. Monitoring confirms:
- Crash-free rate: [XX]%
- Sync success rate: [XX]%
- Error rate: back to baseline

Root cause: [One-line summary]
Post-incident review scheduled: [Date/time]
```

---

## Post-Rollback Checklist

After completing a rollback on any platform:

### Immediate (Within 1 Hour)

- [ ] Rollback version is live and accessible to users
- [ ] Smoke tests pass on the rolled-back version (see [Post-Release Verification](release-process.md#post-release-verification))
- [ ] Monitoring dashboards confirm error rates returning to baseline
- [ ] Internal team notified of rollback status
- [ ] User-facing communication sent (if applicable)

### Short-Term (Within 24 Hours)

- [ ] Root cause identified and documented in the GitHub issue
- [ ] Hotfix PR opened with regression test that covers the bug
- [ ] Post-incident review scheduled (blameless retrospective)
- [ ] Staged rollout percentages reset for the next release
- [ ] Release checklist updated if the regression could have been caught earlier

### Follow-Up (Within 1 Week)

- [ ] Post-incident review completed — action items documented
- [ ] Regression test added to CI to prevent recurrence
- [ ] Release process improvements implemented (if any identified)
- [ ] Monitoring thresholds adjusted if the issue wasn't caught fast enough
- [ ] Updated this runbook if the rollback process revealed gaps

---

## References

- [Release Process](release-process.md) — Full release workflow, changesets, and hotfix process
- [Monitoring Strategy](monitoring.md) — Sync health, API metrics, and alert thresholds
- [Monitoring Architecture](../architecture/monitoring.md) — Sentry integration, dashboards, and privacy guardrails
- [Performance Guide](performance.md) — Performance baselines for comparison
- [Launch Checklist](launch-checklist.md) — Pre-launch verification including incident response readiness
