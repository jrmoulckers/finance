# Marketing Sprint Plan — Sprints 1–5

> **Status:** ACTIVE
> **Created:** 2025-07-26
> **Owner:** Marketing Strategist
> **Purpose:** Define marketing, GTM, and content tasks aligned with engineering milestones for the 5 sprints leading to v1.0 launch
> **Preferred location:** `docs/business/marketing-plan-sprints-1-5.md` (create `docs/business/` directory and move this file)
> **Related:** [Product Identity](../design/product-identity.md) · [Store Metadata](../guides/store-metadata.md) · [Beta Testing](../guides/beta-testing.md) · [Launch Checklist](../guides/launch-checklist.md) · [Onboarding Strategy](../guides/onboarding-strategy.md) · [Launch Readiness Plan](launch-readiness-plan.md)

---

## Strategic Context

Finance is approaching v1.0 readiness with 22 of 71 issues remaining. The engineering team has built the sync engine, platform-native apps across iOS/Android/Web/Windows, security hardening, compliance documentation, and design token infrastructure. Marketing must now execute a phased ramp from internal preparation through beta program to public launch.

### Marketing Principles (Non-Negotiable)

- **Privacy-first claims must be technically accurate** — verified against architecture docs
- **No dark patterns** — no artificial urgency, guilt-based upsells, or manipulative tactics
- **Inclusive language** — no assumptions about income level, financial literacy, or ability
- **Transparent** — clear about what data is collected, where it lives, and why
- **User autonomy** — growth tactics respect user choice; no deceptive onboarding

### Key Differentiators to Emphasize

| Differentiator | Claim | Technical Basis |
|---|---|---|
| **Offline-first** | "Your money never leaves your device unless you choose" | SQLCipher AES-256 at rest, PowerSync opt-in sync |
| **Expertise-tiered UI** | "Works with your brain — adapts to your comfort level" | 3-tier system changes terminology, features, charts |
| **Non-judgmental** | "Facts, not judgments — observes and informs, never shames" | Product-wide UX principle, no guilt-based copy |
| **Native per platform** | "Truly native on iOS, Android, Web, and Windows" | SwiftUI, Jetpack Compose, React, Compose Desktop |
| **ADHD-friendly** | "Designed for cognitive accessibility" | Reduced motion, simplified views, 30-second habit loop |
| **Free forever (core)** | "Complete financial tracker, free forever" | No artificial feature gating on core features |

### Target Personas (from design/personas.md)

1. **Alex** — Intentional Spender (28, employed, wants clarity without friction)
2. **Jordan** — Goal Setter (35, teacher, wants projections and motivation)
3. **Casey** — Accessibility-First User (24, ADHD, overwhelmed by existing tools)
4. **Sam** — Couple's Coordinator (30, shared finances — V1.1 target)

---

## Sprint 1: Foundation & Brand Readiness

> **Theme:** Lock down brand assets, finalize store copy, and prepare the marketing infrastructure
> **Engineering context:** Platform data wiring in progress, sync pipeline active, security hardening underway

### Task 1.1: Brand Voice Guide & Messaging Framework

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-brand-voice-guide`

**Deliverables:**
- `docs/business/brand-voice-guide.md` — Tone, vocabulary, do/don't examples
- Messaging matrix: 3 key messages × 4 personas (Alex, Jordan, Casey, Sam)
- Elevator pitch: 15-second, 30-second, and 60-second versions
- Tagline candidates (5–7 options for human review)

**Acceptance criteria:**
- [ ] Every message passes the "non-judgmental" test — no shame, no guilt, no artificial urgency
- [ ] Privacy claims verified against ADR-0003 (local storage) and ADR-0004 (auth/security)
- [ ] Accessibility messaging validated against actual WCAG 2.2 AA implementation
- [ ] Language is inclusive — no assumptions about income, financial literacy, or ability

**Dependencies:** None (product-identity.md and personas.md already exist)

---

### Task 1.2: ASO Keyword Research & Store Listing Refinement

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-aso-keyword-research`

