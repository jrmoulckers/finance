# Marketing Sprint Plan — Sprints 6–10 (Post-Launch Growth)

> **Status:** ACTIVE
> **Created:** 2025-07-27
> **Owner:** Marketing Strategist
> **Purpose:** Define marketing, growth, and content tasks for the 5 sprints following v1.0 launch — shifting from launch execution to sustainable growth and retention
> **Predecessor:** [Marketing Plan Sprints 1–5](marketing-plan-sprints-1-5.md) (pre-launch)
> **Related:** [Product Identity](../design/product-identity.md) · [Growth Strategy](growth-strategy-post-launch.md) · [Review Strategy](review-strategy.md) · [Launch Retrospective](launch-retrospective-week-1.md) · [Privacy Messaging](privacy-marketing-messaging.md)

---

## Strategic Context

Finance is **live on all four platforms** (iOS, Android, Web, Windows). Sprints 1–5 delivered: brand identity, ASO keyword research, beta program, store listings, launch execution, and initial growth strategy. Marketing now shifts from "make people aware" to "keep people engaged, convert free users, and expand into new markets."

### Post-Launch Marketing Priorities

1. **Retention over acquisition** — Day-7 and Day-30 retention matter more than raw downloads
2. **Community as moat** — Build an engaged user community that drives organic growth
3. **Premium conversion** — Introduce paid tiers without undermining trust or the free-forever promise
4. **Market expansion** — i18n opens new geographies; each requires localized messaging
5. **Feature storytelling** — Every new feature is a marketing moment; tell the "why," not just the "what"
6. **Privacy differentiation deepening** — As AI features arrive, privacy messaging becomes even more critical

### Key Upcoming Features (Engineering Roadmap)

