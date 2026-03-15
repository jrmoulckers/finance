# App Store Submission Guide — Finance

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-22
> **Purpose:** Ready-to-use metadata, checklists, and step-by-step instructions for submitting Finance to every distribution channel
> **Related:** [App Store Preparation](app-store-preparation.md) · [Launch Checklist](launch-checklist.md) · [Release Process](release-process.md) · [Beta Testing](beta-testing.md)

---

## Table of Contents

- [Overview](#overview)
- [App Metadata (Shared)](#app-metadata-shared)
- [iOS — Apple App Store](#ios--apple-app-store)
- [Android — Google Play Store](#android--google-play-store)
- [Windows — Microsoft Store](#windows--microsoft-store)
- [Web — Progressive Web App (PWA)](#web--progressive-web-app-pwa)
- [Pre-Submission Checklist](#pre-submission-checklist)
- [Post-Submission Runbook](#post-submission-runbook)
- [References](#references)

---

## Overview

This document contains the **final submission metadata and checklists** for publishing Finance to all four distribution channels. It is designed to be used on submission day — every field value, character count, and asset requirement is specified so that submissions are predictable and error-free.

For background on developer account setup, build requirements, and review guidelines, see the [App Store Preparation Guide](app-store-preparation.md).

### Distribution Summary

| Channel         | Format | Developer Account       | Fee              |
| --------------- | ------ | ----------------------- | ---------------- |
| Apple App Store | IPA    | Apple Developer Program | $99 USD/year     |
| Google Play     | AAB    | Google Play Console     | $25 USD one-time |
| Microsoft Store | MSIX   | Partner Center          | $19 USD one-time |
| Web (PWA)       | Hosted | N/A                     | Hosting costs    |

---

## App Metadata (Shared)

These values are shared across all stores. Platform-specific adjustments are noted in each store's section.

### App Identity

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| App name       | **Finance**                                   |
| Bundle ID      | `com.finance.app`                             |
| Category       | Finance / Personal Finance                    |
| Content rating | Everyone / PEGI 3 (no objectionable content)  |
| Pricing        | Free (with in-app purchases for premium tier) |
| Default locale | English (US)                                  |

### Short Description

> 30 characters · Used as App Store subtitle, Play Store short description

```
Private financial tracking
```

Character count: 26 ✅

### Full Description

> Max 4,000 characters · Adapt per-store as needed

```
Take control of your money — privately, on every device.

Finance is a personal finance tracker built for clarity, privacy, and speed. Track accounts, transactions, budgets, and goals across iOS, Android, Windows, and the web — all from a single, beautifully native app on each platform.

YOUR DATA STAYS YOURS
Finance is offline-first. Your financial data is encrypted at rest with SQLCipher (AES-256) and never leaves your device unless you choose to sync. No bank connections required. No third-party data sharing. Signal-level privacy for your finances.

30 SECONDS OR LESS
Add transactions in 3 taps. Widgets show your remaining budget at a glance. Quick-check "Can I Afford This?" from your home screen. Finance is designed around a daily habit that takes less than 30 seconds.

WORKS WITH YOUR BRAIN
Choose your expertise level — Getting Started, Comfortable, or Advanced — and the entire app adapts. Terminology, visible features, chart complexity, and notifications all adjust to your comfort level. Contextual education explains every financial concept with a single tap.

FEATURES
• Account management — Checking, savings, credit cards, cash, investments, loans
• Transaction tracking — Quick entry, recurring transactions, multi-currency support
• Envelope budgeting — Give every dollar a job with flexible spending plans
• Goal tracking — Set savings goals with visual progress and milestone celebrations
• Reports & analytics — Spending trends, category breakdowns, monthly comparisons
• Multi-device sync — Optional encrypted cloud sync across all your devices
• Partner & family sharing — Shared budgets with role-based access (Premium)
• Data export — Export all your data in CSV or JSON at any time

DESIGNED FOR EVERYONE
Finance meets WCAG 2.2 AA accessibility standards. Screen reader support (VoiceOver, TalkBack, Narrator, NVDA), dynamic text sizing, high contrast mode, reduced motion support, and cognitive accessibility (ADHD-friendly design) are built in — not bolted on.

FACTS, NOT JUDGMENTS
Finance observes and informs — it never shames. Over budget? The app offers to help you adjust, not scold. Missed a day of logging? "Welcome back! Pick up where you left off."

FREE FOREVER (CORE)
All core financial tracking features are free, forever. Premium unlocks AI-powered insights, multi-device sync, and household sharing.

Privacy policy: {{PRIVACY_POLICY_URL}}
Terms of service: {{TERMS_OF_SERVICE_URL}}
```

Character count: ~1,900 ✅ (well within 4,000 limit)

### Keywords / Tags

> iOS: max 100 characters, comma-separated · Play Store: up to 5 tags · Microsoft: up to 7 keywords

| Platform  | Value                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- |
| iOS       | `budget,expense,tracker,money,finance,savings,offline,privacy,spending,goals`                |
| Android   | `budgeting`, `expense tracker`, `personal finance`, `offline`, `privacy`                     |
| Microsoft | `budgeting`, `expense tracker`, `personal finance`, `offline`, `privacy`, `money`, `savings` |

iOS keyword character count: 74 ✅ (under 100)

### Contact Information

| Field              | Value                      | Notes                                              |
| ------------------ | -------------------------- | -------------------------------------------------- |
| Contact email      | `{{SUPPORT_EMAIL}}`        | Must be monitored — app stores forward user issues |
| Support URL        | `{{SUPPORT_URL}}`          | Linked from store listings and in-app Settings     |
| Privacy policy URL | `{{PRIVACY_POLICY_URL}}`   | Must be publicly accessible (no auth wall)         |
| Terms of service   | `{{TERMS_OF_SERVICE_URL}}` | Required by Apple; recommended for all stores      |
| Marketing website  | `{{WEBSITE_URL}}`          | Landing page with download links                   |

> **⚠️ Action required:** Replace all `{{PLACEHOLDER}}` values with real URLs before submission. Privacy policy and terms of service must be live and accessible at the time of submission.

### App Icon

| Platform  | Size          | Format               | Notes                                           |
| --------- | ------------- | -------------------- | ----------------------------------------------- |
| iOS       | 1024 × 1024   | PNG, no transparency | Single icon; system applies masks               |
| Android   | 512 × 512     | PNG, 32-bit          | Adaptive icon with foreground/background layers |
| Microsoft | 300 × 300 min | PNG                  | Recommended 512 × 512                           |
| Web (PWA) | 512 × 512     | PNG                  | Also provide 192 × 192 for manifest             |

Source icon: generate from design tokens / brand assets pipeline.

---

## iOS — Apple App Store

### TestFlight Setup Checklist

Complete these steps before the first public submission. TestFlight beta testing validates the build and review process.

- [ ] Apple Developer Program enrollment complete ($99/year)
- [ ] App registered in [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Bundle ID `com.finance.app` registered in Certificates, Identifiers & Profiles
- [ ] Signing certificates (Development + Distribution) generated
- [ ] Provisioning profiles (Development + App Store) created
- [ ] Fastlane `deliver` configured in `apps/ios/fastlane/`
- [ ] First build uploaded to App Store Connect (via Xcode or Fastlane)
- [ ] Build processed by Apple (15–30 min)
- [ ] Internal testers added (up to 100, immediate access)
- [ ] External beta group created with beta description and "What to Test" notes
- [ ] External build submitted for TestFlight review (lightweight, usually < 24 hours)
- [ ] At least 10 external testers invited and active for ≥ 2 weeks
- [ ] Critical beta feedback triaged and resolved

### App Store Listing Fields

| Field              | Limit                | Value                                                                                           |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| App name           | 30 chars             | `Finance`                                                                                       |
| Subtitle           | 30 chars             | `Private financial tracking`                                                                    |
| Promotional text   | 170 chars, no review | `Track every dollar privately. Offline-first budgeting for individuals, couples, and families.` |
| Description        | 4,000 chars          | See [Full Description](#full-description)                                                       |
| Keywords           | 100 chars            | See [Keywords / Tags](#keywords--tags)                                                          |
| Primary category   | —                    | Finance                                                                                         |
| Secondary category | —                    | Productivity                                                                                    |
| Bundle ID          | —                    | `com.finance.app`                                                                               |
| SKU                | —                    | `finance-ios-001`                                                                               |
| Support URL        | Required             | `{{SUPPORT_URL}}`                                                                               |
| Marketing URL      | Optional             | `{{WEBSITE_URL}}`                                                                               |
| Privacy policy URL | Required             | `{{PRIVACY_POLICY_URL}}`                                                                        |
| Copyright          | —                    | `© {{YEAR}} Finance`                                                                            |
| Version            | Semver               | Current release version from Changesets                                                         |

### Privacy Nutrition Labels

Apple requires disclosure of all data collection via privacy "nutrition labels" in App Store Connect. This must accurately reflect what the app and any third-party SDKs collect.

#### Data Types Collected

| Data Type                | Collected         | Linked to Identity | Used for Tracking |
| ------------------------ | ----------------- | ------------------ | ----------------- |
| Email address            | ✅                | ✅                 | ❌                |
| Name                     | ❌                | —                  | —                 |
| Financial info           | ✅                | ✅                 | ❌                |
| Usage data               | ✅ (with consent) | ❌                 | ❌                |
| Diagnostics (crash data) | ✅ (with consent) | ❌                 | ❌                |
| Identifiers              | ❌                | —                  | —                 |
| Location                 | ❌                | —                  | —                 |
| Contacts                 | ❌                | —                  | —                 |
| Health & Fitness         | ❌                | —                  | —                 |

#### Data Use Purposes

| Data Type      | Purpose                                        |
| -------------- | ---------------------------------------------- |
| Email address  | App Functionality (authentication, recovery)   |
| Financial info | App Functionality (core feature)               |
| Usage data     | Analytics (opt-in only, PII-free)              |
| Diagnostics    | App Functionality (crash reporting, stability) |

#### Key Declarations

- **"Data Not Used to Track You"** — Finance does NOT track users across other apps or websites
- **"Data Not Sold"** — Finance does NOT sell any user data
- **App Tracking Transparency (ATT):** Not required — Finance does not track. No ATT prompt needed

> **⚠️ Important:** If you integrate any third-party SDKs (analytics, crash reporting), their data collection must also be declared in the nutrition labels.

### Screenshot Requirements

Apple requires screenshots for **each device size** supported. Missing sizes means the app won't appear on those devices.

| Device                | Screen Size | Dimensions (px)    | Required              |
| --------------------- | ----------- | ------------------ | --------------------- |
| iPhone 16 Pro Max     | 6.9"        | 1320 × 2868        | ✅ Required           |
| iPhone 16 Pro         | 6.3"        | 1206 × 2622        | Recommended           |
| iPhone SE (3rd gen)   | 4.7"        | 750 × 1334         | ✅ If supporting SE   |
| iPad Pro 13" (M4)     | 13"         | 2064 × 2752        | ✅ If supporting iPad |
| iPad Pro 11" (M4)     | 11"         | 1668 × 2420        | Falls back to 13"     |
| Apple Watch Series 10 | 46mm        | 416 × 496          | If watchOS app        |
| Mac (Apple Silicon)   | —           | 1280 × 800 minimum | If Mac Catalyst       |

**Per device size:** 2–10 screenshots. Recommended: 5 screens in this order:

1. **Dashboard** — "See your finances at a glance"
2. **Quick Entry** — "Add transactions in 3 taps"
3. **Budget** — "Give every dollar a job"
4. **Reports** — "Understand your spending trends"
5. **Goals** — "Track progress toward what matters"

**Format:** PNG or JPEG, no alpha channel, portrait orientation preferred, consistent across sets.

**Automation:** Fastlane `snapshot` or Xcode UI tests. Store generated screenshots in `apps/ios/Screenshots/`.

### App Review Notes

Provide these notes in the "App Review Information" section of App Store Connect so the reviewer can test the app effectively.

```
DEMO ACCOUNT
Email: {{REVIEW_ACCOUNT_EMAIL}}
Password: {{REVIEW_ACCOUNT_PASSWORD}}

NOTES FOR REVIEWER
- Finance works fully offline. No internet connection is required for core features
  (accounts, transactions, budgets, goals, reports).
- Cloud sync is an optional feature that requires sign-in. The demo account above
  has sync enabled with sample data.
- The app uses a freemium model. Premium features (AI insights, multi-device sync,
  household sharing) require an in-app subscription. A sandbox test account is
  configured for IAP testing.
- Biometric authentication (Face ID / Touch ID) is optional and can be enabled in
  Settings > Security.
- The app uses SQLCipher (AES-256) for local database encryption. This is
  declarable under export compliance as mass-market encryption (ECCN 5D992).

EXPORT COMPLIANCE
The app uses encryption: Yes
- SQLCipher (AES-256-CBC) for local database encryption
- TLS 1.3 for network communication
- Exempt under mass-market encryption exemption (ECCN 5D992)
```

> **⚠️ Action required:** Create a dedicated App Review test account with sample data before submission. Replace `{{REVIEW_ACCOUNT_EMAIL}}` and `{{REVIEW_ACCOUNT_PASSWORD}}` with real credentials.

### Age Rating Questionnaire

| Question                            | Answer |
| ----------------------------------- | ------ |
| Made for Kids                       | No     |
| Violence (cartoon, realistic, etc.) | None   |
| Sexual content or nudity            | None   |
| Profanity or crude humor            | None   |
| Alcohol, tobacco, or drugs          | None   |
| Medical/treatment information       | None   |
| Gambling or contests                | None   |
| Horror or fear themes               | None   |
| Unrestricted web access             | No     |

**Expected rating:** 4+ (appropriate for all ages).

---

## Android — Google Play Store

### Internal Testing Track Setup Checklist

- [ ] Google Play Console account registered ($25 one-time fee)
- [ ] App created in Play Console with package name `com.finance.app`
- [ ] App signing enrolled (Google Play App Signing — recommended)
- [ ] Upload key generated and stored securely
- [ ] First AAB uploaded to **Internal testing** track
- [ ] Internal testers email list created (`core-team` group)
- [ ] Opt-in link shared with internal testers
- [ ] Internal testing validated (install, launch, core flows)
- [ ] Promoted to **Closed testing** with `alpha-circle` tester group
- [ ] 20+ testers active for 14 consecutive days (Google Play production requirement)
- [ ] Critical feedback triaged and resolved
- [ ] Promoted to **Production** with staged rollout (5% → 20% → 50% → 100%)

### Store Listing Fields

| Field              | Limit       | Value                                                                       |
| ------------------ | ----------- | --------------------------------------------------------------------------- |
| App name           | 30 chars    | `Finance`                                                                   |
| Short description  | 80 chars    | `Track your money privately. Offline-first budgeting and expense tracking.` |
| Full description   | 4,000 chars | See [Full Description](#full-description)                                   |
| App icon           | 512 × 512   | PNG, 32-bit, no transparency                                                |
| Feature graphic    | 1024 × 500  | PNG or JPEG — hero image for store listing                                  |
| App category       | —           | Finance                                                                     |
| Tags               | Up to 5     | See [Keywords / Tags](#keywords--tags)                                      |
| Contact email      | Required    | `{{SUPPORT_EMAIL}}`                                                         |
| Contact phone      | Optional    | —                                                                           |
| Contact website    | Optional    | `{{WEBSITE_URL}}`                                                           |
| Privacy policy URL | Required    | `{{PRIVACY_POLICY_URL}}`                                                    |

Short description character count: 73 ✅ (under 80)

### Data Safety Section

Google Play's Data Safety form maps to the app's actual data practices. See the [Privacy Audit](../audits/security-checklist.md) for the full data inventory.

#### Data Types Declaration

| Data Type                               | Collected         | Shared | Purpose                         | Optional        |
| --------------------------------------- | ----------------- | ------ | ------------------------------- | --------------- |
| Email address                           | ✅                | ❌     | Account authentication          | Yes (sync only) |
| Financial info (transactions, balances) | ✅                | ❌     | App functionality               | No              |
| App activity (screens viewed)           | ✅ (with consent) | ❌     | Analytics — funnel optimization | Yes             |
| Crash logs                              | ✅ (with consent) | ❌     | Stability monitoring            | Yes             |
| Device identifiers                      | ❌                | ❌     | Not collected                   | —               |
| Location                                | ❌                | ❌     | Not collected                   | —               |

#### Key Data Safety Declarations

| Declaration                       | Value                                        |
| --------------------------------- | -------------------------------------------- |
| Data encrypted in transit         | ✅ Yes (TLS 1.3)                             |
| Data encrypted at rest            | ✅ Yes (SQLCipher AES-256)                   |
| Users can request data deletion   | ✅ Yes (Settings > Account > Delete Account) |
| Data not sold to third parties    | ✅ Confirmed                                 |
| Committed to Play Families policy | N/A — app is not targeted at children        |
| Independent security review       | TBD — recommended post-launch                |

### Screenshot Requirements

Provide **2–8 screenshots** per device type. All screenshots must reflect actual in-app UI.

| Device Type | Dimensions (px)         | Required           |
| ----------- | ----------------------- | ------------------ |
| Phone       | 1080 × 1920 (16:9)      | ✅ Yes (minimum 2) |
| 7" Tablet   | 1200 × 1920             | Recommended        |
| 10" Tablet  | 1600 × 2560             | Recommended        |
| Chromebook  | 1920 × 1080 (landscape) | Optional           |

**Format:** PNG or JPEG, no alpha/transparency, max 8 MB each.

**Feature graphic:** 1024 × 500 px, PNG or JPEG. This hero image appears at the top of the store listing and in search results. Design with the app name and a clear visual — avoid text-heavy designs (they scale poorly on small screens).

**Automation:** Fastlane `screengrab` or Compose Screenshot Testing. Store in `apps/android/screenshots/`.

### Content Rating (IARC Questionnaire)

Google Play uses the **IARC (International Age Rating Coalition)** system. Answer the questionnaire in Play Console under **Policy > App content > Content rating**.

| Question Area                   | Answer                                            |
| ------------------------------- | ------------------------------------------------- |
| Violence                        | None                                              |
| Sexual content                  | None                                              |
| Language                        | None                                              |
| Controlled substances           | None                                              |
| User-generated content          | No (V1) — revisit if household comments are added |
| Personal information collection | Yes — financial data, email (for sync)            |
| Location data                   | No                                                |
| Ads                             | No                                                |
| In-app purchases                | Yes (freemium model)                              |

**Expected rating:** PEGI 3 / Everyone (ESRB). Finance apps with no objectionable content receive the lowest age rating.

### Android-Specific Build Requirements

| Requirement        | Detail                                            |
| ------------------ | ------------------------------------------------- |
| Target API level   | Latest stable (currently API 35 / Android 15)     |
| App bundle format  | AAB required (not APK) for Play Store             |
| App signing        | Enroll in Google Play App Signing                 |
| 64-bit support     | Required for all native code                      |
| Deobfuscation file | Upload ProGuard/R8 mapping file for crash reports |

---

## Windows — Microsoft Store

### MSIX Package Signing Checklist

For step-by-step MSIX packaging, see the [Windows Store Guide](windows-store.md).

- [ ] Partner Center account registered ($19 individual / $99 company)
- [ ] App name **Finance** reserved in Partner Center
- [ ] Package Identity Name and Publisher Identity copied into `AppxManifest.xml`
- [ ] Code-signing certificate obtained (Partner Center or trusted CA)
- [ ] Application built: `node tools/gradle.js :apps:windows:build`
- [ ] MSIX package created (via MSIX Packaging Tool or `makeappx.exe`)
- [ ] MSIX signed with `signtool.exe` using the code-signing certificate
- [ ] Package passes [Windows App Certification Kit (WACK)](https://learn.microsoft.com/windows/uwp/debug-test-perf/windows-app-certification-kit) tests
  - [ ] Security test (no malware, valid signing)
  - [ ] Technical compliance (proper MSIX structure, capability declarations)
  - [ ] Performance test (reasonable launch time, no hangs)
  - [ ] Accessibility test (basic Narrator compatibility)
- [ ] Package uploaded to Partner Center
- [ ] Submission passes Microsoft certification review

### Store Listing Fields

| Field              | Limit         | Value                                                                          |
| ------------------ | ------------- | ------------------------------------------------------------------------------ |
| App name           | 256 chars     | `Finance`                                                                      |
| Short description  | 1,000 chars   | See [Full Description](#full-description) (first two paragraphs)               |
| Full description   | 10,000 chars  | See [Full Description](#full-description) — expand with desktop-specific notes |
| App icon           | 300 × 300 min | PNG (recommended 512 × 512)                                                    |
| Category           | —             | Personal Finance                                                               |
| Support contact    | Required      | `{{SUPPORT_EMAIL}}`                                                            |
| Privacy policy URL | Required      | `{{PRIVACY_POLICY_URL}}`                                                       |
| Website            | Optional      | `{{WEBSITE_URL}}`                                                              |
| Keywords           | Up to 7       | See [Keywords / Tags](#keywords--tags)                                         |

### Privacy Statement Requirements

Microsoft requires a privacy policy that meets these criteria:

- [ ] Hosted at a publicly accessible URL (not behind authentication)
- [ ] Discloses all data types collected and their purposes
- [ ] Describes how data is stored (local SQLCipher encryption, optional cloud sync)
- [ ] Covers data retention and deletion policies
- [ ] Includes contact information for privacy inquiries
- [ ] Accessible from within the app (Settings > Privacy)
- [ ] URL provided in Partner Center and in-app

### Screenshot Requirements

| Type        | Dimensions (px)                     | Count         |
| ----------- | ----------------------------------- | ------------- |
| Desktop     | 1366 × 768 minimum, 3840 × 2160 max | 1–10 required |
| Recommended | 1920 × 1080 (Full HD)               | Best practice |

**Desktop screenshots should show:**

1. Dashboard with sidebar navigation visible
2. Multi-panel transaction view
3. Budget overview with keyboard shortcuts visible
4. Reports with full-width charts
5. Settings / preferences panel

**Format:** PNG, landscape orientation, showing the app in a typical desktop window.

Store screenshots in `apps/windows/screenshots/desktop/`.

### Age Rating

Microsoft Store uses the same **IARC** questionnaire as Google Play. Answers are identical — see [Content Rating (IARC Questionnaire)](#content-rating-iarc-questionnaire). Expected rating: PEGI 3 / Everyone.

### Windows-Specific Compliance

| Requirement        | Detail                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Accessibility      | Windows Narrator, High Contrast, keyboard-only navigation supported |
| System integration | Respects system theme (light/dark), DPI scaling, Snap Layouts       |
| Offline capability | Core financial features work without network                        |
| Clean uninstall    | No residual files outside `%LOCALAPPDATA%`                          |
| Capabilities       | Declared in manifest: `internetClient`, `localStorage`              |
| Min OS version     | Windows 10 version 1809 (build 17763)                               |
| Architecture       | x64 required, ARM64 recommended                                     |

---

## Web — Progressive Web App (PWA)

### manifest.json Verification Checklist

The web app manifest controls PWA installability and appearance. Verify all fields before launch.

- [ ] `manifest.json` exists at `apps/web/public/manifest.json`
- [ ] `<link rel="manifest" href="/manifest.json">` present in `index.html`
- [ ] `name` field set: `"Finance"`
- [ ] `short_name` field set: `"Finance"`
- [ ] `description` field set with value prop
- [ ] `start_url` set to `/` or `/dashboard`
- [ ] `display` set to `"standalone"`
- [ ] `background_color` set (matches app background)
- [ ] `theme_color` set (matches brand primary color)
- [ ] `orientation` set to `"any"`
- [ ] `categories` includes `["finance", "productivity"]`
- [ ] Icons provided:
  - [ ] 192 × 192 PNG with `purpose: "any maskable"`
  - [ ] 512 × 512 PNG with `purpose: "any maskable"`
- [ ] Screenshots provided (at least one `wide` and one `narrow` form factor)
- [ ] Service worker registered with `fetch` event handler
- [ ] Offline fallback page configured
- [ ] Chrome DevTools > Application > Manifest shows no errors
- [ ] [PWA Builder](https://www.pwabuilder.com/) validation passes
- [ ] Lighthouse PWA audit passes (✅ Installable)

**Reference manifest:** See [App Store Preparation](app-store-preparation.md#manifest-validation) for the full `manifest.json` template.

### Open Graph Meta Tags

Add these tags to `apps/web/index.html` `<head>` for rich link previews when the app URL is shared on social media, messaging apps, and search results.

```html
<!-- Primary Meta Tags -->
<meta name="title" content="Finance — Private Financial Tracking" />
<meta
  name="description"
  content="Track your money privately. Offline-first budgeting and expense tracking across all your devices."
/>

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="{{APP_URL}}" />
<meta property="og:title" content="Finance — Private Financial Tracking" />
<meta
  property="og:description"
  content="Track your money privately. Offline-first budgeting and expense tracking across all your devices."
/>
<meta property="og:image" content="{{APP_URL}}/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta
  property="og:image:alt"
  content="Finance app dashboard showing budget overview and recent transactions"
/>

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:url" content="{{APP_URL}}" />
<meta property="twitter:title" content="Finance — Private Financial Tracking" />
<meta
  property="twitter:description"
  content="Track your money privately. Offline-first budgeting and expense tracking across all your devices."
/>
<meta property="twitter:image" content="{{APP_URL}}/og-image.png" />

<!-- PWA / Mobile -->
<meta name="theme-color" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Finance" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

**OG image:** Create a 1200 × 630 px image (`og-image.png`) showing the app dashboard with the tagline. Store in `apps/web/public/`.

### PWA Install Prompt Configuration

The browser's install prompt triggers automatically when PWA criteria are met. To customize the experience:

```typescript
// apps/web/src/pwa-install.ts

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e: Event) => {
  // Prevent the default browser prompt
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  // Show your custom install UI (e.g., banner or button)
  showInstallPromotion();
});

async function installApp(): Promise<void> {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Install prompt outcome: ${outcome}`);
  deferredPrompt = null;
  hideInstallPromotion();
}

window.addEventListener('appinstalled', () => {
  // Hide install promotion — app is installed
  hideInstallPromotion();
  deferredPrompt = null;
});
```

**Install prompt UX guidelines:**

- Show the custom install prompt only after the user has engaged with the app (e.g., after 2+ sessions or 30+ seconds)
- Provide a clear value proposition: "Install Finance for offline access and a native experience"
- Allow dismissal without penalty — don't re-prompt for at least 2 weeks
- Never block app usage behind an install prompt

### Lighthouse Score Targets

| Category       | Target  | Key Metrics                                           |
| -------------- | ------- | ----------------------------------------------------- |
| Performance    | ≥ 90    | LCP < 2.5 s, FID < 100 ms, CLS < 0.1                  |
| Accessibility  | ≥ 95    | WCAG 2.2 AA, ARIA landmarks, focus management         |
| Best Practices | ≥ 95    | HTTPS, no console errors, CSP headers                 |
| SEO            | ≥ 90    | Meta tags, canonical URL, robots.txt, structured data |
| PWA            | ✅ Pass | Installable, offline-capable, fast loading            |

---

## Pre-Submission Checklist

Complete **every item** before submitting to any store. This checklist is the final gate between development and public release.

### Legal & Compliance

- [ ] Privacy policy published at `{{PRIVACY_POLICY_URL}}` and accessible without authentication
- [ ] Terms of service published at `{{TERMS_OF_SERVICE_URL}}`
- [ ] Privacy policy linked from in-app Settings > Privacy on all platforms
- [ ] Terms of service linked from in-app Settings on all platforms
- [ ] Data collection inventory verified — every collected data type is documented
- [ ] GDPR compliance: right to access, erasure, portability, and consent management
- [ ] Export compliance documentation ready (SQLCipher AES-256 = mass-market encryption)

### Accounts & Infrastructure

- [ ] Support email `{{SUPPORT_EMAIL}}` configured and monitored
- [ ] Support URL `{{SUPPORT_URL}}` live with help content or contact form
- [ ] Test accounts prepared for app review (Apple, Google — with sample data)
- [ ] Analytics consent flow implemented (opt-in, not opt-out)
- [ ] Crash reporting configured with user consent (Sentry or equivalent)
- [ ] Error tracking dashboard accessible to the team

### Visual Assets

- [ ] App icon exported at all required platform sizes (see [App Icon](#app-icon))
- [ ] All screenshots captured on the **latest release build** (not dev builds or mockups)
  - [ ] iOS: iPhone 16 Pro Max (6.9") and iPad Pro 13" at minimum
  - [ ] Android: Phone (1080 × 1920) at minimum; 7" and 10" tablet recommended
  - [ ] Windows: Desktop (1920 × 1080 recommended)
  - [ ] Web: OG image (1200 × 630)
- [ ] Feature graphic created (1024 × 500) for Google Play
- [ ] All screenshots show actual app UI with realistic sample data

### Store Metadata

- [ ] App name, descriptions, and keywords finalized (see [App Metadata](#app-metadata-shared))
- [ ] Data safety / privacy labels completed accurately on all platforms
  - [ ] Apple: Privacy nutrition labels in App Store Connect
  - [ ] Google: Data safety section in Play Console
  - [ ] Microsoft: Privacy statement URL in Partner Center
- [ ] Content rating / age rating questionnaires completed on all platforms
- [ ] Release notes written for v1.0.0

### Technical Readiness

- [ ] Release builds compile without warnings on all platforms
- [ ] All automated tests pass on CI (`npm test`)
- [ ] Performance benchmarks met (cold start < 2 s, scroll 60 fps, memory < 150 MB)
- [ ] Offline functionality verified — core features work without network
- [ ] Cross-device sync tested (iOS ↔ Android, Android ↔ Web, etc.)
- [ ] In-app purchases tested in sandbox environments (StoreKit 2, Google Play Billing)
- [ ] Crash-free rate > 99% in beta testing

### Marketing & Launch

- [ ] Release notes written (concise, user-facing language)
- [ ] Marketing website / landing page ready with download links
- [ ] OG image and social sharing metadata configured (see [Open Graph Meta Tags](#open-graph-meta-tags))

---

## Post-Submission Runbook

After submitting to each store, follow this runbook to track review progress and handle issues.

### Expected Review Times

| Store       | Typical Review Time | Expedited Review Available                   |
| ----------- | ------------------- | -------------------------------------------- |
| Apple       | 24–48 hours         | Yes (limited, request via App Store Connect) |
| Google Play | Hours to 7 days     | No                                           |
| Microsoft   | 1–5 business days   | No                                           |
| Web (PWA)   | No review required  | N/A                                          |

### If Rejected

1. **Read the rejection reason carefully** — store review teams provide specific guideline references
2. **Fix the issue** — address the exact violation cited
3. **Reply to the reviewer** (Apple: Resolution Center; Google: Play Console appeals) with a clear explanation of what was changed
4. **Resubmit** — the re-review is usually faster than the initial review
5. **Document the rejection** — add a note to this guide so future submissions avoid the same issue

### Post-Approval Actions

- [ ] Enable staged rollout (Google Play: start at 5%)
- [ ] Monitor crash reporting dashboard for the first 48 hours
- [ ] Check store listing renders correctly (screenshots, description, icon)
- [ ] Verify download and install flow on a clean device
- [ ] Confirm in-app purchases work in production
- [ ] Monitor user reviews and respond to feedback within 48 hours

---

## References

### Store Documentation

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)
- [MSIX Packaging](https://learn.microsoft.com/windows/msix/)
- [Web App Manifest — MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [IARC Rating System](https://www.globalratings.com/)

### Project Documentation

- [App Store Preparation Guide](app-store-preparation.md) — Developer account setup, build requirements, review guidelines
- [Windows Store Guide](windows-store.md) — MSIX packaging step-by-step
- [Launch Checklist](launch-checklist.md) — Full pre-launch verification
- [Release Process](release-process.md) — Versioning, pipelines, rollback
- [Beta Testing](beta-testing.md) — Beta distribution and feedback collection
- [Security Checklist](../audits/security-checklist.md) — OWASP MASVS L1 audit
- [Product Identity](../design/product-identity.md) — App description, value prop, differentiators
- [Feature Specification](../design/features.md) — Full feature list with acceptance criteria