**Deliverables:**
- `docs/business/aso-keyword-research.md` — Keyword analysis across all 4 stores
- Refined iOS keywords (100-char limit, currently at 74 — room for optimization)
- Refined Android tags and short description
- Competitive keyword gap analysis vs. YNAB, Monarch, Copilot, Goodbudget
- Updated store-metadata.md with optimized copy (PR to existing file)

**Acceptance criteria:**
- [ ] iOS keyword string uses ≥90 of 100 available characters
- [ ] Android short description A/B test variants drafted (2–3 options)
- [ ] Keywords include accessibility-related terms (e.g., "accessible," "ADHD-friendly")
- [ ] No competitor brand names used as keywords (policy violation risk)

**Dependencies:** Existing `docs/guides/store-metadata.md` as baseline

---

### Task 1.3: Screenshot Planning & Copy Overlay Spec

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-screenshot-spec`

**Deliverables:**
- `docs/business/screenshot-spec.md` — Detailed spec for all screenshot sets
- Copy overlays for each of the 5 required screens (Dashboard, Quick Entry, Budgets, Reports, Goals)
- Device frame and background color recommendations per platform
- Sample data specification (realistic, diverse, inclusive amounts and names)

**Acceptance criteria:**
- [ ] Overlay text ≤ 6 words per screenshot (readability at store thumbnail size)
- [ ] Sample data uses diverse names and realistic-but-not-aspirational amounts
- [ ] Dark mode screenshot variants specified (required for iOS, recommended for Android)
- [ ] Accessibility scenario screenshot included (e.g., large text mode)

**Dependencies:** Engineering must have working UI on at least 2 platforms for reference; screenshots themselves captured in Sprint 3 from release builds

---

### Task 1.4: Competitive Positioning Document

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-competitive-positioning`

**Deliverables:**
- `docs/business/competitive-positioning.md` — Detailed competitive analysis
- Feature comparison matrix: Finance vs. YNAB vs. Monarch vs. Copilot vs. Goodbudget vs. PocketGuard
- "Why Finance?" one-pager for press kit and landing page
- Privacy differentiation explainer (technical depth for press, plain language for users)

**Acceptance criteria:**
- [ ] All competitor claims are factual and current (verified against their public pages)
- [ ] Positioning emphasizes what Finance does differently, not what competitors do wrong
- [ ] Privacy comparison cites specific technical implementations (SQLCipher, no ATT, etc.)
- [ ] Includes a "Who Finance is NOT for" section (honesty builds trust)

**Dependencies:** None (product-identity.md § 9 has initial comparison table)

---

## Sprint 2: Content Pipeline & Beta Preparation

> **Theme:** Build content engine, prepare beta recruitment materials, and draft launch communications
> **Engineering context:** Platform apps nearing feature-complete, sync validation in progress, beta builds approachable

### Task 2.1: Beta Recruitment Campaign

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-beta-recruitment`

**Deliverables:**
- `docs/business/beta-recruitment-plan.md` — Channel strategy and timeline
- Beta landing page copy (for human to build/deploy)
- Recruitment messages for each channel:
  - Reddit (r/personalfinance, r/budgeting, r/ynab, r/privacy, r/adhd)
  - Hacker News (Show HN draft)
  - Twitter/X thread draft
  - Product Hunt "Upcoming" page copy
  - Personal/professional network outreach template
- Screening questionnaire (ensures persona diversity and platform coverage)
- Beta tester welcome email sequence (3 emails: welcome, week-1 check-in, feedback request)

**Acceptance criteria:**
- [ ] Recruitment targets 40+ testers across 4 platforms (per beta-testing.md § 1)
- [ ] Screening ensures coverage: ≥3 accessibility testers, all 3 expertise tiers, ≥2 per platform
- [ ] All recruitment copy is honest — no "exclusive" or "limited spots" artificial urgency
- [ ] Welcome sequence is opt-in and clearly explains what testers' data is used for
- [ ] Reddit posts comply with each subreddit's self-promotion rules

**Dependencies:**
- Engineering: Beta builds available on TestFlight (iOS), internal track (Android), staging (Web), MSIX (Windows)
- Issue #653 (App Store submission prep) should be in progress

---

### Task 2.2: Content Calendar & Blog Strategy

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-content-calendar`