| Sprint | Feature                                            | Marketing Opportunity                                                |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| **7**  | Premium subscriptions, freemium tiers (#338, #337) | Pricing communication, upgrade flow copy, value proposition          |
| **8**  | Widgets, quick-entry improvements, i18n            | New market entry, platform-specific promotion, daily habit messaging |
| **9**  | AI categorization, spending predictions            | Privacy-first AI positioning, competitive differentiation            |
| **10** | Bank connections (Plaid), receipt scanning         | Partnership outreach, trust-building for data-sharing features       |

### Marketing Principles (Carried from Sprints 1–5 — Non-Negotiable)

- **Privacy-first claims must be technically accurate** — verified against architecture docs
- **No dark patterns** — no artificial urgency, guilt-based upsells, or manipulative tactics
- **Inclusive language** — no assumptions about income level, financial literacy, or ability
- **Transparent** — clear about what data is collected, where it lives, and why
- **User autonomy** — growth tactics respect user choice; no deceptive onboarding
- **Premium ≠ punitive** — free tier is genuinely useful; premium adds convenience, not core functionality

---

## Sprint 6: Post-Launch Monitoring & Community Foundation

> **Theme:** Listen, learn, respond — build the foundation for organic community-driven growth
> **Engineering context:** v1.0 live, bug fixes from launch feedback, stability patches, performance monitoring
> **Depends on:** Sprint 5 launch execution, Week-1 retrospective (Task 5.4)

### Task 6.1: Review Monitoring & Response Program

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-review-monitoring-program`

**Deliverables:**

- `docs/business/review-monitoring-dashboard.md` — Monitoring cadence, response SLAs, escalation paths
- Daily review scan process for all stores (iOS, Android, Microsoft Store) for first 30 days
- Response templates refined from Task 5.3 based on actual reviews received in Week 1:
  - **Privacy-concerned reviewer:** Specific, technical, reassuring — cite ADR-0004, SQLCipher, no ATT
  - **Feature request reviewer:** Acknowledge, link to GitHub Discussions, share roadmap context
  - **Comparison reviewer** ("switched from YNAB/Monarch"): Thank them, ask what resonated (for insights)
  - **Bug report reviewer:** Apologize, confirm the team is aware, provide support channel
  - **Low-rating reviewer:** Empathize, offer direct help, never argue or get defensive
- Sentiment tracking: weekly summary of review themes (what users love, what frustrates them)
- Escalation criteria: when to flag a review to engineering (crash reports, data concerns, security)

**Acceptance criteria:**

- [ ] Response SLA: ≤24 hours for negative reviews (1–2 stars), ≤48 hours for all others
- [ ] Every response is personalized — no copy-paste boilerplate visible to users
- [ ] Responses never reveal non-public roadmap items or promise specific delivery dates
- [ ] Privacy-related reviews get the most detailed, careful responses (these are brand-defining moments)
- [ ] Weekly sentiment summary shared with engineering team to inform Sprint 7 priorities

**Dependencies:**

- Review strategy (Task 5.3) — templates and ethical prompting guidelines
- App live on stores with initial reviews accumulating

---

### Task 6.2: Community Engagement Playbook

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-community-engagement-playbook`

**Deliverables:**

- `docs/business/community-engagement-playbook.md` — Comprehensive engagement strategy
- **GitHub Discussions activation:**
  - Seed 3–5 discussion threads: "How do you use Finance?", "Feature wishlist for v1.1", "Tips for quick-entry workflows"
  - Weekly "This week in Finance" update post (what was fixed, what's in progress, community highlights)
  - Contributor recognition: highlight community bug reports that led to fixes
- **Reddit engagement plan** (helpful participation, not promotion):
  - Identify 5–8 subreddits where Finance solves real problems (r/personalfinance, r/budgeting, r/privacy, r/adhd, r/frugal, r/financialindependence, r/androidapps, r/iphone)
  - Content templates: answer questions with genuine advice; mention Finance only when specifically relevant
  - Track threads where users organically mention Finance (respond, thank, learn)
- **Social media cadence:**
  - 3 posts/week: 1 tip/feature highlight, 1 community spotlight, 1 educational/privacy content
  - User-generated content strategy: "Share your dashboard setup" (no financial data — just layout/categories)
- **Feedback loop:** Route community insights → engineering backlog → public acknowledgment when shipped

**Acceptance criteria:**

- [ ] Reddit engagement follows each subreddit's self-promotion rules (checked before posting)
- [ ] Community engagement is genuinely helpful — not every interaction mentions Finance
- [ ] "This week in Finance" posts are honest about what's in progress and what's delayed
- [ ] User-generated content sharing never exposes actual financial data — only app configuration
- [ ] Community metrics baseline established: GitHub Discussions posts, response times, sentiment

**Dependencies:**

- Community channels from Task 3.3 (GitHub Discussions, social accounts)
- Launch retrospective insights (Task 5.4) for initial community sentiment

---

### Task 6.3: Post-Launch Content Marketing Kickoff

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-post-launch-content`

**Deliverables:**

- Publish first 2 blog posts from Sprint 2 content calendar (drafted in Task 2.2):
  1. **"Why We Built Finance Offline-First"** — Technical story, updated with launch-day learnings
  2. **"Budgeting Without the Guilt Trip"** — Non-judgmental design philosophy
- 2 new blog post drafts based on launch feedback: 3. **"What We Learned from 1,000 Beta Testers"** — Authentic launch story (with anonymized insights) 4. **"Your Financial App's Privacy Label: What It Actually Means"** — Educational content about App Store privacy labels, using Finance as a case study
- SEO optimization for target keywords:
  - "private budget app" / "offline expense tracker" / "ADHD-friendly finance app"
  - "budget app no bank connection" / "finance app that doesn't sell data"
- Content distribution plan: where each post gets shared and why

**Acceptance criteria:**

- [ ] Blog posts are technically accurate — privacy/security claims verified against ADR-0003, ADR-0004
- [ ] "Beta testers" post uses only anonymized, consented quotes
- [ ] Content is genuinely educational — valuable even for people who never use Finance
- [ ] SEO keywords integrated naturally (no keyword stuffing)
- [ ] Each post includes a clear, non-manipulative CTA: "Try Finance — free on [platforms]"

**Dependencies:**

- Blog post drafts from Task 2.2 (Sprint 2)
- Launch data and beta insights from Tasks 4.1 and 5.4

---

### Task 6.4: ASO Iteration Based on Real Data

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-aso-iteration-v1`

**Deliverables:**

- `docs/business/aso-iteration-report-v1.md` — First ASO optimization cycle
- Keyword performance analysis: which terms drive impressions vs. installs (from App Store Connect, Play Console)
- A/B test results from store listing experiments launched in Sprint 4 (Task 4.2)
- Updated keyword set based on real search data:
  - iOS: Optimize 100-character keyword string; swap underperforming terms
  - Android: Refine tags and short description based on install conversion rate
- Screenshot performance analysis: which screenshot order drives highest conversion
- Competitive movement: have competitors updated their listings since Finance launched?
- Recommended store listing updates for next iteration (copy changes for human to apply)

**Acceptance criteria:**

- [ ] Analysis based on ≥14 days of real store data (not projections)
- [ ] Keyword changes are data-driven — each swap justified by impression/conversion metrics
- [ ] No competitor brand names used in keywords (policy compliance)
- [ ] A/B test results include statistical significance assessment (not just "variant B got more clicks")
- [ ] Updated store-metadata.md PR prepared with tracked changes

**Dependencies:**

- App live on stores for ≥2 weeks with measurable traffic
- App Store Connect and Play Console analytics access
- Initial ASO research from Task 1.2

---

## Sprint 7: Premium Tier Launch & Pricing Communication

> **Theme:** Introduce premium subscriptions with radical transparency — earn upgrades, never guilt users into them
> **Engineering context:** Premium subscription IAP (#338), freemium tier feature gating (#337), Stripe/RevenueCat integration
> **Critical principle:** The free tier must remain genuinely useful. Premium adds power and convenience, not the features that should have been free all along.

### Task 7.1: Premium Value Proposition & Pricing Page Copy

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-premium-value-proposition`

**Deliverables:**

- `docs/business/premium-messaging-framework.md` — Complete premium tier messaging
- **Tier comparison copy** (for in-app, website, and store listings):

  | Tier        | Positioning                                        | Tone                                                        |
  | ----------- | -------------------------------------------------- | ----------------------------------------------------------- |
  | **Free**    | "Everything you need to track your money, forever" | Confident, complete — never "limited" or "basic"            |
  | **Premium** | "Power tools for people who want to go deeper"     | Aspirational, additive — never "unlock what you're missing" |

- Pricing page copy:
  - Feature comparison table with honest, specific descriptions
  - "Why pay?" section that focuses on what users _gain_, not what free users _lack_
  - FAQ: "Will the free tier ever get worse?" → "No. We will never remove features from the free tier."
  - FAQ: "Where does my subscription money go?" → Transparent about costs (servers, development, App Store fees)
- In-app upgrade prompts:
  - **Contextual, not interruptive:** Shown when a user _tries_ a premium feature, not on app launch
  - **Dismissable with one tap** — and doesn't reappear for ≥30 days after dismissal
  - **No countdown timers, no "limited offers," no red urgency colors**
  - Copy: "This is a Premium feature. [What's included] — [Try free for 7 days] / [Not now]"
- Store listing updates: "What's New" text for premium launch

**Acceptance criteria:**

- [ ] Free tier is never described as "basic," "limited," "starter," or "lite"
- [ ] No language implies free users are missing out or falling behind
- [ ] Premium upgrade prompts pass the "would I be annoyed by this?" test (honest internal review)
- [ ] Pricing is transparent — monthly and annual clearly shown, no hidden auto-renewal traps
- [ ] Trial period terms are plain-language: "Free for 7 days, then $X/month. Cancel anytime. We'll remind you before you're charged."
- [ ] Aligned with issues #338 (Premium subscription IAP) and #337 (Freemium tier gating)

**Dependencies:**

- Engineering: Freemium gating implemented (#337), IAP integration complete (#338)
- Monetization analysis from ADR-0009 for pricing strategy context
- Brand voice guide (Task 1.1) for tone consistency

---

### Task 7.2: Referral Program Design & Messaging

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-referral-program-design` (aligned with #342)

**Deliverables:**

- `docs/business/referral-program-spec.md` — Referral program design and copy
- **Program structure** (non-manipulative):
  - Reward: Extended premium trial or a premium month — rewards referrer _and_ referee equally
  - No tiered pressure ("invite 5 friends to unlock!") — each referral stands alone
  - Shareable link + personalized invite message templates (user customizable)
  - Clear terms: "Share Finance with someone who'd find it useful. If they sign up, you both get [reward]."
- **In-app sharing mechanism:**
  - Share sheet with pre-written message (editable by user): "I've been using Finance to track my spending — it's private and works offline. [link]"
  - No social graph access, no contact list upload, no "find friends" feature
  - Share action is user-initiated only — never prompted by the app
- **Messaging for all touchpoints:**
  - Settings page: "Share Finance" section with referral link and reward status
  - Post-milestone prompt (optional): "Just hit your savings goal! Want to share Finance with someone?" [Share] / [No thanks]
  - Email: Monthly summary includes unobtrusive "Share with a friend" footer (not the focus)
- Referral dashboard (user-facing): How many people signed up via their link, rewards earned

**Acceptance criteria:**

- [ ] Program never requires sharing to access features or content
- [ ] No contact list access, address book scanning, or social graph integration
- [ ] Referral prompts are ≤1 per month and only after positive moments (never after errors or frustration)
- [ ] Shared messages are editable — users control what they say, not us
- [ ] Reward structure treats referrer and referee equally — no pyramid incentives
- [ ] Aligned with issue #342 (Referral program)

**Dependencies:**

- Engineering: Referral tracking infrastructure (#342)
- Premium tier live (Task 7.1) for reward fulfillment

---

### Task 7.3: Premium Launch Content & Announcement

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-premium-launch-announcement`

**Deliverables:**

- **Blog post:** "Introducing Finance Premium — And Why the Free Version Isn't Going Anywhere"
  - Explains what premium adds and _why_ those features cost money (server costs, API fees, development time)
  - Reaffirms free tier commitment: "We believe everyone deserves a great financial tracker, regardless of budget"
  - Includes pricing table, feature comparison, and honest FAQ
- **Social media announcement sequence:**
  - Post 1: "We're launching Finance Premium today. Here's what it includes — and here's our promise about the free version."
  - Post 2: Feature spotlight (one premium feature, why it matters)
  - Post 3: "Behind the scenes — what it costs to run Finance" (transparency post)
- **"What's New" store update text:**
  - iOS: "Finance Premium is here — advanced analytics, unlimited budgets, and priority support. The free version still includes everything you need to track your money."
  - Android: Similar, adapted for Play Store conventions
- **Email to existing users:**
  - Subject: "Finance Premium is here (and what it means for your free account)"
  - Body: Reassurance-first — your account isn't changing. Then premium benefits. Then trial offer.
  - Unsubscribe link prominent. No "act now" language.

**Acceptance criteria:**

- [ ] Every announcement leads with what's _not_ changing (free tier stays the same)
- [ ] Blog post includes real cost transparency (server, API, development — ballpark numbers)
- [ ] Social posts are informational, not salesy — no "🔥 LAUNCH SALE 🔥" energy
- [ ] Email sent only to users who opted into marketing communications
- [ ] No artificial scarcity ("first 100 subscribers get...") or time-limited launch pricing

**Dependencies:**

- Premium value proposition (Task 7.1)
- Engineering: Premium tier live and purchasable on all platforms

---

## Sprint 8: Feature Update Marketing & New Market Entry

> **Theme:** Widgets put Finance on the home screen; i18n puts Finance in new countries — market both with cultural sensitivity
> **Engineering context:** Home screen widgets (iOS/Android), quick-entry improvements, internationalization (i18n) for first new locales
> **Key opportunity:** Widgets = daily visibility; i18n = addressable market expansion

### Task 8.1: Widget & Quick-Entry Marketing Campaign

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-widget-campaign`

**Deliverables:**

- **Widget-focused store listing update:**
  - New screenshot: Widget on home screen with overlay "Your budget, always visible"
  - Updated feature list: "Home screen widgets — see your spending at a glance"
  - Platform-specific messaging:
    - iOS: "Add Finance to your Home Screen, Lock Screen, or StandBy"
    - Android: "Material You widgets that match your theme"
    - Windows: "Live Tiles and Widgets board integration"
- **"30-second habit" campaign:**
  - Blog post: "The 30-Second Financial Habit That Actually Sticks" — How widgets + quick-entry create frictionless daily tracking
  - Social media series (5 posts):
    1. "Your budget on your home screen — no app launch needed"
    2. "3 taps. That's all it takes." (quick-entry demo)
    3. "The ADHD-friendly approach to budgeting" (Casey persona story)
    4. "Widget + daily glance = financial awareness without the app addiction"
    5. User setup showcase: "Show us your Finance widget setup"
  - Short-form video concept (15–30 sec): Screen recording of widget glance → quick entry → done. Caption: "That's it. That's the whole habit."
- **"What's New" release notes:**
  - Focus on the user benefit, not the feature: "See your budget without opening the app" > "Added widget support"
  - Mention quick-entry improvement: "Even faster transaction entry — we shaved off a tap"

**Acceptance criteria:**

- [ ] Widget screenshots use realistic data with diverse, inclusive sample content
- [ ] Campaign emphasizes habit-building, not app addiction — "awareness, not obsession"
- [ ] ADHD-friendly messaging is authentic and respectful — not performative ("we get ADHD people!")
- [ ] Platform-specific widget features are accurately described (no claiming iOS features on Android)
- [ ] Video concept spec includes accessibility: captions, no flashing, clear text at small sizes

**Dependencies:**

- Engineering: Widgets implemented on ≥2 platforms
- Screenshot assets from working widget builds

---

### Task 8.2: Internationalization Launch Strategy

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-i18n-launch-strategy`

**Deliverables:**

- `docs/business/i18n-marketing-strategy.md` — Market entry plan for first new locales
- **Locale prioritization** (marketing perspective):
  - Tier 1 (launch-day locales): Languages with highest App Store search volume for budget/finance apps
  - Tier 2 (fast-follow): Languages where privacy messaging resonates most strongly (e.g., German/DACH market where GDPR awareness is high)
  - Criteria: market size, privacy-consciousness, competitor weakness, community demand
- **Localized store listings:**
  - Translated and _culturally adapted_ (not just word-for-word translation) store descriptions
  - Locale-appropriate screenshot sample data (local currency, culturally relevant category names, local merchant names)
  - Localized keywords for each market (ASO research per locale)
  - Locale-specific promotional text highlighting relevant differentiators
- **Localized marketing materials:**
  - Social media post templates in each launch language
  - Blog post: "Finance Is Now Available in [Language]" — personalized for each market
  - Community outreach: Identify locale-specific subreddits, forums, and communities
- **Cultural sensitivity review checklist:**
  - [ ] Currency formatting follows locale conventions (symbol placement, decimal separator)
  - [ ] Sample data uses culturally appropriate names, amounts, and categories
  - [ ] No idioms that don't translate (e.g., "30-second habit" may not resonate everywhere)
  - [ ] Privacy messaging adapted to local regulatory context (GDPR vs. LGPD vs. PIPA)
  - [ ] Colors and imagery reviewed for cultural associations

**Acceptance criteria:**

- [ ] Store listings translated by native speakers (not machine translation alone)
- [ ] Each locale has localized ASO keyword research (not English keywords translated)
- [ ] Sample data in screenshots reflects local economic context (realistic amounts, local currency)
- [ ] Launch communications prepared for each market — not just English announcements in new locales
- [ ] Marketing materials reviewed by someone from each target culture for tone and appropriateness

**Dependencies:**

- Engineering: i18n framework implemented, strings externalized, locale support in builds
- Budget for professional translation / native-speaker review

---

### Task 8.3: Feature Update Communication Template

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-feature-update-template`

**Deliverables:**

- `docs/business/feature-update-communication-template.md` — Reusable template for all future feature releases
- **Template sections:**
  1. **User benefit headline:** What this means for the user (not what engineers built)
  2. **Before/after:** What was the workflow before, what is it now
  3. **Who this helps most:** Map to persona (Alex, Jordan, Casey, Sam)
  4. **Store listing update:** "What's New" text, updated screenshots if applicable
  5. **Blog post angle:** Educational content hook tied to the feature
  6. **Social media:** 3 posts — announcement, demo, user story
  7. **Community:** GitHub Discussions thread for feedback
  8. **Email:** Feature announcement for opted-in users
- **Quality checklist per release:**
  - [ ] Feature claims match actual shipped functionality (no vaporware marketing)
  - [ ] Accessibility impact noted (does this feature work with VoiceOver/TalkBack?)
  - [ ] Privacy impact noted (does this feature change the data safety section?)
  - [ ] Screenshot/video assets ready before store submission

**Acceptance criteria:**

- [ ] Template is reusable for Sprints 9 and 10 without significant restructuring
- [ ] Includes guidance on what _not_ to say (no "finally!" — implies the app was incomplete)
- [ ] Maps every feature to at least one persona — no feature is marketed without a user story
- [ ] Includes a "hold/no-go" criteria: don't market a feature until it's stable for ≥3 days in production

**Dependencies:** None (template creation is self-contained)

---

## Sprint 9: AI Feature Storytelling & Privacy-First AI Positioning

> **Theme:** AI is the most scrutinized feature category for privacy — tell the story carefully and honestly
> **Engineering context:** AI-powered transaction categorization, spending pattern recognition, budget predictions
> **Critical principle:** AI features must be marketed with radical transparency about what data is processed, where, and by whom. This is the highest-stakes messaging Finance will produce.

### Task 9.1: Privacy-First AI Messaging Framework

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-privacy-first-ai-messaging`

**Deliverables:**

- `docs/business/ai-privacy-messaging-framework.md` — Comprehensive AI messaging strategy
- **Core AI privacy message:** Define the one-sentence position (e.g., "Finance's AI runs on your device — your spending data never touches our servers for AI processing" — _only if technically accurate per architecture docs_)
- **Technical accuracy matrix:**

  | AI Feature           | Data Flow                       | Where Processing Happens                              | What Leaves Device | Marketing-Safe Claim |
  | -------------------- | ------------------------------- | ----------------------------------------------------- | ------------------ | -------------------- |
  | Auto-categorization  | Transaction → ML model          | [On-device / Edge / Server — verify with engineering] | [Specify exactly]  | [Approved claim]     |
  | Spending predictions | Historical transactions → model | [On-device / Edge / Server]                           | [Specify exactly]  | [Approved claim]     |
  | Budget suggestions   | Budget + actuals → model        | [On-device / Edge / Server]                           | [Specify exactly]  | [Approved claim]     |

  _(Table must be completed with engineering team — no assumptions about AI data flow)_

- **Comparison messaging** (Finance AI vs. competitors' AI):
  - What Finance does differently (specifics, not hand-waving)
  - What competitors' AI approaches require (bank connections, server processing, data sharing)
  - No FUD — state Finance's approach positively, don't attack competitors
- **In-app AI transparency copy:**
  - First-time AI feature encounter: "Finance uses AI to suggest categories. Here's how it works: [explain]. Your transaction data [stays on device / is processed by X]. [Learn more]"
  - Settings page: Clear toggle for each AI feature with explanation of what changes when disabled
  - AI confidence indicators: "AI suggested this category (87% confident). [Accept] [Change]" — never auto-apply without user awareness

**Acceptance criteria:**

- [ ] **CRITICAL:** Every AI privacy claim verified with engineering — no marketing-invented claims about on-device processing
- [ ] If any AI feature requires server-side processing, messaging is transparent about this (no "runs on your device" hand-waving)
- [ ] In-app AI disclosure passes GDPR Article 22 requirements (automated decision-making transparency)
- [ ] AI features are presented as assistive, not autonomous — "AI suggests, you decide"
- [ ] Messaging addresses the "AI hype fatigue" — be specific about what the AI actually does, not vague about "intelligence"
- [ ] Aligned with issue #340 (Privacy-as-premium marketing) — AI privacy is a premium differentiator

**Dependencies:**

- Engineering: AI feature architecture finalized — data flow documented
- Privacy audit (privacy-audit-v1.md) updated with AI data processing assessment
- ADR-0004 reviewed for AI-related data handling

---

### Task 9.2: AI Feature Launch Content

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-ai-feature-launch-content`

**Deliverables:**

- **Blog post:** "How Finance Uses AI Without Compromising Your Privacy"
  - Technical depth: explain the architecture (on-device ML, model size, what data is used)
  - Comparison: how most fintech AI works (send data to servers, train on aggregate data, share with partners) vs. Finance's approach
  - Honest limitations: what Finance's AI can't do because of privacy constraints — and why that's a worthwhile trade-off
  - Audience: privacy-conscious users, tech press, developer community
- **Social media campaign:**
  - Post 1: "We added AI to Finance. Here's exactly what it does with your data: [specific answer]"
  - Post 2: Demo of auto-categorization in action (screen recording, 15 sec)
  - Post 3: "Most finance apps send your transactions to servers for AI processing. Finance doesn't. Here's how."
  - Post 4: "You can turn off every AI feature with one toggle. We think that's how it should work."
- **Store listing update:**
  - Feature highlight: "Smart categorization — AI learns your spending patterns, right on your device"
  - Updated privacy label / data safety section if AI changes data handling
  - "What's New" text: specific about what the AI does, not vague ("AI-powered insights" ❌ → "AI suggests categories based on your transaction descriptions" ✅)
- **Press pitch:** AI + privacy angle for tech media (Ars Technica, The Verge, Wired privacy beat)
  - Angle: "This finance app's AI runs entirely on-device" (or whatever the accurate claim is)
  - Include benchmarks: categorization accuracy, model size, battery impact

**Acceptance criteria:**

- [ ] Blog post reviewed by engineering for technical accuracy before publication
- [ ] Store listing privacy labels updated to reflect any new data processing from AI features
- [ ] Social media posts are specific and verifiable — no vague "AI-powered" marketing speak
- [ ] Press pitch includes concrete technical details (model architecture, on-device vs. server, data flow)
- [ ] Honest about limitations: "AI categorization works best for [X]; you may need to correct it for [Y]"

**Dependencies:**

- AI privacy messaging framework (Task 9.1) — claims must be approved before content is created
- Engineering: AI features stable and demonstrable

---

### Task 9.3: Privacy-as-Premium Campaign Refinement

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-privacy-premium-refinement` (aligned with #340)

**Deliverables:**

- Updated `docs/business/privacy-marketing-messaging.md` — v2 based on post-launch learnings and AI feature addition
- **Campaign:** "What Your Finance App Knows About You"
  - Educational content series (3 posts) showing what data various finance app categories collect:
    1. "Bank-connected apps" — what Plaid/data aggregators access
    2. "Ad-supported free apps" — what advertising SDKs track
    3. "Finance's approach" — what Finance collects and why (with the data inventory from privacy-audit-v1.md as source)
  - Each post is factual, cited, and non-fear-mongering — inform, don't scare
- **Privacy differentiator refresh:**
  - Updated messaging for AI era: "Privacy isn't just about where your data is stored — it's about whether AI processes it on a server you don't control"
  - New comparison angle: "Most 'AI-powered' finance apps send your transactions to cloud AI. Finance's AI works right on your device."
  - Updated privacy card (5-sentence summary) incorporating AI privacy commitment
- **In-app privacy center copy update:**
  - Add AI section to privacy explainer
  - Update data inventory to reflect AI processing
  - Clear language about what each AI feature does with data

**Acceptance criteria:**

- [ ] Educational content is factual — competitor data practices cited from their published privacy policies
- [ ] No FUD or fear-based marketing — tone is "here's what to know," not "be afraid"
- [ ] Privacy card update verified against current technical implementation (including AI)
- [ ] Campaign aligns with issue #340 (Privacy-as-premium marketing)
- [ ] Content is useful for the broader privacy community, not just Finance marketing

**Dependencies:**

- AI privacy messaging (Task 9.1) — establishes the claims this campaign builds on
- Privacy audit (privacy-audit-v1.md) for accurate data inventory
- Sprint 6 review sentiment — what privacy themes are users asking about?

---

## Sprint 10: Bank Connection Launch & Partnership Outreach

> **Theme:** Bank connections are the biggest trust moment — users are choosing to share their data with a third party. Market this with maximum transparency and zero pressure.
> **Engineering context:** Plaid integration for bank connections, receipt scanning via on-device OCR
> **Critical principle:** Bank connection is opt-in. Finance works perfectly without it. Users who choose it deserve complete transparency about what data flows where.

### Task 10.1: Bank Connection Trust-Building Campaign

**Priority:** 🔴 Critical
**GitHub Issue:** `mktg-bank-connection-trust`

**Deliverables:**

- `docs/business/bank-connection-messaging.md` — Complete messaging for bank connection feature
- **Onboarding copy for bank connection flow:**
  - Step 1: "Finance can connect to your bank to automatically import transactions. This is completely optional — Finance works great without it."
  - Step 2: "When you connect, [Plaid/provider] securely retrieves your transactions. Here's exactly what happens: [data flow diagram in plain language]"
  - Step 3: "You can disconnect at any time. When you do, Finance deletes the connection — your manually-entered data stays."
  - Every step has a clear "Skip" or "Not now" option — no "are you sure?" guilt prompts
- **FAQ / transparency page copy:**
  - "What is Plaid?" — Plain-language explanation of what the data aggregator does
  - "What data does Plaid see?" — Specific fields, not vague "financial data"
  - "Does Finance store my bank credentials?" → "No. Finance never sees your bank password. Plaid handles authentication directly."
  - "Can I use Finance without connecting my bank?" → "Absolutely. Finance was designed as a manual-entry app first. Bank connections are a convenience feature."
  - "What happens if I disconnect?" → Specific about data retention/deletion
- **Store listing update:**
  - Feature highlight: "Optional bank connection — import transactions automatically, or keep entering them yourself"
  - Updated privacy label / data safety section (Plaid adds third-party data sharing — must be disclosed)
  - Emphasis on "optional" — this feature should never be marketed as the primary way to use Finance
- **Blog post:** "We Added Bank Connections — Here's Why It Took Us This Long"
  - Story: Why Finance launched without bank connections (privacy-first, prove the manual experience works)
  - What changed: User demand + finding a privacy-respectable approach
  - Technical transparency: How Plaid works, what data flows, what Finance stores vs. what Plaid stores
  - The opt-in philosophy: "We'd rather have users who trust us than users who connected because we didn't give them a choice"

**Acceptance criteria:**

- [ ] **CRITICAL:** Data flow description verified with engineering — every claim about what Plaid accesses/stores is accurate
- [ ] Store privacy labels / data safety sections updated _before_ the feature goes live (not after)
- [ ] Bank connection is never described as "the better way" or "the smart way" — it's "another way"
- [ ] Users who don't connect their bank never see reminders, nudges, or "you're missing out" messaging
- [ ] Disconnect flow copy is clear and reassuring — no "are you sure?" dark patterns
- [ ] FAQ addresses the most common objection: "I don't trust apps with my bank info" — with respect, not dismissal

**Dependencies:**

- Engineering: Plaid integration complete, data flow documented
- Privacy policy updated to reflect Plaid data sharing
- Legal review of Plaid-related disclosures

---

### Task 10.2: Receipt Scanning Feature Marketing

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-receipt-scanning-launch`

**Deliverables:**

- **Feature announcement copy:**
  - Headline: "Snap a receipt, skip the typing"
  - Body: Explain on-device OCR processing — "Receipt scanning happens entirely on your device. The image is processed locally, data is extracted, and the image is discarded (or saved locally if you choose). Nothing is uploaded to any server."
  - Use case examples per persona:
    - Alex: "Snap your coffee receipt — amount, merchant, and category filled in automatically"
    - Jordan: "Track reimbursable expenses — scan the receipt, tag it, export later"
    - Casey: "No more 'I'll enter it later' pile-up — scan and done in 5 seconds"
- **Store listing update:**
  - New screenshot: Receipt scanning in action (phone camera pointed at realistic receipt)
  - Feature list addition: "Receipt scanning — on-device OCR, nothing uploaded"
  - "What's New" text emphasizing speed and privacy
- **Social media posts:**
  - Demo video concept (15 sec): Point phone at receipt → data extracted → transaction created → done
  - Privacy angle: "Your receipts are processed on your device and never leave it"
- **Privacy disclosure:** Clear in-app explanation that camera permission is used only for receipt scanning, images are processed locally, and no receipt data is transmitted

**Acceptance criteria:**

- [ ] "On-device OCR" claim verified with engineering — confirm no cloud OCR API is used
- [ ] Camera permission rationale copy complies with Apple and Google requirements (clear, specific purpose)
- [ ] Receipt scanning is marketed as a convenience feature, not a replacement for manual entry
- [ ] Sample receipt in screenshots uses fictional but realistic data (no real merchant names that could imply partnership)
- [ ] Accessibility: feature works with VoiceOver/TalkBack guidance for camera positioning

**Dependencies:**

- Engineering: On-device OCR implemented and stable
- Camera permission strings approved for each platform

---

### Task 10.3: Partnership Outreach Strategy

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-partnership-outreach`

**Deliverables:**

- `docs/business/partnership-strategy.md` — Partnership outreach plan and templates
- **Partnership categories and targets:**

  | Category                          | Target Organizations                                        | Value Proposition                                                       |
  | --------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
  | **Privacy advocacy**              | EFF, Privacy International, NOYB                            | "Finance proves privacy and usability aren't trade-offs"                |
  | **Neurodivergent communities**    | CHADD, ADDitude Magazine, ADHD community creators           | "Designed with cognitive accessibility as a core principle"             |
  | **Financial literacy nonprofits** | NFCC, JumpStart, local credit unions                        | "Free, private financial tracking for people building financial skills" |
  | **Developer community**           | KMP community, Jetpack Compose showcases, SwiftUI showcases | "Real-world multi-platform app built with modern tools"                 |
  | **Accessibility organizations**   | A11Y Project, disability rights orgs                        | "WCAG 2.2 AA compliant financial tracker"                               |

- **Outreach templates** (customized per category):
  - Introduction email: Who we are, what we built, why we're reaching out
  - Partnership proposal: What we're offering (free tool, educational content, co-branded material) and what we're asking (review, mention, collaboration)
  - Clear about what we're NOT asking: "We're not asking for an endorsement. We'd love your honest feedback."
- **Partnership ethics guidelines:**
  - Never pay for reviews or endorsements without disclosure
  - Never misrepresent the relationship (don't imply endorsement where none exists)
  - Be genuine — approach organizations whose mission aligns with Finance's values, not just for reach
  - If a partnership doesn't serve the partner's community, don't pursue it

**Acceptance criteria:**

- [ ] Every partnership target has a genuine values alignment — not just marketing reach
- [ ] Outreach templates are honest about Finance's stage (post-launch, growing, not a major corporation)
- [ ] ADHD/neurodivergent outreach reviewed by someone from that community before sending
- [ ] No partnership involves data sharing, co-branded tracking, or user list exchange
- [ ] Each partnership has a clear "what's in it for them" that's genuinely useful to their community

**Dependencies:**

- App stable and feature-rich enough to recommend (Sprint 10 features shipped)
- Privacy and accessibility claims verified and documented

---

### Task 10.4: 90-Day Growth Retrospective & Strategy Refresh

**Priority:** 🟡 Medium
**GitHub Issue:** `mktg-90-day-growth-retro`

**Deliverables:**

- `docs/business/growth-retrospective-90-day.md` — Comprehensive 90-day post-launch marketing retrospective
- **Metrics review** (against targets from Sprint 5 Task 5.2):

  | Metric                          | Target (Sprint 5) | Actual    | Analysis                   |
  | ------------------------------- | ----------------- | --------- | -------------------------- |
  | Total downloads (all platforms) | 1,000+            | [measure] |                            |
  | App Store rating (iOS)          | ≥ 4.5 stars       | [measure] |                            |
  | Play Store rating (Android)     | ≥ 4.5 stars       | [measure] |                            |
  | Beta → GA retention (day 30)    | ≥ 50%             | [measure] |                            |
  | GitHub stars                    | 500+              | [measure] |                            |
  | Blog post views                 | 5,000+ total      | [measure] |                            |
  | Community members               | 100+              | [measure] |                            |
  | Premium conversion rate         | —                 | [measure] | [New metric post-Sprint 7] |
  | Referral program participation  | —                 | [measure] | [New metric post-Sprint 7] |

- **Channel effectiveness analysis:**
  - Which acquisition channels drive the highest-quality users (retention, not just installs)?
  - Content that resonated most (blog posts, social, community posts)
  - Community growth trajectory and health (engagement rate, not just member count)
  - Premium conversion funnel: where do free users encounter premium, where do they convert or leave?
- **Strategy refresh for Sprints 11+:**
  - Double down on what's working
  - Sunset what's not (be willing to stop channels that aren't delivering)
  - New market opportunities based on i18n launch data
  - Content themes for next quarter based on user questions and community discussion
  - Partnership pipeline status and next steps
- **Competitive landscape update:**
  - Have competitors responded to Finance's launch? New features, pricing changes, positioning shifts?
  - Emerging competitors or category shifts to monitor
  - Finance's positioning: does it still resonate, or does messaging need evolution?

**Acceptance criteria:**

- [ ] Retrospective is brutally honest — includes failures, not just wins
- [ ] Metrics are measured from privacy-preserving sources only (store dashboards, aggregate analytics)
- [ ] Channel analysis includes qualitative insights (user sentiment, not just numbers)
- [ ] Strategy refresh has specific, time-bounded actions — not vague "do more content"
- [ ] Document is useful as input for Sprint 11+ planning sessions

**Dependencies:**

- 90 days of post-launch data (covers Sprints 6–10)
- All prior sprint deliverables accessible for retrospective analysis
- App Store / Play Console analytics access

---

## Sprint Summary Matrix

| Sprint | Theme                     | Critical Tasks                            | Medium Tasks                               | Key Deliverables                                                                |
| ------ | ------------------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| **6**  | Post-Launch Monitoring    | 2 (Review Monitoring, Community Playbook) | 2 (Content Marketing, ASO Iteration)       | Review response program, community playbook, first blog posts, ASO optimization |
| **7**  | Premium Tier Launch       | 1 (Premium Messaging)                     | 2 (Referral Program, Premium Announcement) | Premium messaging framework, referral program, upgrade flow copy, pricing page  |
| **8**  | Feature Updates & i18n    | 2 (Widget Campaign, i18n Strategy)        | 1 (Update Template)                        | Widget marketing, localized store listings, feature update template             |
| **9**  | AI & Privacy Positioning  | 1 (AI Privacy Messaging)                  | 2 (AI Content, Privacy Campaign)           | AI privacy framework, technical accuracy matrix, privacy-as-premium refresh     |
| **10** | Bank Connections & Growth | 1 (Bank Connection Trust)                 | 3 (Receipt Scanning, Partnerships, Retro)  | Bank connection messaging, partnership strategy, 90-day retrospective           |

---

## Issue Dependency Map

```
Sprint 6                Sprint 7                Sprint 8                Sprint 9                Sprint 10
─────────               ─────────               ─────────               ─────────               ─────────
6.1 Review Monitor ────► 7.1 Premium Messaging                                                  10.4 Growth Retro
6.2 Community Playbook                          ► 8.2 i18n Strategy                              10.3 Partnerships
6.3 Content Marketing ─► 7.3 Premium Announce ─► 8.1 Widget Campaign ──► 9.2 AI Content ───────► 10.1 Bank Connection
6.4 ASO Iteration                                 8.3 Update Template ──► 9.2 AI Content ───────► 10.2 Receipt Scanning
                         7.2 Referral Program                            9.1 AI Privacy Msg ────► 10.1 Bank Connection
                                                                         9.3 Privacy Refresh ───► 10.1 Bank Connection
```

---

## Existing Issue Alignment

| GitHub Issue                        | Sprint Relevance | Marketing Action                                                     |
| ----------------------------------- | ---------------- | -------------------------------------------------------------------- |
| #342 — Referral program             | Sprint 7         | Referral program design and messaging (Task 7.2)                     |
| #340 — Privacy-as-premium marketing | Sprint 9         | Privacy campaign refinement, AI privacy positioning (Tasks 9.1, 9.3) |
| #338 — Premium subscription IAP     | Sprint 7         | Premium value proposition, pricing page copy (Task 7.1)              |
| #337 — Freemium tier feature gating | Sprint 7         | Free vs. premium messaging, tier comparison (Task 7.1)               |

---

## Metrics We'll Track — Post-Launch Growth Phase (Privacy-Preserving)

All metrics come from platform-provided dashboards or aggregate opt-in analytics. No user-level tracking.

| Metric                                   | Source                       | Sprint 6 Baseline         | Sprint 10 Target             |
| ---------------------------------------- | ---------------------------- | ------------------------- | ---------------------------- |
| Total downloads (all platforms)          | Store dashboards             | Measure at Sprint 6 start | 5,000+                       |
| App Store rating (iOS)                   | App Store Connect            | Measure                   | ≥ 4.5 stars (maintain)       |
| Play Store rating (Android)              | Play Console                 | Measure                   | ≥ 4.5 stars (maintain)       |
| Day-7 retention                          | Store dashboards (aggregate) | Measure                   | ≥ 40%                        |
| Day-30 retention                         | Store dashboards (aggregate) | Measure                   | ≥ 25%                        |
| Premium conversion rate                  | RevenueCat/Stripe dashboard  | N/A (Sprint 7 launch)     | ≥ 3% of active users         |
| Referral program participation           | Internal referral tracking   | N/A (Sprint 7 launch)     | ≥ 10% of active users shared |
| Blog post views (total)                  | Privacy-preserving analytics | Measure                   | 15,000+                      |
| GitHub stars                             | GitHub                       | Measure                   | 1,500+                       |
| Community members (Discussions)          | GitHub                       | Measure                   | 500+                         |
| New markets (i18n locales live)          | Store dashboards per locale  | 1 (English)               | ≥ 3 locales                  |
| App Store search rank (primary keywords) | ASO tool                     | Measure                   | Top 20 for 5+ keywords       |
| Press/media mentions                     | Manual tracking              | Measure                   | 10+                          |
| Partnership conversations initiated      | CRM/manual                   | 0                         | 5+ active conversations      |

---

## Key Risks & Mitigations

| Risk                                                 | Likelihood | Impact   | Mitigation                                                                         |
| ---------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------- |
| Premium launch causes backlash ("going corporate")   | Medium     | High     | Lead every announcement with free-tier commitment; be transparent about costs      |
| AI privacy claims are inaccurate                     | Low        | Critical | **Mandatory** engineering review of every AI claim before publication              |
| i18n store listings contain cultural insensitivities | Medium     | Medium   | Native-speaker review for every locale; cultural sensitivity checklist             |
| Bank connection erodes privacy brand                 | Medium     | High     | Radical transparency; always position as optional; never nudge non-connected users |
| Competitor launches similar privacy-first app        | Low        | Medium   | Focus on execution quality, community, and trust — not features alone              |
| Community grows but becomes toxic                    | Low        | Medium   | Clear guidelines, active moderation, zero tolerance for financial shaming          |

---

## References

- [Marketing Plan Sprints 1–5](marketing-plan-sprints-1-5.md) — Pre-launch marketing strategy
- [Product Identity](../design/product-identity.md) — Core promise, differentiators, freemium model
- [User Personas](../design/personas.md) — Alex, Jordan, Casey, Sam profiles
- [Growth Strategy](growth-strategy-post-launch.md) — 90-day post-launch growth plan (Sprint 5)
- [Review Strategy](review-strategy.md) — Ethical review and rating approach (Sprint 5)
- [Privacy Messaging](privacy-marketing-messaging.md) — Privacy marketing framework (Sprint 2)
- [Privacy Audit v1](../architecture/privacy-audit-v1.md) — Data inventory and compliance status
- [ADR-0004: Auth & Security](../architecture/0004-auth-security-architecture.md) — Authentication and encryption architecture
- [ADR-0009: Legal & Monetization](../architecture/0009-legal-monetization-analysis.md) — BSL 1.1, pricing strategy
- [Brand Voice Guide](brand-voice-guide.md) — Tone, vocabulary, do/don't examples (Sprint 1)
