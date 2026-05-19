# App Store Privacy Label Parity

> **Issue:** [#1701](https://github.com/jrmoulckers/finance/issues/1701)
> **Last updated:** 2026-05-19
> **Owner:** Security & Privacy Reviewer
> **Status:** Initial mapping — living document
> **Regulation scope:** Apple App Privacy, Google Play Data Safety, Microsoft Store Privacy, Web Privacy Manifest

This document maps Finance's **actual data collection and processing behavior** to each
app store's privacy disclosure requirements. It ensures that every privacy label,
nutrition label, and data-safety declaration filed with a distribution platform
accurately reflects what the shipping build does.

**If actual behavior and store declarations diverge, store declarations must be updated
before the next submission.** See [Material Change Triggers](#material-change-triggers)
for the list of code changes that require a disclosure review.

---

## Table of Contents

- [Data Collection Summary](#data-collection-summary)
- [Apple App Store Privacy Labels](#apple-app-store-privacy-labels)
  - [Data Used to Track You](#data-used-to-track-you)
  - [Data Linked to You](#data-linked-to-you)
  - [Data Not Linked to You](#data-not-linked-to-you)
  - [Data Not Collected](#data-not-collected)
  - [Apple Verification Checklist](#apple-verification-checklist)
- [Google Play Data Safety](#google-play-data-safety)
  - [Data Collected](#google-play--data-collected)
  - [Data Shared](#google-play--data-shared)
  - [Security Practices](#google-play--security-practices)
  - [Google Play Verification Checklist](#google-play-verification-checklist)
- [Microsoft Store Privacy](#microsoft-store-privacy)
  - [Microsoft Verification Checklist](#microsoft-verification-checklist)
- [Web Privacy Manifest](#web-privacy-manifest)
  - [Web Verification Checklist](#web-verification-checklist)
- [Cross-Platform Data Collection Audit](#cross-platform-data-collection-audit)
- [Material Change Triggers](#material-change-triggers)
- [Data Collection Audit Process](#data-collection-audit-process)
- [Discrepancy Log](#discrepancy-log)
- [References](#references)

---

## Data Collection Summary

The following table consolidates **every category of data the app collects** across all
platforms. This is the single source of truth — each platform's store declaration must
be derivable from this table.

> **Source:** [docs/compliance/data-inventory.md](data-inventory.md) (GDPR Article 30
> Records of Processing Activities), codebase audit of pps/, packages/, services/.

| #   | Data Category        | Specific Data                                     | Collected? | Purpose                               | Linked to User? | Used for Tracking? | Required / Optional | Legal Basis (GDPR)      |
| --- | -------------------- | ------------------------------------------------- | ---------- | ------------------------------------- | --------------- | ------------------ | ------------------- | ----------------------- |
| 1   | Contact Info         | Email address                                     | Yes        | Authentication, account management    | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 2   | Contact Info         | Display name                                      | Yes        | Profile personalization, household UX | Yes             | No                 | Optional            | 6(1)(b) Contract        |
| 3   | Contact Info         | Avatar URL                                        | Yes        | Profile personalization               | Yes             | No                 | Optional            | 6(1)(a) Consent         |
| 4   | Financial Info       | Transactions (amounts, payees, notes, dates)      | Yes        | Core app functionality                | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 5   | Financial Info       | Account balances and account names                | Yes        | Core app functionality                | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 6   | Financial Info       | Budget configurations                             | Yes        | Budget tracking feature               | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 7   | Financial Info       | Financial goals                                   | Yes        | Goal tracking feature                 | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 8   | Financial Info       | Categories                                        | Yes        | Transaction categorization            | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 9   | Identifiers          | User ID (UUID)                                    | Yes        | Internal — sync and data ownership    | Yes             | No                 | Required            | 6(1)(b) Contract        |
| 10  | Identifiers          | Device ID (rotatable, non-hardware)               | Yes        | Sync health monitoring                | No              | No                 | Required            | 6(1)(f) Legit. interest |
| 11  | Usage Data           | App interactions / feature usage events           | Opt-in     | Product improvement analytics         | No              | No                 | Optional            | 6(1)(a) Consent         |
| 12  | Diagnostics          | Crash logs                                        | Opt-in     | Stability and bug fixing              | No              | No                 | Optional            | 6(1)(a) Consent         |
| 13  | Diagnostics          | Performance diagnostics                           | Opt-in     | Performance monitoring                | No              | No                 | Optional            | 6(1)(a) Consent         |
| 14  | Auth Credentials     | Passkey credential ID, public key, counter        | Yes        | WebAuthn authentication               | Yes             | No                 | Required            | 6(1)(f) Legit. interest |
| 15  | Operational Metadata | Sync health logs (duration, record count, status) | Yes        | Service reliability                   | No              | No                 | Required            | 6(1)(f) Legit. interest |
| 16  | Operational Metadata | Audit log (action, table, record ID)              | Yes        | Security accountability               | Yes             | No                 | Required            | 6(1)(f) Legit. interest |
| 17  | Network Metadata     | IP address (audit/export logs only)               | Yes        | Abuse prevention                      | Yes             | No                 | Required            | 6(1)(f) Legit. interest |
| 18  | Household Data       | Household name, membership, invitations           | Yes        | Multi-user sharing feature            | Yes             | No                 | Optional (feature)  | 6(1)(b) Contract        |
| 19  | Preferences          | Currency code, theme, notification settings       | Yes        | App personalization                   | Yes             | No                 | Required            | 6(1)(b) Contract        |

**Data NOT collected (any platform):**

- Location (precise or approximate)
- Contacts / address book
- Photos, videos, or camera access
- Audio or microphone recordings
- Health or fitness data
- Browsing or search history
- Advertising identifiers (IDFA/GAID)
- SMS or call logs
- Calendar data
- Files or documents (beyond user-initiated CSV/JSON import)

---

## Apple App Store Privacy Labels

> **Reference:** [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
> **Existing draft:** [docs/legal/privacy-labels-apple.md](../legal/privacy-labels-apple.md)
> **Form location:** App Store Connect → App → App Privacy

Apple's privacy labels categorize data into four tiers:

1. **Data Used to Track You** — data used to track across apps/websites owned by other companies
2. **Data Linked to You** — data connected to your identity
3. **Data Not Linked to You** — data collected but not linked to your identity
4. **Data Not Collected** — data the app does not collect at all

### Data Used to Track You

**Finance does not track users across other companies' apps or websites.**

No data types should be declared in this section. Finance does not integrate
advertising SDKs, attribution frameworks, or cross-app tracking identifiers.

> **Apple definition of tracking:** Linking user or device data with third-party data
> for targeted advertising or advertising measurement, or sharing user data with a data
> broker. Finance does none of these.

### Data Linked to You

These data types are collected and can be associated with the user's identity:

| Apple Data Type Category | Apple Data Type      | Maps to Collection Summary # | Purpose (Apple categories) | Notes                                              |
| ------------------------ | -------------------- | ---------------------------- | -------------------------- | -------------------------------------------------- |
| Contact Info             | Email Address        | #1                           | App Functionality          | Required for authentication                        |
| Contact Info             | Name                 | #2                           | App Functionality          | Display name; optional                             |
| Financial Info           | Other Financial Info | #4, #5, #6, #7, #8           | App Functionality          | Transactions, accounts, budgets, goals, categories |
| Identifiers              | User ID              | #9                           | App Functionality          | Internal UUID; not shared externally               |

### Data Not Linked to You

These data types are collected but are not linked to the user's identity through
anonymization or pseudonymization:

| Apple Data Type Category | Apple Data Type     | Maps to Collection Summary # | Purpose (Apple categories) | Notes                               |
| ------------------------ | ------------------- | ---------------------------- | -------------------------- | ----------------------------------- |
| Diagnostics              | Crash Data          | #12                          | App Functionality          | Opt-in; consent-gated; PII scrubbed |
| Diagnostics              | Performance Data    | #13                          | App Functionality          | Opt-in; consent-gated               |
| Usage Data               | Product Interaction | #11                          | Analytics                  | Opt-in; consent-gated; anonymized   |

> **Important:** Diagnostics and Usage Data should only be declared if telemetry is
> enabled in the shipping build. If Sentry or another crash SDK is not active in the
> release build, do not declare these types. See
> [Apple Verification Checklist](#apple-verification-checklist).

### Data Not Collected

The following Apple data types are **not collected** by Finance and should be marked
accordingly in App Store Connect:

- **Contact Info:** Phone Number, Physical Address, Other User Contact Info
- **Health & Fitness:** Health, Fitness
- **Financial Info:** Payment Info (we do not process real payments), Credit Info
- **Location:** Precise Location, Coarse Location
- **Sensitive Info:** Sensitive Info (racial/ethnic, political, religious, sexual orientation, etc.)
- **Contacts:** Contacts
- **User Content:** Emails or Text Messages, Photos or Videos, Audio Data, Gameplay Content, Customer Support, Other User Content
- **Browsing History:** Browsing History
- **Search History:** Search History
- **Identifiers:** Device ID (we use a rotatable ID, not a hardware identifier)
- **Purchases:** Purchase History
- **Other Data:** Other Data Types

### Apple Verification Checklist

Complete this checklist before every App Store submission:

- [ ] **Build audit:** Inspect the release .ipa for bundled SDKs (otool -L or similar). Confirm no unexpected analytics/advertising frameworks are included.
- [ ] **Sentry/crash SDK status:** Is a crash reporting SDK active in this build? If yes → declare Crash Data. If no → do not declare.
- [ ] **Telemetry toggles:** Verify ConsentManager defaults to off. Confirm telemetry only activates after explicit user opt-in.
- [ ] **ATT (App Tracking Transparency):** Finance does not track, so ATT prompt is not required. If this changes, ATT must be implemented before declaring tracking.
- [ ] **Third-party SDKs:** Review all linked frameworks. If any SDK collects data (even usage metrics), it must be reflected in the privacy labels.
- [ ] **Data Linked vs. Not Linked:** Confirm diagnostics are truly anonymized (no user ID attached). If Sentry includes user context, diagnostics move to "Linked."
- [ ] **Privacy Policy URL:** Confirm the URL in App Store Connect points to the current, published privacy policy.
- [ ] **Cross-reference:** Compare this document's Apple section against the App Store Connect form field-by-field. No omissions, no over-declarations.

---

## Google Play Data Safety

> **Reference:** [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)
> **Existing docs:** [docs/android/data-safety-declaration.md](../android/data-safety-declaration.md), [docs/legal/data-safety-google-play.md](../legal/data-safety-google-play.md)
> **Form location:** Google Play Console → App content → Data safety

### Google Play — Data Collected

| Play Console Category    | Data Type            | Collected | Shared        | Purpose                | Required / Optional |
| ------------------------ | -------------------- | --------- | ------------- | ---------------------- | ------------------- |
| Personal info            | Email address        | Yes       | No            | Account management     | Required            |
| Personal info            | Name (display name)  | Yes       | No            | App functionality      | Optional            |
| Financial info           | User payment info \* | Yes       | No            | App functionality      | Required            |
| App activity             | App interactions     | Opt-in    | No            | Analytics              | Optional            |
| App info and performance | Crash logs           | Opt-in    | \*\* See note | App stability          | Optional            |
| App info and performance | Diagnostics          | Opt-in    | \*\* See note | Performance monitoring | Optional            |
| Device or other IDs      | Device or other IDs  | Yes       | No            | Sync health monitoring | Required            |

> \* Google Play's "User payment info" maps to our transaction records, account balances,
> budgets, and goals — we do **not** process real payment instruments (credit cards, bank
> routing numbers, etc.).
>
> \*\* Crash logs and diagnostics are shared with a third-party crash reporting provider
> (Sentry) **only** if Sentry is enabled in the shipping build AND the user has opted in.
> If Sentry is disabled or not yet integrated, mark as "Not shared."

### Google Play — Data Shared

**Finance does not share user data with third parties** for advertising, marketing,
or data brokerage purposes.

| Sharing scenario            | Shared?                  | Condition                                   |
| --------------------------- | ------------------------ | ------------------------------------------- |
| Advertising networks        | No                       | No ad SDKs integrated                       |
| Analytics providers         | No                       | Analytics processed on-device               |
| Third-party crash reporting | Conditional              | Only if Sentry is enabled AND user consents |
| Data brokers                | No                       | —                                           |
| Government / legal          | Only if legally required | Standard compliance                         |

### Google Play — Security Practices

| Security Question                                        | Answer                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Is all collected user data encrypted in transit?         | Yes — TLS 1.3 enforced for all network communication                              |
| Is all collected user data encrypted at rest?            | Yes — SQLCipher (AES-256) on Android; Supabase default encryption server-side     |
| Do you provide a way for users to request data deletion? | Yes — Settings → Delete Account (cascading soft-delete + crypto-shredding intent) |
| Does your app follow Google's Families Policy?           | N/A — app is not directed at children                                             |

### Google Play Verification Checklist

Complete this checklist before every Play Store submission:

- [ ] **AAB/APK inspection:** Decompile the release build and search for unexpected SDKs (pkanalyzer dependencies). Confirm no advertising or analytics libraries are bundled beyond what is declared.
- [ ] **Sentry status:** Is io.sentry:sentry-android in the dependency tree of the release build? If yes → declare crash logs as shared with Sentry. If no → mark as not shared.
- [ ] **Consent defaults:** Verify AppModule.kt wires consentProvider = { false } for both CrashReporter and MetricsCollector. Confirm telemetry is off by default.
- [ ] **SharedPreferences audit:** Confirm consent state is stored in EncryptedSharedPreferences, not plain SharedPreferences. (See [privacy-compliance-review.md gap #9](privacy-compliance-review.md).)
- [ ] **Data deletion:** Test the account deletion flow end-to-end on a physical device.
- [ ] **Data export:** Test data export (CSV/JSON) on a physical device.
- [ ] **Third-party SDKs:** Review uild.gradle.kts dependency tree. Any new runtime dependency that collects user data must be reflected in the Data Safety form.
- [ ] **Cross-reference:** Compare this document's Google Play section against the Play Console form field-by-field.

---

## Microsoft Store Privacy

> **Reference:** [Microsoft Store Privacy Policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#105-personal-information)
> **Form location:** Microsoft Partner Center → App → Properties → Privacy policy

Microsoft Store requires a privacy policy URL and optional privacy declarations
in Partner Center. Unlike Apple and Google, Microsoft does not have a structured
"nutrition label" form, but does require:

1. **Privacy policy URL** — must be accessible and describe all data collection
2. **Declarations** about data collection, use, and sharing in the store listing
3. **Windows App Certification Kit (WACK)** compliance

### Microsoft Store Privacy Declarations

| Declaration Area                    | Finance Answer                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Does the app collect personal info? | Yes — email, display name, financial data                                         |
| Does the app share personal info?   | No — data is not shared with third parties                                        |
| Does the app use location?          | No                                                                                |
| Does the app use the camera/mic?    | No                                                                                |
| Does the app include ads?           | No                                                                                |
| Internet connection required?       | Optional — app works offline; internet needed for sync                            |
| Does the app use Windows Hello?     | Yes — for biometric authentication gating                                         |
| Data encryption?                    | Yes — SQLCipher (AES-256) local, DPAPI for credential storage, TLS 1.3 in transit |
| Data deletion supported?            | Yes — Settings → Delete Account                                                   |

### Microsoft Verification Checklist

Complete this checklist before every Microsoft Store submission:

- [ ] **MSIX package passes WACK:** Run the Windows App Certification Kit on the release MSIX. All tests must pass.
- [ ] **Privacy policy URL:** Confirm the URL in Partner Center points to the current, published privacy policy.
- [ ] **DPAPI usage:** Verify credentials are stored via DPAPI (Windows Data Protection API), not in plaintext config files.
- [ ] **Windows Hello integration:** Confirm biometric lock is functional and consent-gated.
- [ ] **Crash reporting:** If Sentry or equivalent is enabled for Windows, declare in the privacy policy and store listing.
- [ ] **Consent defaults:** Verify GdprConsentViewModel defaults crash reporting to off. Confirm telemetry only activates after user opt-in.
- [ ] **Third-party dependencies:** Review uild.gradle.kts for the Windows desktop target. New runtime dependencies that collect data must be disclosed.
- [ ] **Cross-reference:** Compare this document's Microsoft section against the Partner Center form.

---

## Web Privacy Manifest

> **Reference:** The web platform has no centralized "store" privacy form, but privacy
> compliance requires disclosures in the privacy policy, cookie/storage banner, and any
> applicable privacy manifest (e.g., Apple's web-based App Privacy manifest for Safari
> Web Extensions).
>
> **Existing audit:** [docs/compliance/web-storage-audit.md](web-storage-audit.md)

### Web Data Collection Summary

| Data Category  | Specific Data                          | Storage Mechanism      | Encrypted at Rest?     | Notes                               |
| -------------- | -------------------------------------- | ---------------------- | ---------------------- | ----------------------------------- |
| Contact Info   | Email, display name                    | OPFS (SQLite-WASM)     | **No** (see gap below) | Same-origin policy + OS FDE only    |
| Financial Info | Transactions, accounts, budgets, goals | OPFS (SQLite-WASM)     | **No** (see gap below) | Same-origin policy + OS FDE only    |
| Auth Tokens    | Refresh token                          | HttpOnly Secure cookie | N/A (opaque token)     | Set by Supabase Auth backend        |
| Auth Tokens    | Access token                           | In-memory only         | N/A                    | Not persisted to storage            |
| Preferences    | Theme, currency, notification prefs    | localStorage           | No                     | Non-sensitive preference data       |
| Sync Metadata  | Mutation queue                         | IndexedDB              | No                     | May contain payee names and amounts |
| Diagnostics    | Crash data (Sentry)                    | Sentry (if enabled)    | In transit: TLS        | Currently disabled pending consent  |

> **⚠️ Known gap:** Web OPFS and IndexedDB store financial data **unencrypted** at the
> application layer. This is documented as a CRITICAL gap in
> [privacy-compliance-review.md](privacy-compliance-review.md) (gap #5). Until Web
> Crypto API encryption is implemented, the web privacy disclosures must note reliance on
> browser same-origin policy and OS full-disk encryption.

### Web Verification Checklist

Complete this checklist before every web deployment:

- [ ] **Privacy policy link:** Confirm the privacy policy is linked from the landing page, onboarding flow, and in-app settings.
- [ ] **Cookie/storage banner:** If a consent banner is implemented, verify it appears on first visit and defaults optional storage to off.
- [ ] **Sentry status:** Is Sentry initialization active in the production build? If yes → disclose crash data collection in the privacy policy. If no → confirm initialization is commented out.
- [ ] **Service worker cache audit:** Verify service worker does not cache API responses containing PII or financial data without encryption. (See [web-storage-audit.md](web-storage-audit.md).)
- [ ] **CSP headers:** Confirm Content Security Policy does not allow connections to undisclosed third-party domains.
- [ ] **CORS configuration:** Verify cors.ts uses an allowlist (never wildcard \* on authenticated routes).
- [ ] **Third-party scripts:** Audit index.html and dynamically loaded scripts. Any third-party script that collects data must be disclosed.
- [ ] **Cross-reference:** Compare this section against the published privacy policy for completeness.

---

## Cross-Platform Data Collection Audit

This section documents findings from the codebase audit, comparing **actual collection
behavior** against the declarations above.

### Audit Methodology

1. **Codebase search:** grep for nalytics, elemetry, sentry, crash, metrics,
   consent, racking across pps/, packages/, services/.
2. **Dependency review:** Inspect package.json, uild.gradle.kts, Podfile/SPM for
   analytics and advertising SDKs.
3. **Data flow tracing:** Follow data from UI input → local storage → sync → server.
4. **Cross-reference:** Compare codebase findings against docs/compliance/data-inventory.md.

### Findings (as of 2026-05-19)

#### Confirmed — Declarations Match Code

| Finding                                             | Platform              | Evidence                                                                                |
| --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| Telemetry defaults to **off** on Android            | Android               | AppModule.kt: consentProvider = { false } for both CrashReporter and MetricsCollector   |
| Web Sentry is **disabled** (commented out)          | Web                   | pps/web/src/lib/monitoring.ts: Sentry init is commented out with TODO for consent check |
| Shared monitoring contracts are **consent-gated**   | All (KMP)             | CrashReporter.kt and MetricsCollector.kt require consent before any data collection     |
| No advertising SDKs in any platform                 | All                   | No ad framework dependencies found in any build file                                    |
| No cross-app tracking identifiers used              | All                   | No IDFA/GAID collection; device ID is rotatable and non-hardware                        |
| GDPR consent UI exists on Android, iOS, and Windows | Android, iOS, Windows | ConsentDialog.kt, ConsentView.swift, GdprConsentDialog.kt with per-purpose toggles      |
| Backend logging excludes PII                        | Backend               | logger.ts explicitly forbids logging tokens, passwords, emails, financial amounts       |
| CORS is allowlist-based                             | Backend               | cors.ts uses ALLOWED_ORIGINS env var; never wildcard \*                                 |

#### Discrepancies Requiring Attention

| #                                                                                                                                         | Discrepancy                                                                                                                                                                                                                            | Severity                                  | Affected Declarations                                        | Remediation                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1                                                                                                                                         | **Android consent stored in plain SharedPreferences** — ConsentManager.kt uses unencrypted SharedPreferences, not EncryptedSharedPreferences. Consent state itself is not PII, but storing it alongside other prefs risks co-mingling. | MEDIUM                                    | Google Play Data Safety (security practices)                 | Migrate to EncryptedSharedPreferences or DataStore                                                      |
| 2                                                                                                                                         | **Web financial data unencrypted in OPFS/IndexedDB** — OPFS SQLite-WASM database is not encrypted at the application layer. Declarations claim encryption at rest, but web relies solely on browser same-origin and OS FDE.            | CRITICAL                                  | All store declarations mentioning "encryption at rest"       | Implement Web Crypto API encryption for OPFS database, or add explicit caveat to all store declarations |
| 3                                                                                                                                         | \*\*Audit log old_values/                                                                                                                                                                                                              |
| ew_values may contain PII\*\* — JSONB columns in udit_log can store email, display name, payee, amounts. No retention bound or scrubbing. | HIGH                                                                                                                                                                                                                                   | Data inventory completeness               | Implement JSONB scrubbing or bounded retention for audit log |
| 4                                                                                                                                         | **IP address collected in audit/export logs** — data_export_audit_log and udit_log store ip_address. This should be declared as a collected data type in store disclosures if not already.                                             | MEDIUM                                    | Apple (Identifiers), Google Play (Device or other IDs)       | Verify IP address is disclosed in privacy labels; consider hashing or truncating                        |
| 5                                                                                                                                         | \*\*uth-webhook logs                                                                                                                                                                                                                   |
| ecord.id via console.log\*\* — One direct log path in the auth webhook emits a user record ID.                                            | LOW                                                                                                                                                                                                                                    | No store impact; internal logging hygiene | Replace with structured logger                               |

---

## Material Change Triggers

The following categories of code changes **must trigger a privacy label re-review**
before the next app store submission. Add a privacy-review-needed label to any PR
that touches these areas.

### Trigger 1: New Data Collection

Any PR that introduces collection of a **new category of user data** not currently
listed in the [Data Collection Summary](#data-collection-summary).

**Examples:**

- Adding location services (even approximate)
- Adding photo/camera access (e.g., receipt scanning)
- Adding contacts access (e.g., bill splitting)
- Adding purchase/payment processing (e.g., in-app purchases)
- Collecting device hardware identifiers (IDFA, GAID, MAC address)

**Action:** Update this document, update all store declarations, file privacy label
update with each store before submission.

### Trigger 2: New Third-Party SDK

Any PR that adds a **new runtime dependency** that collects, transmits, or processes
user data — even passively.

**Examples:**

- Adding Sentry, Firebase Analytics, Mixpanel, Amplitude, or any analytics SDK
- Adding a social login provider (Facebook, Google Sign-In beyond current Supabase Auth)
- Adding a payment processor SDK (Stripe, RevenueCat)
- Adding an advertising or attribution SDK

**Action:** Review the SDK's own privacy disclosures. Update this document and all
store declarations to reflect the SDK's data collection.

### Trigger 3: Change in Data Sharing

Any PR that causes user data to be **transmitted to a new external party** or changes
sharing behavior with an existing party.

**Examples:**

- Enabling Sentry crash reporting (currently disabled)
- Adding server-side analytics that sends data to a third-party service
- Integrating a cloud AI/ML service that processes user data
- Adding email notification services that receive user data

**Action:** Update "Data Shared" sections for all stores. Google Play and Apple both
require explicit sharing declarations.

### Trigger 4: Change in Data Purpose

Any PR that uses existing collected data for a **new purpose** not currently declared.

**Examples:**

- Using transaction data for AI-powered spending predictions
- Using email addresses for marketing communications
- Using usage analytics for A/B testing feature rollouts
- Using financial data for benchmarking or aggregated insights

**Action:** Update purpose declarations. Apple requires purpose disclosure per data type.

### Trigger 5: Change in Data Retention or Deletion

Any PR that **extends retention periods**, removes deletion capabilities, or changes
the data lifecycle.

**Examples:**

- Changing soft-delete to permanent retention
- Extending audit log retention beyond documented periods
- Removing or disabling the account deletion flow
- Adding data archival that preserves data beyond the documented retention schedule

**Action:** Update retention disclosures in privacy policy and store declarations.

### Trigger 6: Change in Encryption or Security Posture

Any PR that **weakens encryption** or changes security guarantees that are declared in
store privacy disclosures.

**Examples:**

- Removing SQLCipher encryption from any platform
- Downgrading TLS requirements
- Storing credentials outside platform secure storage
- Adding an unencrypted data export path

**Action:** Update security practice declarations for all stores.

---

## Data Collection Audit Process

### When to Audit

1. **Every release:** Quick verification using the per-platform checklists above.
2. **Quarterly:** Full codebase audit using the methodology in
   [Cross-Platform Data Collection Audit](#cross-platform-data-collection-audit).
3. **On material change:** Any PR matching a [Material Change Trigger](#material-change-triggers)
   requires a focused audit of the affected data type.

### Audit Steps

1. **Dependency inventory:**
   - Run ./gradlew :apps:android:dependencies --configuration releaseRuntimeClasspath
   - Run
     pm ls --production in pps/web/
   - Inspect Xcode's linked frameworks for pps/ios/
   - Check uild.gradle.kts for pps/windows/

2. **Codebase search for data collection patterns:**
   `ash

   # Search for analytics, telemetry, and tracking code

   git grep -rn "analytics\|telemetry\|sentry\|crash.*report\|metrics.*collect\|tracking\|IDFA\|GAID\|advertisingIdentifier" -- apps/ packages/ services/
   `

3. **Data flow verification:**
   - Trace each data type from user input → local storage → sync → server → (any third party?)
   - Verify each data type is listed in docs/compliance/data-inventory.md
   - Confirm encryption status matches declarations

4. **SDK privacy review:**
   - For each third-party SDK, check the vendor's published privacy practices
   - Verify the SDK's data collection is reflected in store declarations

5. **Store declaration comparison:**
   - Open each store's privacy form (App Store Connect, Play Console, Partner Center)
   - Compare field-by-field against this document
   - Document any discrepancies in the [Discrepancy Log](#discrepancy-log)

6. **Sign-off:**
   - Record the auditor, date, and result in the table below

### Audit History

| Date       | Auditor                | Scope               | Result          | Notes                                                |
| ---------- | ---------------------- | ------------------- | --------------- | ---------------------------------------------------- |
| 2026-05-19 | Security Reviewer (AI) | Full codebase audit | Initial mapping | See [Discrepancy Log](#discrepancy-log) for findings |

---

## Discrepancy Log

Track all discrepancies between actual behavior and store declarations here.
Each entry should be resolved before the next app store submission.

| #   | Date Found | Discrepancy                                                           | Store(s) Affected | Severity | Status | Resolution                                                         |
| --- | ---------- | --------------------------------------------------------------------- | ----------------- | -------- | ------ | ------------------------------------------------------------------ |
| 1   | 2026-05-19 | Web OPFS data unencrypted — declarations claim encryption at rest     | All               | CRITICAL | Open   | Implement Web Crypto encryption or update declarations with caveat |
| 2   | 2026-05-19 | Audit log JSONB may contain PII — not reflected in privacy labels     | All               | HIGH     | Open   | Implement JSONB scrubbing or retention policy                      |
| 3   | 2026-05-19 | IP address in audit/export logs not explicitly declared in all stores | Apple, Google     | MEDIUM   | Open   | Verify IP address disclosure in all store forms                    |
| 4   | 2026-05-19 | Android consent state in plain SharedPreferences                      | Google            | MEDIUM   | Open   | Migrate to EncryptedSharedPreferences                              |

---

## References

- [Data Inventory (GDPR Article 30)](data-inventory.md) — Field-level data mapping
- [Privacy Compliance Review](privacy-compliance-review.md) — GDPR/CCPA gap analysis
- [Data Minimization Audit](data-minimization-audit.md) — Field necessity review
- [Consent Management Audit](consent-management-audit.md) — Consent posture assessment
- [Web Storage Audit](web-storage-audit.md) — Browser storage mechanism inventory
- [Data Retention Schedule](data-retention-schedule.md) — Retention periods by data type
- [Apple Privacy Labels Draft](../legal/privacy-labels-apple.md) — Apple draft (internal)
- [Google Data Safety Draft](../legal/data-safety-google-play.md) — Google draft (internal)
- [Android Data Safety Declaration](../android/data-safety-declaration.md) — Android reference
- [Privacy Policy](../legal/privacy-policy.md) — Published privacy policy
- [Release Process](../guides/release-process.md) — Release workflow with privacy gate
- [Launch Checklist](../guides/launch-checklist.md) — Pre-launch verification