**Deliverables:**
- `docs/business/content-calendar.md` — 12-week content calendar (Sprint 2 through post-launch)
- 3 blog post drafts (long-form, 1200–1800 words each):
  1. **"Why We Built Finance Offline-First"** — Technical story, privacy rationale, Signal comparison
  2. **"Budgeting Without the Guilt Trip"** — Non-judgmental design philosophy, Casey persona story
  3. **"Your Financial App Shouldn't Need Your Bank Password"** — Privacy manifesto, competitive positioning
- Social media content templates (10 posts for Twitter/X, 5 for LinkedIn)

**Acceptance criteria:**
- [ ] Blog posts are technically accurate (reviewed against architecture docs)
- [ ] Content calendar has clear ownership (who writes) and deadlines
- [ ] Social posts use consistent hashtags: #PrivacyFirst #OfflineFirst #Budgeting
- [ ] No blog post makes claims about features that aren't shipped yet
- [ ] Content is educational and valuable even for non-Finance users

**Dependencies:** None (content can be drafted from existing docs)

---

### Task 2.3: Press Kit Assembly

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-press-kit`

**Deliverables:**
- `docs/business/press-kit/` directory containing:
  - `press-release-v1.md` — Launch press release draft
  - `fact-sheet.md` — One-page company/product fact sheet
  - `founder-bio.md` — Template for founder/team bios
  - `media-assets.md` — Inventory of logos, icons, screenshots (with download links TBD)
  - `faq-press.md` — Anticipated press questions with approved answers
- Press release follows AP style, includes privacy-first angle, and avoids superlatives

**Acceptance criteria:**
- [ ] Press release includes concrete differentiators (not generic "revolutionary app" language)
- [ ] Fact sheet covers: platforms, pricing, privacy architecture, accessibility, open source (BSL)
- [ ] FAQ includes answers for: "How do you make money?", "Where is data stored?", "Is it really free?"
- [ ] All assets specify licensing terms for media use
- [ ] Press release is drafted but NOT sent — human decides timing and distribution

**Dependencies:** Brand voice guide (Task 1.1), competitive positioning (Task 1.4)

---

### Task 2.4: Privacy-as-Marketing Messaging Spec

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-privacy-messaging`

**Deliverables:**
- `docs/business/privacy-marketing-messaging.md` — Privacy messaging framework
- "Privacy card" — 5-sentence summary suitable for app store descriptions and landing pages
- Technical accuracy matrix: every privacy marketing claim mapped to its architecture verification
- Comparison messaging: Finance vs. apps that require bank connections (Plaid-dependent competitors)
- In-app privacy explainer copy for onboarding Step 1 (Welcome screen)

**Acceptance criteria:**
- [ ] Every claim has a citation to a specific ADR, audit doc, or code reference
- [ ] Claims use "currently" or "as of v1.0" language to avoid future-proofing violations
- [ ] Messaging explains *what users gain* from privacy (control, peace of mind), not just what's absent
- [ ] No FUD (fear, uncertainty, doubt) about competitors — focus on Finance's affirmative choices
- [ ] Aligned with issue #340 (Privacy-as-premium marketing)

**Dependencies:** Architecture docs (ADR-0003, ADR-0004), privacy-policy.md, privacy-audit-v1.md

---

## Sprint 3: Beta Launch & Screenshot Capture

> **Theme:** Launch beta program, capture production screenshots, begin community building
> **Engineering context:** Beta builds deployed, core flows validated by internal testing, app approaching feature-freeze

