# GDPR Consent Management Audit

## Scope and evidence

This audit reviews the current consent posture for optional telemetry and related privacy controls using:

- `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/CrashReporter.kt`
- `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/MetricsCollector.kt`
- `apps/android/src/main/kotlin/com/finance/android/di/AppModule.kt`
- `apps/android/src/main/kotlin/com/finance/android/logging/TimberCrashReporter.kt`
- `apps/android/src/main/kotlin/com/finance/android/ui/screens/SettingsViewModel.kt`
- `apps/web/src/lib/monitoring.ts`
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/ios/Finance/Screens/SettingsView.swift`
- `apps/ios/Finance/ViewModels/SettingsViewModel.swift`

## Current consent state

### What already exists in code

1. **Shared monitoring contracts are consent-gated by design.**
   - `CrashReporter.kt` requires reporting to occur only after explicit consent and ships a `NoOpCrashReporter` that always reports disabled.
   - `MetricsCollector.kt` checks `consentProvider()` before every event write and returns an empty buffer when consent is not granted.
2. **Android defaults optional telemetry to off.**
   - `AppModule.kt` wires both `TimberCrashReporter(consentProvider = { false })` and `MetricsCollector(consentProvider = { false })`, so crash reporting and analytics are effectively disabled by default.
   - `TimberCrashReporter.kt` also keeps logs on-device only; no third-party crash SDK is active in the current DI path.
3. **Web monitoring is privacy-aware but not enabled.**
   - `apps/web/src/lib/monitoring.ts` contains PII and financial-data scrubbing, pseudonymous-user guidance, and an explicit TODO to check user consent before Sentry initialization.
   - Sentry initialization is commented out, so optional web monitoring is currently disabled rather than silently enabled.
4. **Existing platform settings storage can host consent state later.**
   - Android currently persists settings with `SharedPreferences` in `SettingsViewModel.kt`, with a comment noting future migration to DataStore or Multiplatform Settings.
   - Web already uses `localStorage` in `SettingsPage.tsx` for theme, currency, and notifications.
   - iOS already uses `UserDefaults` for settings and biometric preferences in `SettingsViewModel.swift`, but no telemetry consent setting exists.
5. **Backend logging guidance is restrictive.**
   - `services/api/supabase/functions/_shared/logger.ts` explicitly forbids logging tokens, passwords, emails, account numbers, and financial amounts.

### What does not exist yet

- No consent banner, onboarding step, or settings toggle for analytics or crash reporting on any platform.
- No backend consent record showing **what** the user agreed to, **when**, **how**, and under **which policy version**.
- No withdrawal flow that propagates revocation to SDK initialization, event buffers, or backend retention jobs.
- No cross-device consent sync model for users who use multiple platforms.
- No iOS or Windows telemetry implementation that consumes the shared consent contract.

## Gap analysis

| Area                     | Current state                                                               | Gap                                                          | GDPR risk                                 |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Consent capture          | Shared contracts expect consent, but no UI exists                           | Users cannot actively grant consent                          | Optional processing cannot lawfully start |
| Granularity              | Telemetry is conceptually split between crash reporting and metrics         | No separate toggles per purpose                              | Consent would not be specific enough      |
| Demonstrability          | No consent ledger in backend or local audit record                          | Cannot prove Art. 7 consent after the fact                   | High                                      |
| Withdrawal               | `MetricsCollector.clearEvents()` exists, but no UX or orchestration uses it | Revocation is not as easy as granting                        | High                                      |
| Platform coverage        | Android and web have hooks/placeholders; iOS and Windows do not             | Inconsistent behavior across devices                         | Medium                                    |
| SDK gating               | Web Sentry is disabled pending consent; Android Sentry is placeholder-only  | No end-to-end initialization guard for future SDK enablement | Medium                                    |
| Policy linkage           | Login and settings surfaces only privacy-policy references                  | Consent copy is not purpose-specific or versioned            | Medium                                    |
| Cross-device consistency | No consent sync schema                                                      | Users may see different telemetry states per device          | Medium                                    |

## Platform-by-platform implementation needs

| Platform | Current evidence                                                                                                              | Recommended storage               | Implementation needs                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Android  | `AppModule.kt` hard-codes `false`; `SettingsViewModel.kt` uses `SharedPreferences`                                            | **Jetpack DataStore**             | Add explicit toggles for analytics and crash reporting, migrate preferences from `SharedPreferences`, expose a reactive consent repository to Koin, and gate SDK initialization plus `MetricsCollector` and `CrashReporter` from that repository |
| iOS      | `SettingsViewModel.swift` uses `UserDefaults` for biometric settings; `SettingsView.swift` exposes only a privacy-policy link | **UserDefaults**                  | Add consent toggles in Settings and onboarding, persist per-purpose consent plus policy version and timestamp, and wire future monitoring initialization to those values                                                                         |
| Web      | `SettingsPage.tsx` already uses `localStorage`; `monitoring.ts` leaves Sentry disabled pending consent                        | **localStorage**                  | Add consent controls to Settings and onboarding, read consent before `initMonitoring()`, clear pseudonymous user context and queued events on withdrawal, and re-prompt on policy version changes                                                |
| Windows  | No telemetry implementation or consent storage found in `apps/windows/` review                                                | **ApplicationData.LocalSettings** | Introduce a settings store for telemetry consent, add privacy controls in the desktop settings UI, and ensure any future crash or metrics pipeline stays disabled until opt-in                                                                   |

## GDPR Art. 7 requirements

For optional telemetry, the implementation should satisfy the following Art. 7 duties:

1. **Demonstrable consent** — record the consent decision, policy version, timestamp, platform, and consent text identifier.
2. **Clear separation** — telemetry consent must be separate from Terms of Service acceptance or account creation.
3. **Plain language** — explain each purpose in concise, non-bundled language, such as crash diagnostics versus product analytics.
4. **Freely given and specific** — no forced opt-in for analytics or third-party crash reporting as a condition of core finance features.
5. **Easy withdrawal** — revocation must be available from the same settings area and take effect immediately.
6. **No ambiguity** — use unticked toggles or equivalent explicit affirmative action; avoid pre-checked boxes.

## Recommended consent architecture

### 1. Canonical consent model

Create a shared consent model with at least:

- `analytics: granted | denied | unknown`
- `crashReporting: granted | denied | unknown`
- `policyVersion: string`
- `updatedAt: Instant`
- `source: onboarding | settings | migration`

`unknown` should block all optional processing until the user takes an explicit action.

### 2. Local consent repository per platform

Each platform should provide a small storage-backed repository:

- Android: DataStore-backed repository
- iOS: UserDefaults-backed repository
- Web: localStorage-backed repository
- Windows: ApplicationData-backed repository

That repository should expose reactive reads so SDK and bootstrap code can decide whether optional processing may start.

### 3. Backend consent ledger

Store server-side consent evidence for auditability, for example:

- current snapshot per purpose
- append-only consent events
- policy version accepted
- platform and app version
- withdrawal timestamp

This is needed to demonstrate consent independently of device-local storage loss.

### 4. Startup and withdrawal flow

1. App starts with optional telemetry disabled.
2. Consent repository loads stored choice.
3. Only if the relevant purpose is `granted` should crash and analytics SDKs initialize.
4. On withdrawal:
   - stop future event capture
   - clear buffered analytics events via `MetricsCollector.clearEvents()`
   - clear crash-reporting user context
   - persist the new denied state locally and server-side

### 5. Purpose boundaries

Treat the following separately:

- **Essential processing**: authentication, sync, security logging, fraud prevention
- **Optional crash reporting**: third-party error collection or off-device diagnostics
- **Optional analytics**: feature usage, screen views, performance analytics used for product improvement

Essential security logging should not be mixed into the optional-consent toggle set, but it must still remain minimized and documented.

## Recommended next steps

1. Add platform privacy controls for analytics and crash reporting before enabling any third-party telemetry.
2. Introduce a shared consent repository abstraction consumed by `CrashReporter` and `MetricsCollector` providers.
3. Add a backend consent-evidence schema and API so consent can be demonstrated across devices.
4. Re-enable web and future Android Sentry initialization only after consent checks run before SDK startup.
5. Add automated tests covering default-off behavior, opt-in, withdrawal, and policy-version re-consent.
