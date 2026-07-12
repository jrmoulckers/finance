# End-to-End Alpha Verification (All Platforms)

> **Issue:** #1243
> **Companion:** [Alpha Submission & Deployment Checklist](./submission-checklist.md) (#1248)

This document defines the **end-to-end (E2E) alpha verification matrix** the team runs
before promoting an alpha build across all platforms (iOS, Android, Web, Windows), and
**records the results of the automated smoke checks** that can be executed locally in this
repository.

It is intentionally split into two parts:

1. **Automated smoke checks** — fast, deterministic checks any engineer (or CI) can run
   locally. Results from the most recent run are recorded below.
2. **Manual cross-platform E2E matrix** — the human-driven journeys that must be walked on
   real builds/devices before an alpha is signed off. Several of these require signed
   builds, store tooling, or live backend credentials and are therefore gated on human
   action (see [Needs Human Action](#needs-human-action)).

---

## Table of Contents

- [Scope](#scope)
- [Automated Smoke Checks (Local)](#automated-smoke-checks-local)
- [Recorded Results](#recorded-results)
- [Manual Cross-Platform E2E Matrix](#manual-cross-platform-e2e-matrix)
- [Core User Journeys](#core-user-journeys)
- [Sign-off](#sign-off)
- [Needs Human Action](#needs-human-action)

---

## Scope

Alpha verification covers the **critical paths** a first external tester will exercise —
onboarding, adding accounts (bank **and** crypto), recording transactions, sync, and the
gig-driver workflows shipped in this batch. It is not a full regression pass; it is a
"does the app work end-to-end on every platform" gate.

Platforms in scope:

| Platform | Surface                        | Distribution          |
| -------- | ------------------------------ | --------------------- |
| iOS      | `apps/ios` (SwiftUI)           | TestFlight            |
| Android  | `apps/android` (Compose)       | Play Internal Testing |
| Web      | `apps/web` (React + PowerSync) | Vercel                |
| Windows  | `apps/windows`                 | Sideload              |

---

## Automated Smoke Checks (Local)

Run these from the repo root (or the noted package). They are the machine-checkable subset
of the alpha gate and should be **green before** any manual E2E begins.

| #   | Check                           | Command                                                                                                                                                                         | Platform coverage           |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | Formatting                      | `npm run format:check`                                                                                                                                                          | Web / shared JS/TS          |
| 2   | Lint (zero warnings)            | `npx eslint . --max-warnings 0`                                                                                                                                                 | Web / shared JS/TS          |
| 3   | Web unit + component tests      | `cd apps/web && npx vitest run`                                                                                                                                                 | Web                         |
| 4   | Banking + crypto provider suite | `cd apps/web && npx vitest run src/lib/banking src/lib/crypto`                                                                                                                  | Web (bank + Web3 #2164)     |
| 5   | Shared models (KMP) JVM tests   | `./gradlew :packages:models:jvmTest`                                                                                                                                            | iOS / Android / shared      |
| 6   | Sync rules / models compile     | `./gradlew :packages:models:compileKotlinJvm`                                                                                                                                   | Sync (#3530)                |
| 7   | Android compile                 | `./gradlew :apps:android:compileDebugKotlin`                                                                                                                                    | Android                     |
| 8   | Android gig workflows tests     | `./gradlew :apps:android:testDebugUnitTest --tests "com.finance.android.ui.gig.*" --tests "com.finance.android.ui.quickcash.*" --tests "com.finance.android.ui.quickactions.*"` | Android (#2141/#2137/#2133) |

---

## Recorded Results

Results from the verification run performed while landing this batch
(`feat/gig-web3-biometric-alpha-batch13`). Re-run and update this table each alpha cycle.

| #   | Check                                  | Result  | Notes                                                                               |
| --- | -------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| 3   | Web full vitest suite                  | ✅ pass | Recorded during batch verification.                                                 |
| 4   | Banking + crypto provider suite        | ✅ pass | 13 files / 100 tests — includes `CryptoBankProvider` (#2164).                       |
| 5   | Shared models (KMP) JVM tests          | ✅ pass | Covers biometric-protection mappers (#3530).                                        |
| 6   | Models compile (`compileKotlinJvm`)    | ✅ pass | Biometric sync-filtering schema + migrations compile.                               |
| 7   | Android compile (`compileDebugKotlin`) | ✅ pass | Gig tools + Schedule C quick-add + payouts + mileage.                               |
| 8   | Android gig workflow tests             | ✅ pass | `GigPlatform`, `ScheduleCPresets`, `GigMileage`, `GigPayouts`, `GigToolsViewModel`. |

> Checks **1–2** (format / lint) are enforced as the mandatory pre-push gate and by CI; a
> green PR check run is the recorded evidence for those rows.

---

## Manual Cross-Platform E2E Matrix

Walk each journey on a real build per platform. Mark ✅ / ⚠️ / ❌ and link a screen
recording or note for anything not ✅.

| Journey                                          | iOS | Android | Web | Windows |
| ------------------------------------------------ | --- | ------- | --- | ------- |
| Cold start → onboarding → first sign-in          |     |         |     |         |
| Create household / join household                |     |         |     |         |
| Add a bank account (manual import)               |     |         |     |         |
| Connect a crypto wallet/exchange (#2164)         | n/a | n/a     |     | n/a     |
| Record income + expense transaction              |     |         |     |         |
| Offline edit → reconnect → sync converges        |     |         |     |         |
| Biometric-protected txn stays owner-only (#3530) |     |         |     |         |
| Gig quick-add w/ Schedule C preset (#2141)       | n/a | ✓ req'd | n/a | n/a     |
| Shift mileage capture + deduction (#2137)        | n/a | ✓ req'd | n/a | n/a     |
| Payouts grouped by gig platform (#2133)          | n/a | ✓ req'd | n/a | n/a     |
| Sign out → data cleared locally                  |     |         |     |         |

`n/a` marks journeys that are platform-specific by design (the gig tools ship on Android;
the crypto connect UI is surfaced on Web alongside bank connections).

---

## Core User Journeys

Detailed steps for the batch-specific journeys:

### Biometric-protection sync filtering (#3530)

1. On device A (owner), mark a transaction biometric-protected.
2. Confirm it syncs and is readable on device A.
3. On device B (same household, different member), confirm the protected transaction is
   **not** present in the household bucket, while non-protected transactions are.
4. Toggle protection off; confirm the row rejoins the household bucket on device B.

### Web3 wallets & exchanges alongside banks (#2164)

1. Open **Bank Connections → Wallets & Exchanges**.
2. Add a watch-only wallet (chain + public address) and a custodial exchange (read-only).
3. Confirm balances/holdings render and health status is shown, with no secret persisted.
4. Confirm the crypto provider is discoverable via the banking provider registry
   (`registerDefaultProviders` → `getProvidersWithFeature('crypto')`).

### Gig driver workflows (Android — #2141 / #2137 / #2133)

1. From the dashboard, open **Gig Tools** (also reachable as a quick action).
2. **Mileage (#2137):** start a shift for a platform, enter start/end odometer, confirm
   miles and the IRS-rate deduction estimate; export CSV.
3. **Payouts (#2133):** confirm income deposits are grouped by platform, biggest earner
   first, with "Other" last.
4. **Quick-add (#2141):** one-handed quick cash entry, apply a Schedule C preset, confirm
   the `schedule-c` tag and category note are attached to the saved transaction.

---

## Sign-off

An alpha build is cleared for distribution when:

- [ ] All automated smoke checks (1–8) are green.
- [ ] Every in-scope cell of the manual matrix is ✅ (or has a triaged, accepted ⚠️).
- [ ] The [submission checklist](./submission-checklist.md) pre-submission section passes.
- [ ] Release owner records the build number and date below.

| Field         | Value |
| ------------- | ----- |
| Build number  |       |
| Date          |       |
| Release owner |       |

---

## Needs Human Action

These verification steps cannot be fully automated in-repo and require a human with the
appropriate access:

- **Signed device builds** for iOS (TestFlight), Android (Play Internal), and Windows
  sideload — require signing credentials / store tooling not present in CI.
- **Live backend** (Supabase + PowerSync) for true multi-device sync convergence and the
  #3530 cross-member visibility check — requires a configured alpha environment.
- **Real crypto connections (#2164):** the shipped flow is intentionally **watch-only /
  manual** (public addresses + read-only keys that are never persisted). Live exchange
  OAuth / indexer API integrations are out of scope for alpha and remain behind the manual
  intake path until credentialed providers are added.
- **IRS standard mileage rate (#2137):** `GigMileage.IRS_RATE_CENTS_PER_MILE_2024 = 67`
  must be reviewed and updated each tax year.