### Task 3.1: Beta Program Launch Execution

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-beta-launch`

**Deliverables:**
- Beta recruitment posts published (Reddit, HN, Twitter — human executes, we provide copy)
- Product Hunt "Upcoming" page submitted (human executes)
- TestFlight and Play Store beta links distributed to recruited testers
- Web staging URL shared with web testers (with access codes)
- Windows MSIX pre-release distributed
- Beta feedback tracker set up (GitHub Discussions category or dedicated board)
- Weekly beta feedback summary template

**Acceptance criteria:**
- [ ] ≥40 testers across all 4 platforms (per beta-testing.md requirements)
- [ ] At least 3 accessibility testers actively participating
- [ ] Feedback collection mechanism works on all platforms (in-app + external)
- [ ] Tester NDA/agreement covers: data stays on-device, feedback may be quoted anonymously
- [ ] First weekly feedback summary published within 7 days of beta launch

**Dependencies:**
- Engineering: Beta builds on all 4 platform channels
- Issue #653 complete (App Store submission prep for TestFlight)
- Beta recruitment materials from Task 2.1

---

### Task 3.2: Production Screenshot Capture & Store Asset Creation

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-screenshot-capture`

**Deliverables:**
- Screenshot sets for all platforms (per store-metadata.md dimensions):
  - iOS: iPhone 16 Pro Max (1320×2868) + iPad Pro 13" (2064×2752)
  - Android: Phone (1080×1920) + Tablet (1200×1920) + Feature Graphic (1024×500)
  - Windows: Desktop (1920×1080)
  - Web: OG image (1200×630)
- Each screenshot includes copy overlay text (from Task 1.3 spec)
- Dark mode variants for iOS and Android
- App icon verified at all required sizes per platform

**Acceptance criteria:**
- [ ] All screenshots from release builds with realistic sample data (never dev builds)
- [ ] Sample data uses diverse, inclusive names and realistic amounts
- [ ] Screenshots cover the 5 required screens in order: Dashboard, Quick Entry, Budgets, Reports, Goals
- [ ] Copy overlays are readable at 50% thumbnail size
- [ ] File names follow platform conventions and are stored in correct directories

**Dependencies:**
- Engineering: Feature-frozen release builds on all platforms
- Screenshot spec from Task 1.3
- Sample data set defined and loaded into the app

---

### Task 3.3: Community Channel Setup

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-community-setup`

**Deliverables:**
- `docs/business/community-strategy.md` — Community building plan
- GitHub Discussions category structure:
  - 📣 Announcements (team only)
  - 💬 General (open discussion)
  - 💡 Feature Requests (structured template)
  - 🐛 Bug Reports (structured template — mirrors beta feedback)
  - 🎓 Tips & Guides (community knowledge sharing)
- Community guidelines draft (aligned with CODE_OF_CONDUCT.md)
- Social media account naming and bio recommendations (human creates accounts)

**Acceptance criteria:**
- [ ] Discussion categories are actionable — templates guide users to provide useful information
- [ ] Community guidelines emphasize: no financial advice, privacy respect, inclusive language
- [ ] Social bios consistently use the core tagline and link to the privacy policy
- [ ] Plan includes moderation strategy (who moderates, escalation path, response SLA)

**Dependencies:** CODE_OF_CONDUCT.md (already exists)

---

## Sprint 4: Beta Feedback, Conversion Optimization & Launch Prep

> **Theme:** Incorporate beta feedback into marketing, finalize store listings, prepare launch communications
> **Engineering context:** Beta feedback being triaged, bug fixes in progress, approaching release candidate

### Task 4.1: Beta Feedback → Marketing Insights Report

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-beta-insights`

**Deliverables:**
- `docs/business/beta-insights-report.md` — Marketing insights distilled from beta feedback
- Top 5 "aha moments" from beta testers (quotes for social proof, with consent)
- Common first-impression reactions categorized by persona type
- Onboarding completion rate analysis and friction points
- Feature highlight priorities based on tester enthusiasm (what they mention unprompted)
- Recommendations for store description emphasis based on what resonates

