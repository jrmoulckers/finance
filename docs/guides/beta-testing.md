# Beta Testing Program

> End-to-end guide for running Finance's beta testing program across Android,
> iOS, Web, and Windows. Covers distribution, tester management, feedback
> collection, and exit criteria.

---

## 1. Platform-Specific Beta Distribution

### 1.1 Android — Google Play Internal Testing

**Track setup:**

1. Open [Google Play Console](https://play.google.com/console) → **Release** →
   **Testing** → **Internal testing**.
2. Create a new internal testing release.
3. Upload the signed AAB produced by the CI `release-android` workflow.
4. Set the release name to the current version (e.g., `1.2.0-beta.1`).

**Tester groups:**

| Group          | Purpose                          | Max Testers |
|----------------|----------------------------------|-------------|
| `core-team`    | Internal developers and designers | 20          |
| `alpha-circle` | Trusted external volunteers       | 50          |
| `beta-public`  | Open beta (promoted later)        | 1,000       |

**Steps:**

1. Navigate to **Internal testing** → **Testers** → **Create email list**.
2. Add tester email addresses (Google accounts required).
3. Share the opt-in link with each group.
4. Testers accept the invite and install via the Play Store.

**Promotion path:** Internal → Closed beta → Open beta → Production.

---

### 1.2 iOS — TestFlight

**Configuration:**

1. In [App Store Connect](https://appstoreconnect.apple.com), select the
   Finance app → **TestFlight** tab.
2. Upload the IPA built by the CI `release-ios` workflow (via Fastlane
   `deliver`).
3. Apple processes the build (typically 15–30 minutes).

**Internal testers (up to 100):**

- Add via **App Store Connect Users** (must have an Apple Developer account
  role).
- Builds are available immediately — no review required.

**External testers (up to 10,000):**

1. Create a **beta group** (e.g., `Finance Beta`).
2. Add testers by email (any Apple ID).
3. Fill in the *Beta App Description* and *What to Test* fields.
4. Submit for **Beta App Review** (first build only; subsequent builds to the
   same group auto-approve unless metadata changes).
5. Testers receive a TestFlight invite email and install via the TestFlight app.

**TestFlight metadata:**

```
Beta App Description:
  Finance helps you track spending, set budgets, and reach savings goals.
  This beta build may contain bugs — please report them via the in-app
  feedback form.

What to Test:
  - Account creation and sign-in
  - Adding and editing transactions
  - Budget and goal features
  - Offline mode and sync
  - Dark mode and accessibility
```

---

### 1.3 Web — Staging Environment (Vercel Preview)

**Setup:**

1. Every push to `phase-*/beta` or `release/*` branches generates a **Vercel
   Preview Deployment** automatically.
2. The preview URL follows the pattern:
   `https://finance-<branch>-<team>.vercel.app`

**Restricted access:**

- Enable **Vercel Authentication** on the preview deployment so only invited
  team members can access it.
- Alternatively, gate access with an environment variable
  `BETA_ACCESS_CODE` — users must enter the code on first visit.

**Tester instructions:**

1. Navigate to the preview URL provided in the release communication.
2. Enter the beta access code (shared via secure channel).
3. Use the app as normal; report issues via the in-app feedback form.

---

### 1.4 Windows — MSIX Sideloading & Flight Rings

**MSIX sideloading (internal beta):**

1. Build the MSIX package via the CI `release-windows` workflow.
2. Sign the package with the development certificate (stored in CI secrets).
3. Distribute the `.msix` file via a shared internal link (e.g., SharePoint or
   GitHub Release asset marked as pre-release).
4. Testers install by double-clicking the MSIX and accepting the prompt.
   - Prerequisite: **Developer mode** or the signing certificate must be in the
     Trusted People store.

**Microsoft Store flight rings (future):**

| Ring             | Audience             | Purpose                   |
|------------------|----------------------|---------------------------|
| `Dev`            | Core team            | Daily builds              |
| `Beta`           | Invited testers      | Feature-complete previews |
| `Release Preview`| Broader audience     | Final validation          |
| `Production`     | All users            | General availability      |

**Flight ring configuration (when Store-published):**

1. In **Partner Center**, create a package flight.
2. Assign the flight to a known user group (Microsoft accounts).
3. Upload the MSIX and submit for certification.
4. Testers in the flight group receive the update via the Store.

---

## 2. Test Plan

### 2.1 Critical User Journeys (10)

Every beta tester should exercise these flows. Detailed scenarios are in
[`beta-test-plan.md`](./beta-test-plan.md).

| #  | Journey                                  | Priority |
|----|------------------------------------------|----------|
| 1  | Account creation and sign-in             | P0       |
| 2  | Transaction CRUD (create, edit, delete)  | P0       |
| 3  | Transaction search and filter            | P1       |
| 4  | Budget creation and tracking             | P0       |
| 5  | Goal setting and milestone celebrations  | P1       |
| 6  | Offline usage → reconnect → sync         | P0       |
| 7  | Multi-device sync                        | P1       |
| 8  | Data export (JSON, CSV)                  | P1       |
| 9  | Settings persistence across sessions     | P1       |
| 10 | Accessibility — screen reader full flow  | P0       |

### 2.2 Device Matrix

| Platform | Primary Device         | Secondary Device       |
|----------|------------------------|------------------------|
| Android  | Pixel 7 (API 34)       | Samsung Galaxy S23     |
| iOS      | iPhone 15 (iOS 17)     | iPhone SE 3 (iOS 16)  |
| Web      | Chrome 120+ (desktop)  | Safari 17 (mobile)    |
| Windows  | Surface Pro 9 (Win 11) | Budget laptop (Win 10) |

### 2.3 Bug Severity Definitions

| Severity | Label | Definition                                             | SLA        |
|----------|-------|--------------------------------------------------------|------------|
| P0       | 🔴    | App crash, data loss, security vulnerability           | Fix before release |
| P1       | 🟠    | Feature broken, no workaround                          | Fix before release |
| P2       | 🟡    | Feature broken, workaround exists                      | Fix within next release |
| P3       | 🟢    | Cosmetic issue, minor UX friction                      | Backlog    |

---

## 3. Beta Exit Criteria

All of the following must be met before promoting a beta build to production:

| Criterion                          | Target                         |
|------------------------------------|--------------------------------|
| Crash-free rate                    | ≥ 99.5%                       |
| P0 bugs open                       | 0                              |
| P1 bugs open                       | 0                              |
| P2 bugs open                       | ≤ 3 (with workarounds documented) |
| Unique testers per platform        | ≥ 10                           |
| All 10 critical journeys passed    | ✅ on every platform            |
| Performance benchmarks met         | See § 2.1 #10 in test plan     |
| Accessibility audit passed         | No P0/P1 a11y issues           |
| Beta duration                      | ≥ 5 business days              |

**Sign-off process:**

1. QA lead compiles the beta summary report.
2. Engineering lead reviews open issues and crash reports.
3. Product owner gives explicit **GO / NO-GO** approval.
4. Release manager promotes the build to production tracks.

---

## 4. Feedback Collection

### 4.1 In-App Feedback Form

Every platform includes a **"Send Feedback"** entry point in the Settings
screen and a persistent **shake-to-report** gesture (mobile) or
**Ctrl+Shift+F** shortcut (desktop/web).

**Form fields:**

| Field           | Type          | Required |
|-----------------|---------------|----------|
| Category        | Dropdown      | Yes      |
| Description     | Text area     | Yes      |
| Screenshot      | Auto-attached | No       |
| Device info     | Auto-collected| Yes      |
| App version     | Auto-collected| Yes      |
| Contact email   | Text          | No       |

**Categories:** Bug, Feature Request, Performance, Accessibility, Other.

### 4.2 GitHub Discussions Integration

All beta feedback is routed to **GitHub Discussions** in the `finance` repo:

- **Category:** `Beta Feedback`
- **Labels:** auto-applied based on form category
  (`beta-bug`, `beta-feature`, `beta-perf`, `beta-a11y`).
- **Triage:** The QA team reviews new discussions daily and converts
  actionable items into GitHub Issues.

**Flow:**

```
In-app form  →  Backend API  →  GitHub Discussions (via GitHub API)
                                    ↓
                              QA triage (daily)
                                    ↓
                              GitHub Issue (if actionable)
```

### 4.3 Crash Reporting

| Platform | Tool                | Dashboard                     |
|----------|---------------------|-------------------------------|
| Android  | Firebase Crashlytics| Firebase Console              |
| iOS      | Firebase Crashlytics| Firebase Console              |
| Web      | Sentry              | Sentry Dashboard              |
| Windows  | Sentry              | Sentry Dashboard              |

Crash-free rate is monitored continuously and included in the beta exit
criteria check.

---

## 5. Beta Communication

### 5.1 Tester Onboarding Email

```
Subject: Welcome to the Finance Beta! 🎉

Hi {name},

You've been invited to beta test Finance — a multi-platform financial
tracking app. Here's how to get started:

1. Install the app using the link for your platform:
   - Android: {play_store_link}
   - iOS: {testflight_link}
   - Web: {vercel_preview_link}
   - Windows: {msix_download_link}

2. Sign in or create an account.

3. Try the 10 critical user journeys listed in the test plan.

4. Report any issues via the in-app feedback form (Settings → Send Feedback).

Thank you for helping us build a better Finance!

— The Finance Team
```

### 5.2 Weekly Beta Update

Every Friday during the beta period, post a summary to GitHub Discussions:

- New features / fixes in this build
- Known issues
- Top feedback themes
- Updated crash-free rate
- Call to action for under-tested areas
