# Beta Testing Program

> Complete guide for planning and running Finance's pre-launch beta. Covers
> goals, tester recruitment, platform distribution, test scenarios, feedback
> collection, triage, and exit criteria.
>
> **Related docs:**
> [Beta Test Plan — Detailed Scenarios](./beta-test-plan.md) ·
> [Pre-Launch Checklist](./launch-checklist.md) ·
> [Release Process](./release-process.md)

---

## Table of Contents

1. [Beta Program Overview](#1-beta-program-overview)
2. [Tester Recruitment](#2-tester-recruitment)
3. [Distribution Setup](#3-distribution-setup)
4. [Test Scenarios Checklist](#4-test-scenarios-checklist)
5. [Feedback Collection](#5-feedback-collection)
6. [Triage Process](#6-triage-process)
7. [Exit Criteria](#7-exit-criteria)

---

## 1. Beta Program Overview

### Goals

| Goal                         | What We Learn                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Validate core flows**      | Onboarding → accounts → transactions → budgets → goals → reports work end-to-end on every platform.                                     |
| **Find bugs**                | Surface crashes, data-loss scenarios, and edge cases before general availability (GA).                                                  |
| **Assess UX**                | Verify that the expertise-tiered UI (🌱 Getting Started, 📊 Comfortable, 🧠 Advanced) feels intuitive across financial-literacy levels. |
| **Test sync across devices** | Confirm offline-first architecture + PowerSync replication keeps data consistent when users move between platforms.                     |

### Duration

**Minimum 2 weeks** of active testing. Extend if exit criteria (§ 7) are not
met. The [Pre-Launch Checklist](./launch-checklist.md) requires a minimum
2-week beta period per platform before sign-off.

### Target Coverage

| Platform  | Minimum Testers |
| --------- | --------------- |
| Android   | 10              |
| iOS       | 10              |
| Web       | 10              |
| Windows   | 10              |
| **Total** | **40+**         |

Aim for diversity within each group — see § 2 for recruitment criteria.

---

## 2. Tester Recruitment

Finance is a **privacy-first, offline-first personal finance app** that adapts
to three expertise tiers. Effective beta testing requires testers who mirror
the real audience described in [Product Identity](../design/product-identity.md)
and the personas in our design docs (Alex, Jordan, Casey).

### Who to Recruit

| Category                              | Why                                                                                                              | Example Profile                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Internal team members**             | Fast feedback loop; familiar with expected behavior.                                                             | Developers, designers, QA on the Finance team.                                                                                     |
| **Friends & family (early adopters)** | Real-world usage patterns; less filtered feedback.                                                               | A friend who tracks spending in a spreadsheet today.                                                                               |
| **Accessibility testers**             | Validate screen-reader flows, large-text layouts, and motor-accessibility. Must include users with disabilities. | A VoiceOver or TalkBack daily user; someone who relies on high-contrast or switch control.                                         |
| **Financial literacy range**          | Exercise all three expertise tiers (🌱 / 📊 / 🧠).                                                               | Casey-like persona (beginner, cognitive-accessibility needs) through Jordan-like persona (confident, power-user budgeting).        |
| **Platform diversity**                | Catch device-specific bugs and OS-version regressions.                                                           | Pixel 7 + Samsung Galaxy S23 (Android); iPhone 15 + iPhone SE (iOS); Chrome + Safari (Web); Surface Pro + budget laptop (Windows). |

### Recruitment Messaging Template

Copy and personalize the message below when inviting testers:

```text
Subject: Help us beta test Finance — a private, multi-platform money tracker

Hi {name},

We're looking for beta testers for Finance, a personal finance app that
keeps your data private and encrypted on your device.

What we need from you:
• Install the app on your {platform} device.
• Use it for at least 2 weeks — track real or sample transactions,
  set up a budget, and try the features listed in the test guide.
• Report anything confusing, broken, or delightful via the in-app
  feedback form (Settings → Send Feedback, or shake your phone).

Your data stays on your device. Nothing is shared with third parties.

Interested? Reply to this message and I'll send your install link.

Thanks!
— The Finance Team
```

---

## 3. Distribution Setup

Each platform has its own beta channel. Set up all four before inviting
testers.

### 3.1 iOS — TestFlight

1. In [App Store Connect](https://appstoreconnect.apple.com), select
   **Finance → TestFlight**.
2. Upload the IPA built by the CI `release-ios` workflow (via Fastlane).
3. Create a beta group called **Finance Beta** and add testers by email
   (any Apple ID works).
4. Fill in _Beta App Description_ and _What to Test_ (use the 13 scenarios
   from § 4).
5. Submit the first build for **Beta App Review** (subsequent builds to the
   same group auto-approve).
6. Testers receive a TestFlight invite and install via the TestFlight app.

**Tip:** Internal testers (Apple Developer account holders, up to 100) get
builds immediately with no review delay — use this for the core team.

### 3.2 Android — Google Play Internal Testing Track

1. Open [Google Play Console](https://play.google.com/console) → **Release →
   Testing → Internal testing**.
2. Create a release and upload the signed AAB from the CI `release-android`
   workflow.
3. Under **Testers**, create email lists:

   | List           | Purpose                     |
   | -------------- | --------------------------- |
   | `core-team`    | Internal developers / QA    |
   | `alpha-circle` | Trusted external volunteers |

4. Share the opt-in link with each list. Testers accept and install via the
   Play Store.

**Promotion path:** Internal → Closed beta → Open beta → Production.

### 3.3 Web — Staging Environment

1. Every push to a `release/*` branch generates a **Vercel Preview
   Deployment** at a URL like
   `https://finance-<branch>-<team>.vercel.app`.
2. Gate access with **Vercel Authentication** or a `BETA_ACCESS_CODE`
   environment variable.
3. Share the preview URL and access code with testers via a secure channel.

### 3.4 Windows — MSIX Sideloading or Flight Ring

**Sideloading (recommended for initial beta):**

1. Build the MSIX package via the CI `release-windows` workflow.
2. Sign with the development certificate (stored in CI secrets).
3. Distribute the `.msix` via a shared link (e.g., GitHub Release marked
   _pre-release_).
4. Testers install by double-clicking the MSIX.
   - Prerequisite: **Developer mode** enabled, or the signing certificate
     is in the Trusted People store.

**Microsoft Store flight ring (when Store-published):**

1. In **Partner Center**, create a package flight for a `Beta` ring.
2. Assign to a known-user group (Microsoft accounts).
3. Upload the MSIX and submit for certification.
4. Testers in the flight group receive the update via the Store.

---

## 4. Test Scenarios Checklist

Every beta tester should complete as many of these scenarios as possible.
Detailed step-by-step instructions for each are in
[`beta-test-plan.md`](./beta-test-plan.md).

- [ ] **1. Create account and complete onboarding** — Sign up (email, social, or passkey), choose an expertise tier (🌱 / 📊 / 🧠), and land on the dashboard.
- [ ] **2. Add a checking account** — Create a "Checking" account with an initial balance. Verify it appears in the account list with the correct balance.
- [ ] **3. Create 5+ transactions (mix of expense/income)** — Use quick-entry (< 10 s per transaction). Include at least one expense and one income entry across different categories.
- [ ] **4. Set up a monthly budget for a category** — Allocate money to at least one category (e.g., Food $600). Confirm the progress bar and remaining amount update after adding transactions.
- [ ] **5. Create a savings goal** — Set a goal with a name, target amount, and optional deadline. Fund it and verify progress and milestone celebrations.
- [ ] **6. View reports and analytics** — Open spending-by-category, spending-trends, and income-vs-expenses reports. Verify charts render correctly and data matches entered transactions.
- [ ] **7. Export data as JSON** — Settings → Export → JSON. Verify the file downloads and contains accounts, transactions, categories, budgets, and goals.
- [ ] **8. Export data as CSV** — Settings → Export → CSV. Open the file in a spreadsheet and confirm transactions are present and amounts are correct.
- [ ] **9. Test offline mode (disable network, make changes, reconnect)** — Enable airplane mode. Add a transaction and edit a budget. Re-enable network. Verify changes sync without data loss.
- [ ] **10. Sync across two devices (if applicable)** — Sign in on a second device (any platform). Confirm all data appears. Make a change on each device and verify bidirectional sync.
- [ ] **11. Test biometric authentication** — Enable biometric lock (Face ID, fingerprint, or Windows Hello) in Settings. Close and reopen the app. Verify the biometric prompt appears and grants access.
- [ ] **12. Navigate with screen reader enabled** — Turn on TalkBack (Android), VoiceOver (iOS), NVDA (Web), or Narrator (Windows). Complete onboarding and add a transaction using only the screen reader. Note any unlabeled elements or confusing announcements.
- [ ] **13. Test with large font / high contrast settings** — Set the device to maximum font size and enable high-contrast mode. Navigate through accounts, transactions, budgets, and reports. Verify no text is clipped and contrast is sufficient.

---

## 5. Feedback Collection

### 5.1 In-App Feedback Mechanism

Every platform includes two entry points:

| Trigger               | Platform     | How                                                                          |
| --------------------- | ------------ | ---------------------------------------------------------------------------- |
| **Shake to report**   | Android, iOS | Shake the device to open the feedback form with an auto-attached screenshot. |
| **Feedback button**   | All          | Settings → **Send Feedback** (always visible).                               |
| **Keyboard shortcut** | Web, Windows | `Ctrl+Shift+F` opens the feedback form.                                      |

### 5.2 Structured Feedback Form Template

The in-app form collects the following:

| Field         | Type                                                                  | Required | Notes                                                 |
| ------------- | --------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| Category      | Dropdown: Bug · Feature Request · Performance · Accessibility · Other | Yes      | Determines triage label.                              |
| Summary       | Short text (≤ 120 chars)                                              | Yes      | One-line description.                                 |
| Description   | Text area                                                             | Yes      | What happened, what you expected, steps to reproduce. |
| Screenshot    | Auto-attached on shake; manual attach otherwise                       | No       |                                                       |
| Device info   | Auto-collected (OS, model, app version)                               | Yes      |                                                       |
| Contact email | Text                                                                  | No       | Only if the tester wants a follow-up.                 |

### 5.3 Bug Report Template for Testers

Share this template with testers who prefer to report via email or a shared
channel:

```markdown
### Bug Report

**Summary:** (one line — what went wrong)

**Steps to reproduce:**

1.
2.
3.

**Expected result:**

**Actual result:**

**Platform / Device / OS version:**

**App version:** (Settings → About)

**Screenshot or screen recording:** (attach if possible)

**Does this happen every time?** Yes / No / Sometimes
```

### 5.4 Weekly Feedback Summary Process

Every Friday during the beta period:

1. QA lead compiles all new feedback from the in-app form and GitHub
   Discussions into a single summary.
2. Group feedback by theme: bugs, UX friction, accessibility gaps, feature
   requests.
3. Note top 3 issues by frequency.
4. Post the summary to GitHub Discussions (category: `Beta Feedback`).
5. Include: current crash-free rate, count of open P0/P1 bugs, and
   under-tested scenarios that need more coverage.

---

## 6. Triage Process

Every reported issue is assigned a priority level. Triage happens daily during
the beta period.

| Priority | Label                | Definition                                                                          | Action                                                                     |
| -------- | -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **P0**   | 🔴 Crash / data loss | App crash, data loss, data corruption, or security vulnerability.                   | Fix immediately. Push a hotfix build to all beta channels within 24 hours. |
| **P1**   | 🟠 Broken core flow  | A core flow (onboarding, transactions, budgets, sync) is broken with no workaround. | Fix before GA. Must not remain open for more than 48 hours.                |
| **P2**   | 🟡 UX issue          | Feature works but is confusing, slow, or visually broken. Workaround exists.        | Prioritize for GA if time permits. Document the workaround for testers.    |
| **P3**   | 🟢 Enhancement       | Cosmetic polish, minor friction, or a feature request.                              | Add to backlog. Revisit after GA.                                          |

**Triage flow:**

```
New feedback arrives
       ↓
QA assigns priority (P0–P3) + platform label
       ↓
P0/P1 → GitHub Issue created immediately → assigned to engineer
P2    → GitHub Issue created → added to current sprint if capacity allows
P3    → GitHub Issue created → added to backlog
```

---

## 7. Exit Criteria

All of the following must be satisfied before the beta is closed and the build
is promoted to production. See also the Testing section of the
[Pre-Launch Checklist](./launch-checklist.md).

- [ ] **Zero P0 bugs open** — no crashes, data loss, or security issues remain unresolved.
- [ ] **Zero P1 bugs open for > 48 hours** — every broken core flow has been fixed or a hotfix is deployed.
- [ ] **All 13 test scenarios validated by 3+ testers per platform** — each row in the § 4 checklist has been completed and confirmed working by at least 3 different testers on each target platform.
- [ ] **Sync tested across at least 2 platform combinations** — e.g., iOS ↔ Android, Web ↔ Windows. Data round-trips without loss or conflict.
- [ ] **Accessibility tested by 2+ testers with disabilities** — real users who rely on assistive technology (screen reader, switch control, magnification) have completed core flows and reported no blocking issues.
- [ ] **Net Promoter Score ≥ 7 (if surveyed)** — if a post-beta survey is sent, the average score meets this threshold.
- [ ] **Beta duration ≥ 2 weeks** — calendar time from first tester install to exit-criteria review.

### Sign-Off Process

1. QA lead compiles the **beta summary report** covering all criteria above.
2. Engineering lead reviews open issues and crash-free rate.
3. Product owner gives explicit **GO / NO-GO** approval.
4. Release manager promotes the build to production tracks (see
   [Release Process](./release-process.md)).