**Acceptance criteria:**
- [ ] All tester quotes used with explicit permission
- [ ] Insights cover all 4 platforms — not biased toward one ecosystem
- [ ] Friction points reported to engineering with specific recommendations
- [ ] Report includes "what surprised us" section for authentic launch storytelling
- [ ] NPS or satisfaction score from beta testers included (if surveyed)

**Dependencies:**
- Beta program running for ≥2 weeks (from Task 3.1)
- Beta feedback summaries collected weekly

---

### Task 4.2: Final Store Listing Optimization

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-final-store-listings`

**Deliverables:**
- Final store-metadata.md updates based on beta feedback and ASO learnings
- A/B test variants for:
  - iOS promotional text (170 chars — 2 variants)
  - Android short description (80 chars — 2 variants)
  - First screenshot order (Dashboard-first vs. Privacy-first)
- "What's New" text for v1.0 release (distinct from v0.1.0 beta notes)
- Platform-specific feature highlights (widgets for iOS, Material You for Android, keyboard shortcuts for Web, Snap Layouts for Windows)
- All `{{PLACEHOLDER}}` values in store-metadata.md resolved or flagged for human

**Acceptance criteria:**
- [ ] All character limits verified (iOS subtitle ≤30, Android short ≤80, keywords ≤100)
- [ ] Privacy labels / data safety sections match actual app behavior post-beta
- [ ] Release notes use plain language (no jargon, no version numbers in prominent text)
- [ ] Support URL, privacy policy URL, and terms of service URL are live and tested
- [ ] Store listings pass a readability check (Flesch-Kincaid ≤ 8th grade level)

**Dependencies:**
- Beta insights (Task 4.1)
- Engineering: Privacy policy and terms of service hosted at public URLs (issue #639)
- Screenshots from Task 3.2

---

### Task 4.3: Launch Communications Package

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-launch-comms`

**Deliverables:**
- Finalized press release (from Task 2.3 draft, updated with beta tester quotes and final feature list)
- Product Hunt launch plan:
  - Tagline, description, first comment draft, maker bio
  - Gallery images (5 — hero + 4 feature highlights)
  - Launch day checklist and engagement strategy
- Social media launch sequence:
  - T-7 days: Teaser posts ("Something private is coming...")
  - T-3 days: Feature reveal thread (5-part Twitter/X thread)
  - T-1 day: "Tomorrow" post with screenshot carousel
  - T-0: Launch announcement across all channels
  - T+1 through T+7: Daily follow-up posts highlighting one feature each
- Email announcement to beta testers: "You helped build this — Finance is live"
- Hacker News "Show HN" post draft

**Acceptance criteria:**
- [ ] Launch sequence does NOT use artificial urgency ("limited time!" "act now!")
- [ ] Product Hunt first comment is authentic and personal — explains the "why" behind Finance
- [ ] HN post leads with the technical angle (KMP, SQLCipher, PowerSync, offline-first)
- [ ] Beta tester email genuinely thanks them and doesn't ask for App Store reviews (let them decide)
- [ ] All launch copy reviewed against brand voice guide (Task 1.1)

**Dependencies:**
- Press kit (Task 2.3), brand voice guide (Task 1.1)
- Engineering: Confirmed v1.0 release date (or release candidate milestone)

---

