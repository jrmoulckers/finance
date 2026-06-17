# Beta Program Launch Execution

> **Issue:** [#842](https://github.com/jrmoulckers/finance/issues/842)
> **Status:** PROPOSED — Pending human review
> **Sprint:** Marketing Sprint 3
> **Last Updated:** 2025-07-27
> **Author:** Marketing Strategist (AI agent)
> **Related:** [Beta Recruitment Plan](beta-recruitment-plan.md) · [Brand Voice Guide](brand-voice-guide.md)

---

## Table of Contents

1. [Launch Readiness Checklist](#1-launch-readiness-checklist)
2. [Platform Distribution Setup](#2-platform-distribution-setup)
3. [Recruitment Post Publishing Plan](#3-recruitment-post-publishing-plan)
4. [Beta Feedback Infrastructure](#4-beta-feedback-infrastructure)
5. [Weekly Feedback Summary Template](#5-weekly-feedback-summary-template)
6. [Tester Engagement Plan](#6-tester-engagement-plan)
7. [Escalation & Issue Routing](#7-escalation--issue-routing)
8. [Beta Success Milestones](#8-beta-success-milestones)

---

## 1. Launch Readiness Checklist

### Pre-Launch (Complete Before Posting Recruitment)

#### Engineering Prerequisites

- [ ] iOS TestFlight build uploaded and approved for external testing
- [ ] Android internal testing track configured on Google Play Console
- [ ] Web staging URL deployed with access control (invite codes or auth)
- [ ] Windows MSIX pre-release package built and signed
- [ ] All critical-path flows working: onboarding, transaction entry, budget creation, reports
- [ ] Known issues documented in a beta release notes document
- [ ] Crash reporting enabled (privacy-respecting: Sentry with PII scrubbing, or equivalent)
- [ ] In-app feedback mechanism functional (email link, GitHub issue template, or feedback form)

#### Marketing Prerequisites

- [ ] Sign-up form live and tested (collects: name, email, platform, screening questions)
- [ ] Welcome email sequence configured in email tool (3 emails: welcome, week 1, feedback)
- [ ] Recruitment posts drafted and reviewed (from beta-recruitment-plan.md § 3)
- [ ] Landing page live (if applicable) with beta sign-up CTA
- [ ] Beta release notes written (what works, what's known-broken, what to test)
- [ ] Feedback collection channels set up (see § 4)
- [ ] NDA/agreement template ready (if required — data stays on-device, feedback may be quoted anonymously)

#### Brand & Legal Prerequisites

- [ ] Privacy policy accessible (in-app and web)
- [ ] Terms of service accessible
- [ ] Beta-specific terms documented (e.g., "beta software may contain bugs, data may need to be reset")
- [ ] All recruitment copy reviewed against brand voice guide

---

## 2. Platform Distribution Setup

### iOS (TestFlight)

| Item                     | Detail                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Distribution method**  | TestFlight external testing                                                                                                                                                   |
| **Group name**           | "Finance Beta"                                                                                                                                                                |
| **Build version**        | [human fills in]                                                                                                                                                              |
| **Invite method**        | Public link (up to 10,000 testers) or email invite                                                                                                                            |
| **Review required**      | Yes — first TestFlight external build requires Apple review                                                                                                                   |
| **Beta App Description** | "Finance is a privacy-first budget tracker. This beta is for testing core features: transaction entry, budgets, goals, and reports. All data stays encrypted on your device." |
| **Feedback URL**         | [feedback form or email]                                                                                                                                                      |
| **Known issues link**    | [GitHub release notes or doc link]                                                                                                                                            |

**Setup steps:**

1. Upload release build to App Store Connect
2. Create "Finance Beta" external test group
3. Add beta app description and feedback URL
4. Submit for TestFlight review
5. Once approved, generate public link or add testers by email
6. Send link to accepted testers

### Android (Google Play Internal Testing)

| Item                    | Detail                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| **Distribution method** | Internal testing track (or closed testing)                            |
| **Track name**          | "Beta Testers"                                                        |
| **Build version**       | [human fills in]                                                      |
| **Invite method**       | Google Group or email list + opt-in link                              |
| **Review required**     | No for internal track; yes for closed testing                         |
| **Listing**             | Internal testing uses a simplified listing — include beta description |

**Setup steps:**

1. Upload signed AAB to internal testing track in Play Console
2. Create Google Group for beta testers (or use email list)
3. Add tester emails to the testing track
4. Share opt-in URL with testers
5. Provide install instructions (opt in → download from Play Store)

### Web (Staging PWA)

| Item                     | Detail                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Distribution method**  | Staging URL with auth-gated account allowlist                                    |
| **URL**                  | [staging.finance-app.com or equivalent]                                          |
| **Access control**       | Set `VITE_BETA_ALLOWED_EMAILS` / `BETA_ALLOWED_EMAILS` to approved tester emails |
| **Browser targets**      | Chrome 120+, Safari 17+, Firefox 120+, Edge 120+                                 |
| **Install instructions** | Provide PWA install instructions (Add to Home Screen)                            |

**Setup steps:**

1. Deploy latest build to staging environment
2. Configure `BETA_ALLOWED_EMAILS` in the staging GitHub Environment (comma-separated approved account emails)
3. Test allowed and denied account sign-in on target browsers
4. Send staging URL to approved web testers; testers sign in with their allowlisted account email

### Windows (MSIX Pre-Release)

| Item                     | Detail                                       |
| ------------------------ | -------------------------------------------- |
| **Distribution method**  | Direct MSIX download or Microsoft Store beta |
| **Package**              | Signed MSIX with valid certificate           |
| **Minimum OS**           | Windows 11                                   |
| **Install instructions** | Sideload instructions (if not in Store)      |

**Setup steps:**

1. Build and sign MSIX package
2. Host download link (GitHub Release, cloud storage, or website)
3. Provide Windows 11 sideload instructions if not using Store
4. Test on clean Windows 11 installation

---

## 3. Recruitment Post Publishing Plan

### Day 1: Primary Posts

| Time        | Channel                  | Post                                            | Owner |
| ----------- | ------------------------ | ----------------------------------------------- | ----- |
| 9:00 AM ET  | Twitter/X                | Beta announcement thread (5 tweets)             | Human |
| 10:00 AM ET | Reddit r/personalfinance | Recruitment post                                | Human |
| 11:00 AM ET | Reddit r/privacy         | Recruitment post (privacy-focused)              | Human |
| 12:00 PM ET | LinkedIn                 | Professional beta announcement                  | Human |
| 2:00 PM ET  | Personal network         | Email outreach (template from recruitment plan) | Human |

### Day 2: Secondary Posts

| Time        | Channel               | Post                                     | Owner |
| ----------- | --------------------- | ---------------------------------------- | ----- |
| 10:00 AM ET | Reddit r/ynab         | Recruitment post (budgeting-focused)     | Human |
| 11:00 AM ET | Reddit r/adhd         | Recruitment post (accessibility-focused) | Human |
| 12:00 PM ET | Reddit r/budgeting    | Recruitment post                         | Human |
| 2:00 PM ET  | Product Hunt Upcoming | Page submission                          | Human |

### Day 3: Technical Posts

| Time        | Channel            | Post              | Owner |
| ----------- | ------------------ | ----------------- | ----- |
| 10:00 AM ET | Hacker News        | Show HN post      | Human |
| 11:00 AM ET | GitHub Discussions | Beta announcement | Human |

### Ongoing (Days 4–14)

- Monitor and respond to comments on all posts
- Follow up with applicants within 48 hours
- Accept/reject applicants based on screening criteria
- Send welcome emails to accepted testers in batches

---

## 4. Beta Feedback Infrastructure

### Feedback Collection Channels

| Channel                   | Purpose                                                      | Who Uses It       |
| ------------------------- | ------------------------------------------------------------ | ----------------- |
| **In-app feedback**       | Bug reports, UX issues, feature requests from within the app | All testers       |
| **Email (beta@domain)**   | General feedback, private concerns, accessibility issues     | All testers       |
| **GitHub Discussions**    | Public discussion, feature requests, community help          | Technical testers |
| **Feedback survey**       | Structured end-of-beta feedback (sent at week 2–3)           | All testers       |
| **Weekly check-in email** | Open-ended pulse check                                       | All testers       |

### GitHub Discussions Category Structure

| Category                | Icon          | Purpose                                        | Access                       |
| ----------------------- | ------------- | ---------------------------------------------- | ---------------------------- |
| **📣 Announcements**    | Megaphone     | Beta updates, new builds, known issues         | Team only (post), all (read) |
| **💬 General**          | Speech bubble | Open discussion, first impressions, tips       | All                          |
| **🐛 Bug Reports**      | Bug           | Structured bug reports with reproduction steps | All                          |
| **💡 Feature Requests** | Lightbulb     | Structured feature requests with use case      | All                          |
| **❓ Questions**        | Question mark | How-to questions, confusion points             | All                          |

### Bug Report Template

```markdown
### What happened?

[Describe what you experienced]

### What did you expect?

[Describe what you expected to happen]

### Steps to reproduce

1. [Step 1]
2. [Step 2]
3. [Step 3]

### Platform & version

- Platform: [iOS / Android / Web / Windows]
- App version: [from Settings]
- Device: [e.g., iPhone 15 Pro, Pixel 8, Chrome on Mac]

### Screenshots

[Attach if helpful — be careful not to include real financial data]
```

### Feature Request Template

```markdown
### What would you like?

[Describe the feature]

### Why is this important to you?

[What problem does it solve?]

### How do you handle this today?

[Current workaround, if any]

### Which platform(s)?

[iOS / Android / Web / Windows / All]
```

---

## 5. Weekly Feedback Summary Template

Published internally every Friday during the beta period:

```markdown
# Beta Feedback Summary — Week [N]

**Period:** [Date] to [Date]
**Active testers:** [N] of [N] accepted
**New bugs reported:** [N]
**New feature requests:** [N]

## Top Themes This Week

### 1. [Theme]

[Summary of feedback pattern. Number of mentions. Severity.]

### 2. [Theme]

[Summary]

### 3. [Theme]

[Summary]

## Notable Quotes (with permission)

> "[Quote]" — [Tester ID or first name], [Platform]

## Bugs Filed

| Bug           | Platform   | Severity                   | Issue # |
| ------------- | ---------- | -------------------------- | ------- |
| [Description] | [Platform] | [Critical/High/Medium/Low] | [#]     |

## Feature Requests

| Request       | Mentions | Priority Signal      |
| ------------- | -------- | -------------------- |
| [Description] | [N]      | [Strong/Medium/Weak] |

## Platform-Specific Notes

- **iOS:** [Notes]
- **Android:** [Notes]
- **Web:** [Notes]
- **Windows:** [Notes]

## Accessibility Feedback

[Dedicated section for accessibility-related feedback]

## Action Items

- [ ] [Action item for engineering]
- [ ] [Action item for design]
- [ ] [Action item for marketing]

## Metrics

- Testers who opened app this week: [N]
- Bug reports: [N]
- Feature requests: [N]
- Positive mentions: [N]
- Friction points: [N]
```

---

## 6. Tester Engagement Plan

### Weekly Cadence

| Day       | Activity                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Monday    | Post weekly update in GitHub Discussions (new build, known issues, what to test)                      |
| Wednesday | Quick poll or question in Discussions ("What do you use most: quick entry, budget view, or reports?") |
| Friday    | Publish weekly feedback summary (internal)                                                            |

### Engagement Touchpoints

| Touchpoint      | Timing        | Purpose                                                 |
| --------------- | ------------- | ------------------------------------------------------- |
| Welcome email   | On acceptance | Onboard, set expectations, provide install links        |
| Week 1 check-in | Day 7         | Pulse check, address initial friction                   |
| Mid-beta update | Day 14        | Share what we've learned, what we've fixed, what's next |
| Feedback survey | Day 14–21     | Structured feedback collection                          |
| Thank-you email | End of beta   | Genuine thanks, share key learnings, preview launch     |

### Re-Engagement (For Inactive Testers)

If a tester hasn't provided feedback after 10 days:

> **Subject:** Quick check-in — how's Finance working for you?
>
> Hi [Name],
>
> Just checking in. If you've had a chance to try Finance, we'd love to hear your thoughts — even a one-sentence impression helps.
>
> If you haven't had time yet, no worries. The beta is open for [N] more weeks.
>
> If something stopped you from getting started (install issues, confusing setup, etc.), that's feedback too — we'd like to fix it.
>
> Thanks,
> The Finance team

**Note:** Send once only. No follow-up nagging. Respect people's time.

---

## 7. Escalation & Issue Routing

### Severity Levels

| Severity     | Definition                                  | Response SLA | Example                                        |
| ------------ | ------------------------------------------- | ------------ | ---------------------------------------------- |
| **Critical** | Data loss, crash on launch, security issue  | 4 hours      | App crashes on every launch on Android 14      |
| **High**     | Core flow blocked, major UX issue           | 24 hours     | Cannot save transactions; budget math is wrong |
| **Medium**   | Feature works but with significant friction | 72 hours     | Category picker scrolls incorrectly on iPad    |
| **Low**      | Minor cosmetic or polish issue              | Next release | Label truncated on small screen                |

### Routing

| Feedback Type           | Route To                                                       | Action                      |
| ----------------------- | -------------------------------------------------------------- | --------------------------- |
| Bug report              | Engineering (GitHub Issue)                                     | Triage and assign           |
| Feature request         | Product (GitHub Discussion → Issue if validated)               | Discuss and prioritize      |
| Accessibility issue     | Engineering + Design (GitHub Issue with `accessibility` label) | Priority triage             |
| Privacy concern         | Architect + Legal                                              | Immediate review            |
| Positive feedback       | Marketing (testimonial pipeline)                               | Request permission to quote |
| Confusion / UX friction | Design + Marketing (onboarding audit)                          | Document for Sprint 4 audit |

---

## 8. Beta Success Milestones

### Week 1 Milestones

- [ ] ≥30 testers onboarded and confirmed install
- [ ] ≥10 bug reports received (indicates active testing)
- [ ] ≥3 platforms with active testers
- [ ] No critical/blocking issues unresolved >24 hours
- [ ] First weekly feedback summary published

### Week 2 Milestones

- [ ] ≥40 testers actively using the app (opened in past 7 days)
- [ ] ≥3 accessibility testers providing feedback
- [ ] Bug backlog triaged (all critical/high assigned)
- [ ] At least one bug-fix beta build released

### Week 3–4 Milestones

- [ ] Feedback survey sent and ≥60% response rate
- [ ] ≥5 testimonial quotes collected (with permission)
- [ ] Key friction points documented for marketing insights (Sprint 4)
- [ ] NPS or satisfaction score collected
- [ ] Beta insights report draft started

### End of Beta

- [ ] All critical bugs resolved or documented with workarounds
- [ ] Beta feedback report completed (Sprint 4 deliverable)
- [ ] Testers thanked with genuine, personalized gratitude
- [ ] Launch timeline communicated to testers
- [ ] Opt-in for launch notification collected

---

## References

- [Beta Recruitment Plan](beta-recruitment-plan.md) — Recruitment copy, channels, screening
- [Brand Voice Guide](brand-voice-guide.md) — Tone for all tester communications
- [Product Identity](../design/product-identity.md) — Feature list for beta scope
- [Screenshot Spec](screenshot-spec.md) — Visual standards for any beta marketing
