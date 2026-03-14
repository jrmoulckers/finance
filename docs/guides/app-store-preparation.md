# App Store Preparation Guide — Finance

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-18
> **Purpose:** Comprehensive checklist and requirements for publishing Finance to all target app stores and as a PWA
> **Related Issues:** #80

---

## Table of Contents

- [Overview](#overview)
- [Google Play Store](#google-play-store)
- [Apple App Store](#apple-app-store)
- [Microsoft Store](#microsoft-store)
- [Progressive Web App (PWA)](#progressive-web-app-pwa)
- [Cross-Platform Checklist](#cross-platform-checklist)

---

## Overview

Finance targets four distribution channels, each with distinct submission requirements, review processes, and ongoing compliance obligations. This guide documents every requirement so that store submissions are predictable and repeatable.

**Key principle:** Prepare store assets _before_ code-complete — screenshot automation, privacy documentation, and metadata take longer than expected and should not block launch.

### Distribution Channels

| Channel           | App ID (proposed) | Distribution Format               |
| ----------------- | ----------------- | --------------------------------- |
| Google Play Store | `com.finance.app` | AAB (Android App Bundle)          |
| Apple App Store   | `com.finance.app` | IPA via Xcode / Xcode Cloud       |
| Microsoft Store   | `com.finance.app` | MSIX package                      |
| Web (PWA)         | N/A               | Hosted at `app.finance.com` (TBD) |

---

## Google Play Store

### Developer Account Setup

1. **Google Play Console** — Register at [play.google.com/console](https://play.google.com/console)
2. **One-time fee:** $25 USD
3. **Organization account** recommended over individual (unlocks managed publishing, team roles)
4. **D-U-N-S number** not required for individual but recommended for organization accounts

### Store Listing Requirements

| Field              | Requirement                                | Finance Value                                                                  |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------ |
| App name           | Max 30 characters                          | `Finance` (working title — finalize before submission)                         |
| Short description  | Max 80 characters                          | TBD — one-line value proposition                                               |
| Full description   | Max 4,000 characters                       | Feature overview, privacy commitment, platform highlights                      |
| App icon           | 512 × 512 px, PNG, 32-bit, no transparency | From design tokens / brand assets                                              |
| Feature graphic    | 1,024 × 500 px, PNG or JPEG                | Hero image for store listing                                                   |
| App category       | Finance                                    | `Finance`                                                                      |
| Tags               | Up to 5                                    | e.g., `budgeting`, `expense tracker`, `personal finance`, `offline`, `privacy` |
| Contact email      | Required                                   | TBD                                                                            |
| Privacy policy URL | Required                                   | Must be publicly accessible, hosted URL                                        |

### Screenshot Specifications

Google Play requires **2–8 screenshots** per device type. Recommended to provide all sizes.

| Device Type | Dimensions (px)                | Required           |
| ----------- | ------------------------------ | ------------------ |
| Phone       | 1080 × 1920 (or 16:9 portrait) | ✅ Yes (minimum 2) |
| 7" Tablet   | 1200 × 1920                    | Recommended        |
| 10" Tablet  | 1600 × 2560                    | Recommended        |
| Chromebook  | 1920 × 1080 (landscape)        | Optional           |

**Screenshot guidelines:**

- PNG or JPEG, max 8 MB each
- No alpha/transparency on PNG
- Must reflect actual in-app UI (no misleading content)
- Show key flows: dashboard, transaction entry, budget view, reports, onboarding
- Include device frames for marketing materials (not required by Play Store)
- Localize screenshots per language if supporting multiple locales

**Automation:** Use Gradle + `screengrab` (Fastlane) or Compose Preview Screenshot Testing to generate screenshots from instrumentation tests. Store in `apps/android/screenshots/`.

### Content Rating

Google Play uses the **IARC (International Age Rating Coalition)** questionnaire.

| Question Area                   | Finance Answer                                    |
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

**Expected rating:** PEGI 3 / Everyone (ESRB) — finance apps with no objectionable content typically receive the lowest age rating.

### Privacy Policy

A privacy policy is **mandatory** for any app that collects personal data.

**Requirements:**

- Hosted at a publicly accessible URL (not behind auth)
- Discloses all data collected, how it is used, and who it is shared with
- Covers data retention and deletion policies
- Must be accessible from the store listing AND from within the app (Settings > Privacy)
- Must comply with GDPR, CCPA/CPRA at minimum

**Recommended URL:** `https://finance.app/privacy` (or equivalent)

### Data Safety Form

Google Play's Data Safety section requires developers to declare all data types collected.

| Data Type                               | Collected         | Shared | Purpose                         |
| --------------------------------------- | ----------------- | ------ | ------------------------------- |
| Email address                           | ✅                | ❌     | Account authentication          |
| Financial info (transactions, balances) | ✅                | ❌     | App functionality               |
| App activity (screens viewed)           | ✅ (with consent) | ❌     | Analytics — funnel optimization |
| Crash logs                              | ✅ (with consent) | ❌     | Stability monitoring            |
| Device identifiers                      | ❌                | ❌     | Not collected                   |
| Location                                | ❌                | ❌     | Not collected                   |

**Key declarations:**

- Data encrypted in transit: ✅ (TLS 1.3)
- Data encrypted at rest: ✅ (SQLCipher)
- Users can request data deletion: ✅ (SET-004)
- Data not sold to third parties: ✅
- Independent security review: TBD (recommend post-launch)

### Release Tracks

| Track                  | Purpose               | Audience                            |
| ---------------------- | --------------------- | ----------------------------------- |
| Internal testing       | Dev team verification | Up to 100 testers                   |
| Closed testing (Alpha) | Invited beta testers  | Up to 2,000 via email list          |
| Open testing (Beta)    | Public beta           | Unlimited, listed as "Early Access" |
| Production             | General availability  | All Play Store users                |

**Recommendation:** Use closed testing for at least 2 weeks before production release. Google requires a minimum of **20 testers for 14 consecutive days** in closed testing before first production release (as of 2024 policy).

### Android-Specific Build Requirements

- **Target API level:** Must target the latest stable Android API level (currently API 35 / Android 15)
- **App Bundle format:** AAB required (not APK) for Play Store submission
- **App signing:** Enroll in Google Play App Signing (Google manages the upload key)
- **64-bit support:** Required for all native code
- **Deobfuscation file:** Upload ProGuard/R8 mapping file for crash reporting

---

## Apple App Store

### App Store Connect Setup

1. **Apple Developer Program** — Enroll at [developer.apple.com](https://developer.apple.com/programs/)
2. **Annual fee:** $99 USD/year
3. **Requires:** Apple ID with two-factor authentication enabled
4. **Organization enrollment** requires D-U-N-S number and legal entity verification (2–4 weeks)

**App Store Connect configuration:**

| Field              | Requirement                                 | Finance Value                                                |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| App name           | Max 30 characters, unique on App Store      | `Finance` (working title — check availability)               |
| Subtitle           | Max 30 characters                           | TBD — e.g., "Budget with clarity"                            |
| Promotional text   | Max 170 characters, editable without review | Updatable for seasonal promotions                            |
| Description        | Max 4,000 characters                        | Feature overview, privacy commitment                         |
| Keywords           | Max 100 characters total (comma-separated)  | e.g., `budget,expense,tracker,money,savings,offline,privacy` |
| Category           | Primary + optional secondary                | Primary: `Finance`, Secondary: `Productivity`                |
| Bundle ID          | Reverse-DNS                                 | `com.finance.app`                                            |
| SKU                | Internal reference                          | `finance-ios-001`                                            |
| Support URL        | Required                                    | TBD                                                          |
| Privacy policy URL | Required                                    | Same as Android (hosted URL)                                 |

### Screenshot Requirements — All Device Sizes

Apple requires screenshots for **each device size** you support. Missing sizes means the app is not listed on those devices.

| Device                | Screen Size | Dimensions (px)    | Required                 |
| --------------------- | ----------- | ------------------ | ------------------------ |
| iPhone 16 Pro Max     | 6.9"        | 1320 × 2868        | ✅ Required              |
| iPhone 16 Pro         | 6.3"        | 1206 × 2622        | Recommended              |
| iPhone 16             | 6.1"        | 1179 × 2556        | Falls back to Pro Max    |
| iPhone SE (3rd gen)   | 4.7"        | 750 × 1334         | ✅ If supporting SE      |
| iPad Pro 13" (M4)     | 13"         | 2064 × 2752        | ✅ If supporting iPad    |
| iPad Pro 11" (M4)     | 11"         | 1668 × 2420        | Falls back to 13"        |
| iPad Air 11"          | 11"         | 1640 × 2360        | Falls back to 13"        |
| Apple Watch Series 10 | 46mm        | 416 × 496          | If watchOS app           |
| Mac (Apple Silicon)   | —           | 1280 × 800 minimum | If Mac Catalyst / native |

**Per device size:** 2–10 screenshots, in order of importance.

**Screenshot guidelines:**

- PNG or JPEG, no alpha channel
- Portrait or landscape (consistent per set)
- Must accurately represent the app (no misleading imagery)
- Can include status bar or not (if included, must match the device)
- App previews (video): up to 30 seconds, optional, up to 3 per locale

**Automation:** Use Xcode UI tests + `snapshot` (Fastlane) or Xcode's built-in screenshot workflow. Store generated screenshots in `apps/ios/Screenshots/`.

**Recommended screenshot flow (5 screens):**

1. Dashboard — "See your finances at a glance"
2. Quick Entry — "Add transactions in 3 taps"
3. Budget — "Give every dollar a job"
4. Reports — "Understand your spending trends"
5. Goals — "Track progress toward what matters"

### Privacy Nutrition Labels

Apple requires a **privacy nutrition label** in App Store Connect that discloses all data collection.

#### Data Types Declaration

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

**Data use purposes (for collected types):**

- Email: App Functionality (authentication, account recovery)
- Financial info: App Functionality (core feature)
- Usage data: Analytics (only with user consent, PII-free)
- Diagnostics: App Functionality (crash reporting, stability)

**Key declarations:**

- "Data Not Used to Track You" — Finance does NOT track users across other apps/websites
- "Data Not Sold" — Finance does NOT sell any user data
- If using any third-party SDKs (analytics, crash reporting), their data collection must also be declared

### App Review Guidelines — Key Areas

Apple's review can reject apps for many reasons. These are the areas most relevant to Finance:

| Guideline                       | Requirement                                                 | Finance Compliance                                    |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| 2.1 Performance                 | App must be complete and functional, no placeholder content | Ensure all screens are implemented before submission  |
| 2.3 Accurate Metadata           | Screenshots, descriptions must reflect actual app           | Generate screenshots from real app, not mockups       |
| 3.1.1 In-App Purchase           | Digital content/services must use Apple IAP                 | Freemium features must use StoreKit 2                 |
| 3.1.2 Subscriptions             | Auto-renewable subscriptions allowed for ongoing services   | Use StoreKit 2 for premium tier if subscription model |
| 4.0 Design                      | App must follow HIG principles                              | SwiftUI with standard navigation, SF Symbols          |
| 5.1.1 Data Collection           | Must have a privacy policy, declare all data                | Privacy policy URL + nutrition labels                 |
| 5.1.2 Data Use and Sharing      | Data use must match declared purposes                       | Audit all SDKs before submission                      |
| 5.6.1 App Tracking Transparency | Must use ATT framework if tracking                          | Finance does not track — no ATT prompt needed         |

**Common rejection reasons to avoid:**

- Login required before any functionality is accessible — Finance allows offline use without auth ✅
- Incomplete or broken features — test every flow before submission
- Misleading screenshots — generate from real app
- Missing privacy policy — host before submission
- In-app purchase issues — test sandbox purchases thoroughly

### TestFlight Beta Testing

| Track                              | Limit          | Duration          |
| ---------------------------------- | -------------- | ----------------- |
| Internal (App Store Connect users) | 100 testers    | No expiration     |
| External (public link)             | 10,000 testers | 90 days per build |

**Requirement:** External TestFlight builds undergo a lightweight App Review (usually < 24 hours).

---

## Microsoft Store

### MSIX Submission

Finance's Windows app (Compose Desktop / JVM) is packaged as an **MSIX** bundle for Microsoft Store distribution.

#### MSIX Packaging Requirements

| Requirement      | Detail                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Package format   | MSIX or MSIX bundle                                                                      |
| Signing          | Must be signed with a trusted certificate (Microsoft handles this for Store submissions) |
| Package identity | Registered in Partner Center                                                             |
| Capabilities     | Declare required capabilities: `internetClient`, `localStorage`                          |
| Architecture     | x64 required, ARM64 recommended                                                          |
| Min OS version   | Windows 10 version 1809 (build 17763) or later                                           |

**Build command (Compose Desktop):**

```bash
node tools/gradle.js :apps:windows:packageMsix
```

#### Partner Center Setup

1. **Microsoft Partner Center** — Register at [partner.microsoft.com](https://partner.microsoft.com)
2. **Registration fee:** One-time $19 USD (individual) or $99 USD (company)
3. **App reservation:** Reserve the app name before submission

### Store Listing

| Field              | Requirement                  | Finance Value                                                   |
| ------------------ | ---------------------------- | --------------------------------------------------------------- |
| App name           | Max 256 characters           | `Finance` (check availability)                                  |
| Description        | Max 10,000 characters        | Same core content as other stores, tailored for desktop context |
| Short description  | Max 1,000 characters         | Feature summary                                                 |
| Screenshots        | 1–10 per device type         | Desktop-optimized screenshots showing sidebar layout            |
| App icon           | 300 × 300 px minimum         | From brand assets                                               |
| Category           | Business or Personal Finance | `Personal Finance`                                              |
| Support contact    | Required                     | Email or URL                                                    |
| Privacy policy URL | Required                     | Same hosted URL                                                 |
| Website            | Optional but recommended     | `https://finance.app` (TBD)                                     |

#### Screenshot Specifications

| Type        | Dimensions                              | Count         |
| ----------- | --------------------------------------- | ------------- |
| Desktop     | 1366 × 768 minimum, 3840 × 2160 maximum | 1–10 required |
| Recommended | 1920 × 1080 (Full HD)                   | Best practice |

**Desktop screenshots should show:**

1. Dashboard with sidebar navigation visible
2. Multi-panel transaction view
3. Budget overview with keyboard shortcuts visible
4. Reports with full-width charts
5. Settings / preferences panel

### Age Rating

Microsoft Store uses the **IARC** questionnaire (same system as Google Play).

| Question Area          | Finance Answer                           |
| ---------------------- | ---------------------------------------- |
| Violence               | None                                     |
| Fear                   | None                                     |
| Sexual content         | None                                     |
| Controlled substances  | None                                     |
| User-generated content | No (V1)                                  |
| Personal data          | Yes — financial data, email              |
| In-app purchases       | Yes (freemium)                           |
| Online connectivity    | Required for sync, optional for core use |

**Expected rating:** PEGI 3 / Everyone — identical to Google Play rating.

### Windows-Specific Requirements

- **Accessibility:** Must support Windows Narrator, High Contrast mode, and keyboard-only navigation (UI Automation properties on all controls)
- **System integration:** Respect system theme (light/dark), DPI scaling, and window resizing
- **Offline capability:** App must be functional without internet (core financial features)
- **Uninstall:** Clean uninstall — no residual files outside `%LOCALAPPDATA%`

### Certification Requirements

Microsoft runs automated certification tests before publishing:

| Test                 | What It Checks                                 |
| -------------------- | ---------------------------------------------- |
| Security             | No malware, valid signing                      |
| Technical compliance | Proper MSIX structure, capability declarations |
| Content compliance   | Matches store listing, no prohibited content   |
| Performance          | Reasonable launch time, no hangs               |
| Accessibility        | Basic Narrator compatibility                   |

---

## Progressive Web App (PWA)

Finance's web app (`apps/web/`) is distributed as a PWA — no app store submission required, but strict technical criteria must be met.

### Installability Criteria

For a PWA to be installable (show the browser install prompt), it must meet these requirements:

| Criterion        | Requirement                                 | Implementation                        |
| ---------------- | ------------------------------------------- | ------------------------------------- |
| HTTPS            | Served over HTTPS                           | Cloudflare Pages / Vercel (automatic) |
| Web App Manifest | Valid `manifest.json` linked in HTML        | `apps/web/public/manifest.json`       |
| Service Worker   | Registered with a `fetch` event handler     | `apps/web/src/service-worker.ts`      |
| Icons            | At least 192×192 and 512×512 px icons       | In `apps/web/public/icons/`           |
| `start_url`      | Defined in manifest                         | `/` or `/dashboard`                   |
| `display`        | `standalone`, `fullscreen`, or `minimal-ui` | `standalone`                          |

### Manifest Validation

The `manifest.json` must include all required fields:

```json
{
  "name": "Finance",
  "short_name": "Finance",
  "description": "Personal finance tracking — budget with clarity",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a2e",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["finance", "productivity"],
  "screenshots": [
    {
      "src": "/screenshots/dashboard.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Dashboard overview showing budget health and recent transactions"
    },
    {
      "src": "/screenshots/mobile-dashboard.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Mobile dashboard view"
    }
  ]
}
```

**Validation tools:**

- Chrome DevTools > Application > Manifest — shows parsing errors and installability status
- [PWA Builder](https://www.pwabuilder.com/) — validates manifest, service worker, and security
- [Web App Manifest Validator](https://nicedoc.io/nicedoc/nicedoc) — schema validation

### Lighthouse Scores

Target Lighthouse scores for Finance PWA (aligned with CI budgets in `apps/web/`):

| Category       | Target Score | Key Metrics                                               |
| -------------- | ------------ | --------------------------------------------------------- |
| Performance    | ≥ 90         | LCP < 2.5s, FID < 100ms, CLS < 0.1, TTFB < 800ms          |
| Accessibility  | ≥ 95         | WCAG 2.2 AA compliance, ARIA landmarks, focus management  |
| Best Practices | ≥ 95         | HTTPS, no console errors, CSP headers, no deprecated APIs |
| SEO            | ≥ 90         | Meta tags, canonical URL, robots.txt, structured data     |
| PWA            | ✅ Pass      | Installable, offline-capable, fast loading                |

**Lighthouse CI integration:**

```bash
# Run Lighthouse audit locally
npx lighthouse https://localhost:3000 --output=json --output-path=./lighthouse-report.json

# CI budget enforcement (configured in apps/web/lighthouserc.js)
npx lhci autorun
```

**Key performance optimizations for target scores:**

- Code splitting per route (React lazy loading)
- SQLite-WASM loaded asynchronously after initial paint
- Service worker precaches critical assets (app shell)
- Images optimized (WebP with PNG fallback)
- Font subsetting for design token typography

### Service Worker Requirements

| Feature          | Implementation                                                  |
| ---------------- | --------------------------------------------------------------- |
| Precaching       | App shell (HTML, CSS, critical JS) cached on install            |
| Runtime caching  | API responses cached with stale-while-revalidate strategy       |
| Offline fallback | Offline page shown when network unavailable and page not cached |
| Background sync  | Queued transactions synced when connectivity restored           |
| Update flow      | `skipWaiting` + prompt user to refresh for new version          |

### PWA Distribution Channels

While PWAs don't require store submission, they can optionally be listed:

| Channel           | How                                                 | Benefit                      |
| ----------------- | --------------------------------------------------- | ---------------------------- |
| Direct install    | Browser install prompt from `app.finance.com`       | Primary distribution         |
| Google Play Store | TWA (Trusted Web Activity) via Bubblewrap           | Listed alongside native apps |
| Microsoft Store   | PWA Builder packaging                               | Listed in MS Store           |
| App directories   | [PWA Directory](https://pwa-directory.appspot.com/) | Discovery                    |

---

## Cross-Platform Checklist

Use this checklist before submitting to any store. Every item applies to all platforms.

### Pre-Submission

- [ ] **Privacy policy** hosted at public URL, linked in app settings and store listing
- [ ] **Terms of service** drafted and hosted (recommended, not always required)
- [ ] **Support email/URL** configured and responsive
- [ ] **App icon** generated at all required sizes for all platforms
- [ ] **Screenshots** generated from real app (not mockups) for all required device sizes
- [ ] **Store description** written, proofread, and consistent across stores
- [ ] **Keywords/tags** researched and optimized per store
- [ ] **Content rating** questionnaire completed per store (IARC)
- [ ] **Privacy labels / data safety** declarations completed accurately
- [ ] **In-app purchases** tested in sandbox/staging environments
- [ ] **Accessibility audit** passed — WCAG 2.2 AA at minimum

### Technical Readiness

- [ ] **Release build** compiles without warnings on all platforms
- [ ] **Automated tests** pass on CI (unit, integration, UI)
- [ ] **Crash-free rate** > 99% in beta testing
- [ ] **Performance benchmarks** met (startup < 2s, scroll 60fps, memory within budget)
- [ ] **Offline functionality** verified — all core features work without network
- [ ] **Deep linking** configured and tested (if applicable)
- [ ] **Analytics consent** flow implemented (opt-in, not opt-out)
- [ ] **Crash reporting** configured with consent (Sentry / Firebase Crashlytics)

### Post-Submission

- [ ] **Monitor review status** — respond to reviewer questions within 24 hours
- [ ] **Staged rollout** enabled (Google Play: 5% → 20% → 50% → 100%)
- [ ] **Crash monitoring** active from first production install
- [ ] **User feedback channels** established (in-app feedback, support email)
- [ ] **Update cadence** planned — at least monthly for bug fixes, quarterly for features
- [ ] **Store listing experiments** planned (A/B test screenshots and descriptions)

---

## Asset Generation Pipeline

### Recommended Directory Structure

```
apps/
├── android/
│   └── screenshots/
│       ├── phone/
│       ├── tablet-7/
│       └── tablet-10/
├── ios/
│   └── Screenshots/
│       ├── iPhone-6.9/
│       ├── iPhone-6.3/
│       ├── iPad-13/
│       └── Mac/
├── web/
│   └── public/
│       ├── icons/
│       ├── screenshots/
│       └── manifest.json
└── windows/
    └── screenshots/
        └── desktop/
```

### Automation Tools

| Platform | Tool                                               | Purpose                                             |
| -------- | -------------------------------------------------- | --------------------------------------------------- |
| Android  | Fastlane `screengrab` / Compose Screenshot Testing | Automated screenshot generation from UI tests       |
| iOS      | Fastlane `snapshot` / Xcode UI Tests               | Automated screenshots per device/locale             |
| Web      | Playwright / Puppeteer                             | Headless browser screenshots at defined viewports   |
| Windows  | Manual / Windows App Certification Kit             | Desktop screenshots + certification                 |
| All      | ImageMagick / Sharp                                | Resize, crop, format conversion for icon generation |

---

## References

- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Human Interface Guidelines — App Store](https://developer.apple.com/design/human-interface-guidelines/app-store)
- [Microsoft Store Policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
- [MSIX Packaging](https://learn.microsoft.com/en-us/windows/msix/)
- [Web App Manifest — MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)
- [PWA Builder](https://www.pwabuilder.com/)
- [IARC Rating System](https://www.globalratings.com/)