### Task 4.4: Onboarding-to-Retention Messaging Audit

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-onboarding-audit`

**Deliverables:**
- `docs/business/onboarding-messaging-audit.md` — Review of all in-app copy from first launch through day 7
- Audit of onboarding flow copy against brand voice guide and non-judgmental principles
- Empty-state messaging review (what users see before they've entered any data)
- Notification copy review (daily snapshot, weekly insight, streak messages)
- Conversion point messaging (free → premium upsell touchpoints, if any exist)

**Acceptance criteria:**
- [ ] No guilt-based language anywhere in the first 7 days of use
- [ ] Empty states are encouraging and actionable ("Add your first transaction — it takes 3 taps")
- [ ] Notification copy previewed by at least 1 person who identifies as a Casey persona
- [ ] Any premium upsell is informational ("Premium includes X, Y, Z") not manipulative
- [ ] Aligned with issues #385 (Two-path onboarding) and #384 (Opt-in notifications)

**Dependencies:**
- Onboarding strategy doc (already exists)
- Engineering: Onboarding flow implemented and testable
- Issues #385, #384, #379 should be in progress or complete

---

## Sprint 5: Launch Execution & Post-Launch Growth

> **Theme:** Execute launch, monitor reception, begin post-launch growth initiatives
> **Engineering context:** v1.0 release candidate approved, app store submissions in progress, launch day war room planned

### Task 5.1: Launch Day Execution Checklist

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-launch-day`

**Deliverables:**
- `docs/business/launch-day-marketing-checklist.md` — Minute-by-minute marketing timeline for launch day
- Pre-launch verification:
  - [ ] All store listings live and correct
  - [ ] Privacy policy and terms of service URLs accessible
  - [ ] Landing page / website live with correct download links
  - [ ] Social media accounts ready with scheduled posts
  - [ ] Product Hunt page ready to launch
  - [ ] Press release distributed (human executes)
  - [ ] Beta testers notified
- Launch window timeline:
  - [ ] Product Hunt launch at optimal time (12:01 AM PT)
  - [ ] Social media posts go live
  - [ ] HN "Show HN" posted
  - [ ] Reddit announcements posted (respecting subreddit rules)
  - [ ] Monitor app store review status (iOS can take 24–48 hrs)
- Post-launch (first 24 hours):
  - [ ] Monitor social media mentions and respond
  - [ ] Track App Store / Play Store review submissions
  - [ ] Address any negative feedback promptly and empathetically
  - [ ] Coordinate with engineering on any launch-day issues

**Acceptance criteria:**
- [ ] Checklist aligns with engineering launch-readiness-plan.md timeline
- [ ] Rollback / "pause marketing" trigger defined (if engineering needs to halt rollout)
- [ ] Response templates ready for common questions and feedback
- [ ] Someone is explicitly assigned to each checklist item (no "TBD" owners)

**Dependencies:**
- Engineering: v1.0 approved and live on all stores
- All prior sprint deliverables complete
- Launch readiness plan GO decision

---

### Task 5.2: Post-Launch Growth Strategy

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-growth-strategy`

**Deliverables:**
- `docs/business/growth-strategy-post-launch.md` — 90-day post-launch growth plan
- Organic growth channels:
  - **Content marketing:** Publish blog posts from Sprint 2 on a weekly cadence
  - **SEO:** Landing page optimization for "private budget app," "offline expense tracker," "ADHD-friendly finance app"
  - **Community:** Active participation in r/personalfinance, r/budgeting, r/privacy (helpful, not promotional)
  - **Open source visibility:** README badges, GitHub topics, "built with KMP" community showcases
- Referral strategy:
  - Word-of-mouth program design (non-manipulative — no "invite 5 friends to unlock features")
  - "Share your setup" social template (users share their dashboard config, not financial data)
- Partnership opportunities:
  - ADHD/neurodivergent community collaborations (authentic, not performative)
  - Privacy advocacy organizations
  - Financial literacy nonprofits
  - KMP developer community (technical credibility)
- Metrics framework (privacy-preserving):
  - Downloads per platform (from store dashboards — no in-app tracking)
  - App Store ratings and review sentiment
  - Beta-to-GA conversion (how many beta testers remain active)
  - Organic search ranking for target keywords
  - Community growth (GitHub stars, Discussion activity)

**Acceptance criteria:**
- [ ] No growth tactics require invasive user tracking
- [ ] Referral strategy respects user autonomy — no forced sharing or social pressure
- [ ] Partnership outreach is genuine — not "use community for marketing"
- [ ] Metrics can be measured without adding tracking SDKs to the app
- [ ] Plan includes "what not to do" section (paid ads with misleading creative, influencer deals that misrepresent the product)

**Dependencies:** Launch complete, initial download/rating data available

---

### Task 5.3: App Store Rating & Review Strategy

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-review-strategy`

**Deliverables:**
- `docs/business/review-strategy.md` — Ethical approach to app store reviews
- In-app review prompt strategy:
  - **Timing:** After a positive moment (goal milestone reached, 7-day streak, first successful budget month)
  - **Frequency:** Maximum once per 90 days, never on first session
  - **Dismissal:** Single tap to dismiss, never shown again for 90 days
  - **No gating:** Never condition features or functionality on reviews
- Review response templates:
  - Positive review: Thank them, highlight a feature they mentioned
  - Constructive feedback: Acknowledge, explain if it's planned, link to feature request
  - Negative review: Empathize, apologize for friction, offer direct support channel
  - Privacy concern: Clear, specific response about data practices with docs link
- Store review monitoring cadence (daily for first 2 weeks, then weekly)

**Acceptance criteria:**
- [ ] Review prompt never appears during a frustrating moment (error, over-budget notification)
- [ ] Prompt uses neutral language ("Enjoying Finance? A review helps others find us" — not "Rate us 5 stars!")
- [ ] No differential treatment based on predicted rating (no "If you like us, leave a review; if not, email us")
- [ ] Response templates are warm, specific, and human — not corporate boilerplate
- [ ] Aligned with issue #384 (Opt-in notification system) for prompt timing

**Dependencies:**
- Engineering: StoreKit 2 / Google Play In-App Review API integration
- App live on stores with initial reviews

---

### Task 5.4: Week-1 Retrospective & Sprint 6+ Planning

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-launch-retro`

**Deliverables:**
- `docs/business/launch-retrospective-week-1.md` — Marketing retrospective
- What worked: channels that drove downloads, content that resonated, community engagement
- What didn't: channels with low ROI, messaging that didn't land, unexpected friction
- User acquisition cost per channel (if any paid was used)
- Review sentiment analysis (themes from first week of App Store/Play Store reviews)
- Recommendations for Sprint 6+ marketing priorities:
  - Double down on effective channels
  - Content topics informed by real user questions
  - Feature marketing priorities based on what users love most
  - Localization / internationalization marketing prep (if applicable)

**Acceptance criteria:**
- [ ] Retrospective is honest — includes failures, not just wins
- [ ] Data-driven where possible, clearly labeled as anecdotal where not
- [ ] Includes input from engineering team (what they heard from users)
- [ ] Sprint 6+ recommendations are actionable and time-bounded
- [ ] Identifies any brand voice adjustments needed based on real-world reception

**Dependencies:**
- v1.0 live for ≥7 days
- App store analytics dashboards accessible

---

## Sprint Summary Matrix

| Sprint | Theme | Critical Tasks | Medium Tasks | Key Deliverables |
|--------|-------|---------------|-------------|-----------------|
| **1** | Foundation & Brand | 2 (Voice Guide, ASO) | 2 (Screenshots, Positioning) | Brand voice guide, keyword research, screenshot spec, competitive analysis |
| **2** | Content & Beta Prep | 2 (Beta Recruitment, Privacy Messaging) | 2 (Content Calendar, Press Kit) | Beta materials, 3 blog posts, press kit, privacy messaging framework |
| **3** | Beta Launch & Assets | 2 (Beta Launch, Screenshots) | 1 (Community) | Live beta program, production screenshots, community channels |
| **4** | Feedback & Launch Prep | 2 (Beta Insights, Store Listings) | 2 (Launch Comms, Onboarding Audit) | Final store listings, launch package, onboarding copy review |
| **5** | Launch & Growth | 1 (Launch Day) | 3 (Growth, Reviews, Retro) | Launch execution, 90-day growth plan, review strategy, retrospective |

---

## Issue Dependency Map

```
Sprint 1                Sprint 2                Sprint 3                Sprint 4                Sprint 5
─────────               ─────────               ─────────               ─────────               ─────────
1.1 Brand Voice ──────► 2.3 Press Kit ─────────────────────────────────► 4.3 Launch Comms ─────► 5.1 Launch Day
1.2 ASO Research ─────► 2.2 Content Calendar                            4.2 Final Listings
1.3 Screenshot Spec ──────────────────────────► 3.2 Screenshot Capture ► 4.2 Final Listings
1.4 Comp. Positioning ► 2.4 Privacy Messaging
                        2.1 Beta Recruitment ──► 3.1 Beta Launch ──────► 4.1 Beta Insights
                                                 3.3 Community Setup                            5.2 Growth Strategy
                                                                         4.4 Onboarding Audit ► 5.3 Review Strategy
                                                                                                 5.4 Retrospective
```

---

## Existing Issue Alignment

| GitHub Issue | Sprint Relevance | Marketing Action |
|---|---|---|
| #653 — App Store submission prep (iOS) | Sprint 1–3 | Store listings, screenshots, privacy labels |
| #639 — Privacy policy content in app | Sprint 2–4 | In-app privacy messaging, store compliance |
| #340 — Privacy-as-premium marketing | Sprint 2 | Privacy messaging framework (Task 2.4) |
| #338 — Premium subscription IAP | Sprint 4–5 | Conversion messaging, upsell copy review |
| #337 — Freemium tier feature gating | Sprint 4–5 | Free vs. premium messaging clarity |
| #385 — Two-path onboarding | Sprint 4 | Onboarding messaging audit (Task 4.4) |
| #379 — Expertise tier system | Sprint 1–2 | Brand messaging around "works with your brain" |
| #384 — Opt-in notification system | Sprint 4–5 | Notification copy, review prompt timing |

---

## Metrics We'll Track (Privacy-Preserving)

All metrics come from platform-provided dashboards or aggregate opt-in analytics. No user-level tracking.

| Metric | Source | Target (90 days post-launch) |
|---|---|---|
| Total downloads (all platforms) | App Store Connect, Play Console, MS Partner Center, web analytics | 1,000+ |
| App Store rating (iOS) | App Store Connect | ≥ 4.5 stars |
| Play Store rating (Android) | Play Console | ≥ 4.5 stars |
| Beta → GA retention | Manual count (beta testers still active at day 30) | ≥ 50% |
| Product Hunt upvotes | Product Hunt dashboard | Top 5 of the day |
| GitHub stars | GitHub | 500+ |
| Blog post views | Website analytics (privacy-preserving, e.g., Plausible) | 5,000+ total |
| Community members (GitHub Discussions) | GitHub | 100+ |
| Press mentions | Manual tracking | 3+ |

---

## References

- [Product Identity](../design/product-identity.md) — Core promise, differentiators, freemium model
- [User Personas](../design/personas.md) — Alex, Jordan, Casey, Sam profiles
- [Store Metadata](../guides/store-metadata.md) — Current store listing copy
- [Beta Testing Program](../guides/beta-testing.md) — Beta goals, recruitment, exit criteria
- [Onboarding Strategy](../guides/onboarding-strategy.md) — Onboarding flow and philosophy
- [Launch Checklist](../guides/launch-checklist.md) — Pre-launch requirements
- [Launch Readiness Plan](launch-readiness-plan.md) — Launch day operations
- [Privacy Policy](../legal/privacy-policy.md) — Data practices documentation
- [ADR-0003: Local Storage](../architecture/0003-local-storage-strategy.md) — SQLCipher encryption
- [ADR-0004: Auth & Security](../architecture/0004-auth-security-architecture.md) — Authentication architecture
