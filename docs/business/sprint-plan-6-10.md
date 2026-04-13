# Finance App — Sprint Plan (Sprints 6–10)

**Document Owner:** Product Management
**Created:** 2025-07-27
**Milestone Focus:** v1.1 (Sprints 6-7) and v1.2 (Sprints 8-10)
**Sprint Cadence:** 2-week sprints
**Status:** Planned — Pending Sprint 5 launch completion
**Predecessor:** [Sprint Plan 1-5](sprint-plan-1-5.md)

---

## Executive Summary

Sprints 6-10 cover the first 10 weeks after v1.0 launch. The strategy follows a deliberate post-launch progression:

1. **Sprint 6:** Stabilize production, deploy monitoring, ship safe quick wins from descoped v1.0 items
2. **Sprint 7:** Build the revenue foundation — freemium gating + in-app purchases across all 4 platforms
3. **Sprint 8:** Growth levers — platform widgets, i18n framework, quick-entry mode, referral program
4. **Sprint 9:** Intelligence layer — AI categorization, NLP input, anomaly detection, predictions
5. **Sprint 10:** Platform expansion — bank connections, receipt scanning, family collaboration

### Milestone Mapping

| Sprint | Weeks  | Milestone | Theme                         |
| ------ | ------ | --------- | ----------------------------- |
| 6      | 11-12  | v1.1      | Post-Launch Stabilization     |
| 7      | 13-14  | v1.1      | Monetization Foundation       |
| 8      | 15-16  | v1.2      | Growth and Retention          |
| 9      | 17-18  | v1.2      | Smart Features                |
| 10     | 19-20  | v1.2      | Advanced Features and Expansion |

### v1.1 Release Scope (Sprints 6-7)

v1.1 bundles post-launch stabilization with monetization:
- Production monitoring and APM
- Security hardening (rate limiting, certificate pinning)
- Contextual tips, notification scheduling
- Freemium tier gating + premium IAP on all platforms
- Privacy-as-premium marketing launch

### v1.2 Release Scope (Sprints 8-10)

v1.2 is a major feature release:
- Dashboard widgets + platform home screen widgets
- Internationalization framework
- AI-powered categorization, NLP input, anomaly detection
- Bank connection API (Plaid/MX)
- Receipt scanning OCR
- Family/household collaboration
- Referral program

### Post-Launch Platform Parity Matrix (Projected at Sprint 5 End)

| Feature Area       | iOS | Android | Web | Windows | Target Sprint |
| ------------------ | --- | ------- | --- | ------- | ------------- |
| Accounts CRUD      | Yes | Yes     | Yes | Yes     | v1.0          |
| Transactions CRUD  | Yes | Yes     | Yes | Yes     | v1.0          |
| Budgets CRUD       | Yes | Yes     | Yes | Yes     | v1.0          |
| Goals CRUD         | Yes | Yes     | Yes | Yes     | v1.0          |
| Sync               | Yes | Yes     | Yes | Yes     | v1.0          |
| Biometric Auth     | Yes | Yes     | N/A | Yes     | v1.0          |
| Offline Support    | Yes | Yes     | Yes | Yes     | v1.0          |
| Data Import/Export | Yes | Yes     | Yes | Yes     | v1.0          |
| Cert Pinning       | No  | No      | N/A | No      | Sprint 6      |
| Notifications      | No  | No      | No  | No      | Sprint 6      |
| Premium IAP        | No  | No      | No  | No      | Sprint 7      |
| Freemium Gating    | No  | No      | No  | No      | Sprint 7      |
| Dashboard Widgets  | No  | No      | No  | No      | Sprint 8      |
| Platform Widgets   | No  | No      | N/A | No      | Sprint 8      |
| i18n               | No  | No      | No  | No      | Sprint 8      |
| AI Categorization  | No  | No      | No  | No      | Sprint 9      |
| NLP Input          | No  | No      | No  | No      | Sprint 9      |
| Bank Connection    | No  | No      | No  | No      | Sprint 10     |
| Receipt OCR        | No  | No      | N/A | No      | Sprint 10     |
| Family Collab      | No  | No      | No  | No      | Sprint 10     |

---

## Sprint 6: "Stabilize and Monitor" (Weeks 11-12)

### Sprint Goal

Ensure production stability with APM and monitoring, close critical security gaps (rate limiting, certificate pinning), ship safe user-facing improvements (contextual tips, notifications), and synthesize early user feedback to inform v1.1 priorities.

### Why This First

- Production monitoring (#304) is **essential** — without APM, we are flying blind on the app users are now relying on for their finances
- Rate limiting (#332) and certificate pinning (#329) are security debt explicitly descoped from v1.0 — every day without them is exposure
- Contextual tips (#320) and notifications (#305) are low-risk, high-perceived-value features that demonstrate post-launch momentum
- Bug buffer is critical — v1.0 launches will surface issues we could not anticipate

### Issues

| #     | Title                                              | Agent Type       | Priority | Effort | Source      |
| ----- | -------------------------------------------------- | ---------------- | -------- | ------ | ----------- |
| #304  | Performance monitoring and APM                     | backend + devops | P1       | L      | V2 backlog  |
| #332  | Rate limiting on all Edge Functions                | backend          | P1       | M      | Stage 11    |
| #329  | Certificate pinning on all platforms               | ios/android/win  | P1       | L      | Stage 11    |
| #320  | Contextual financial tips                          | kmp + platforms  | P2       | M      | Descoped v1 |
| #305  | Notification scheduling and smart alerts           | backend + kmp    | P2       | L      | V2 backlog  |
| —     | Bug fix buffer (post-launch P0/P1 issues)          | all              | P1       | M      | Buffer      |
| NEW-1 | Post-launch analytics review and feedback synthesis| product          | P1       | S      | NEW         |
| NEW-2 | v1.1 release planning and app store optimization   | marketing        | P2       | S      | NEW         |

**Total: 8 items (5 engineering + 1 buffer + 2 business)**

### Engineering Breakdown by Agent

- **Backend Agent:** #304 (APM infrastructure — error tracking, latency monitoring, dashboards), #332 (rate limiting on Edge Functions), #305 (push notification scheduling service)
- **DevOps Agent:** #304 (APM integration into CI/CD, alerting rules, dashboards)
- **iOS Agent:** #329 (certificate pinning via URLSession/ATS configuration)
- **Android Agent:** #329 (certificate pinning via OkHttp CertificatePinner)
- **Windows Agent:** #329 (certificate pinning via HttpClientHandler)
- **KMP/Shared Agent:** #320 (contextual tips data models, content system), #305 (notification scheduling shared logic)
- **Platform Agents (all):** #320 (tip UI components on each platform)

### Business Tasks

- **NEW-1 — Post-Launch Analytics Review:** Analyze first 2 weeks of production data. Key questions: DAU/MAU, session length, feature adoption rates, error rates, crash-free rate. Synthesize early user feedback from app store reviews, support channels, and analytics. Output: prioritized list of issues for Sprint 7+.
- **NEW-2 — v1.1 ASO and Release Planning:** Update app store listings based on early review themes. Plan v1.1 release notes emphasizing security hardening and new features. Optimize screenshots and keywords based on search data.

### Dependencies

```
#685 (Sprint 5, notification infra) --> #305 (notification scheduling builds on this)
#304 (APM) should deploy first --> enables monitoring of all other Sprint 6 changes
#332 (rate limiting) --> independent, can start immediately
#329 (cert pinning) --> independent per platform, all can work in parallel
#320 (contextual tips) --> KMP shared layer first, then platform UI
```

### Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Post-launch P0 bugs consume entire sprint capacity | High | Bug buffer allocated; defer #320 (tips) to Sprint 7 if needed |
| Certificate pinning breaks existing user sessions | Medium | Implement with graceful fallback; staged rollout per platform |
| APM tooling choice delays integration | Low | Pre-decide tooling: Sentry (errors) + custom Supabase dashboards (metrics) |
| Rate limiting too aggressive, blocks legitimate users | Medium | Start with generous limits (100 req/min); tune based on #304 APM data |

### Definition of Done

- [ ] APM dashboards operational — error tracking, latency P50/P95/P99, crash-free rate
- [ ] Rate limiting active on all Edge Functions with monitoring
- [ ] Certificate pinning deployed on iOS, Android, and Windows
- [ ] Contextual tips visible in at least 5 key screens across all platforms
- [ ] Push notification scheduling functional (daily snapshot, weekly insight)
- [ ] Post-launch analytics report delivered with Sprint 7 recommendations
- [ ] v1.1 release notes drafted

---

## Sprint 7: "Revenue Foundation" (Weeks 13-14)

### Sprint Goal

Implement the freemium monetization model: define free vs. premium feature boundaries in shared KMP layer, build IAP infrastructure on all 4 platforms, launch privacy-as-premium positioning, and set up conversion analytics to measure funnel health.

### Why This Next

- Monetization is the number one post-launch business priority — user acquisition from v1.0 launch creates the audience to monetize
- #337 (freemium gating) is the **architectural foundation** — it must exist before any platform can sell subscriptions
- #338 (IAP) has app store review lead times — submit early, iterate on rejections
- Privacy-as-premium (#340) aligns with our core brand differentiator and is low-risk to market
- Revenue data from this sprint informs pricing decisions for v1.2 family plan

### Issues

| #     | Title                                              | Agent Type           | Priority | Effort | Source     |
| ----- | -------------------------------------------------- | -------------------- | -------- | ------ | ---------- |
| #337  | Freemium tier feature gating                       | kmp                  | P1       | XL     | Stage 12   |
| #338  | Premium subscription IAP across platforms          | ios/android/web/win  | P1       | XL     | Stage 12   |
| #344  | Annual subscription discount                       | backend              | P2       | S      | Stage 12   |
| #341  | Optional tip jar for development support           | kmp + platforms      | P3       | S      | Stage 12   |
| #340  | Privacy-as-premium marketing                       | marketing            | P2       | M      | Stage 12   |
| NEW-3 | Premium upgrade UX — paywall and comparison design | design               | P1       | M      | NEW        |
| NEW-4 | Conversion funnel analytics and pricing validation | product + analytics  | P2       | M      | NEW        |

**Total: 7 items (4 engineering + 1 design + 2 business)**

> **Note:** #337 and #338 are both XL, but #337 is a single KMP agent task while #338 parallelizes across 4 platform agents. Combined, this sprint is loaded — capacity is realistic because the 4 platform IAP implementations happen simultaneously.

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #337 (feature gating — entitlement system, feature flags, tier definitions in shared layer), #341 (tip jar shared logic and product definitions)
- **iOS Agent:** #338 (StoreKit 2 subscription implementation, receipt validation, restore purchases)
- **Android Agent:** #338 (Google Play Billing Library v6+, subscription lifecycle, grace periods)
- **Web Agent:** #338 (Stripe Checkout integration, webhook handling, customer portal)
- **Windows Agent:** #338 (Microsoft Store purchases or Stripe fallback, license management)
- **Backend Agent:** #344 (annual vs monthly pricing logic, Supabase entitlement records, webhook processing from all stores)
- **Design Agent:** NEW-3 (paywall screens, feature comparison table, upgrade prompts, free trial UX)

### Business Tasks

- **#340 — Privacy-as-Premium Marketing:** Develop marketing campaign positioning privacy as the premium value proposition. Messaging: "Your financial data never leaves your device — premium ensures it stays that way forever." Update app store descriptions, create landing page content, draft social media campaign.
- **NEW-3 — Premium Upgrade UX Design:** Design the complete premium upgrade flow: feature comparison screen, soft paywall (non-blocking), upgrade prompts at natural touchpoints (not dark patterns), subscription management screen. Must follow non-manipulative design principles.
- **NEW-4 — Conversion Funnel Analytics:** Define and instrument the free-to-premium conversion funnel: feature gate encounters, upgrade screen views, plan selection, purchase completion, retention at 7/30 days. Validate pricing against competitive analysis (YNAB, Monarch, Copilot).

### Premium Tier Definition (Product Decision)

This must be decided before Sprint 7 engineering begins:

| Feature                    | Free | Premium |
| -------------------------- | ---- | ------- |
| Unlimited accounts         | Yes  | Yes     |
| Unlimited transactions     | Yes  | Yes     |
| Budgets (up to 5)          | Yes  | Yes     |
| Budgets (unlimited)        | —    | Yes     |
| Goals (up to 3)            | Yes  | Yes     |
| Goals (unlimited)          | —    | Yes     |
| Data export (JSON/CSV)     | Yes  | Yes     |
| Financial insights         | Yes  | Yes     |
| Custom categories          | Yes  | Yes     |
| Custom reports             | —    | Yes     |
| AI categorization          | —    | Yes     |
| NLP transaction input      | —    | Yes     |
| Anomaly detection          | —    | Yes     |
| Bank connections (Plaid)   | —    | Yes     |
| Receipt OCR                | —    | Yes     |
| Family/household (add-on)  | —    | Yes     |
| Priority support           | —    | Yes     |
| Widget customization       | Partial | Yes  |

> **Philosophy:** Core tracking is free forever. Premium unlocks intelligence, automation, and advanced features. No artificial limits on the core budgeting experience.

### Dependencies

```
#337 (freemium gating, KMP) --> #338 (all platform IAP implementations query this)
#337 --> #344 (annual discount needs tier definitions)
#337 --> #341 (tip jar needs IAP infrastructure)
NEW-3 (design) --> #338 (platforms implement the designed UX)
#304 (Sprint 6, APM) --> NEW-4 (conversion analytics builds on APM infra)
#338 (IAP) --> app store review (external dependency, 1-7 day lead time)
```

### Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| App store IAP review rejection (especially Apple) | High | Follow App Store Review Guidelines exactly; have appeal ready |
| Freemium tier too generous — no conversion incentive | Medium | Start generous, tighten later based on data. Core must stay free. |
| Freemium tier too restrictive — user backlash | High | Never gate v1.0 features. Only gate new features added post-launch. |
| Multi-platform IAP complexity (4 stores + Stripe) | High | Backend is source of truth for entitlements. Platform validates receipt and syncs to backend. |
| Receipt validation security (preventing piracy) | Medium | Server-side receipt validation for iOS/Android. Stripe handles Web. |

### Definition of Done

- [ ] Feature gating system operational in KMP shared layer with clear free/premium boundaries
- [ ] iOS subscriptions working via StoreKit 2 with receipt validation
- [ ] Android subscriptions working via Play Billing with server verification
- [ ] Web subscriptions working via Stripe with webhook processing
- [ ] Windows subscriptions working (Store or Stripe)
- [ ] Annual discount pricing active (e.g., 2 months free on annual plan)
- [ ] Tip jar functional on all platforms
- [ ] Paywall UX designed and implemented (non-manipulative)
- [ ] Conversion funnel instrumented and dashboarded
- [ ] Privacy-as-premium marketing campaign drafted

---

## Sprint 8: "Reach and Retain" (Weeks 15-16)

### Sprint Goal

Expand the app's reach and stickiness: add home screen widgets across platforms for daily engagement, build the internationalization framework for global expansion, implement quick-entry and bulk editing for power users, and launch the referral program for organic growth.

### Why This Next

- Widgets (#315, #293) drive daily passive engagement — the number one retention lever for finance apps
- i18n (#264) unlocks non-English markets, which is the largest growth opportunity
- Quick-entry (#319) and bulk editing (#318) were the most-requested descoped v1.0 features
- Referral program (#342) has highest ROI when paired with the v1.1 monetization launch

### Issues

| #     | Title                                              | Agent Type          | Priority | Effort | Source      |
| ----- | -------------------------------------------------- | ------------------- | -------- | ------ | ----------- |
| #315  | Customizable dashboard widgets                     | kmp + platforms     | P2       | L      | Descoped v1 |
| #293  | Widget support across all platforms                | ios/android/win     | P2       | XL     | V2 backlog  |
| #264  | Internationalization (i18n) and localization       | kmp + platforms     | P2       | XL     | Post-launch |
| #319  | Quick-entry transaction mode                       | kmp + platforms     | P2       | M      | Descoped v1 |
| #318  | Bulk transaction editing                           | kmp + platforms     | P2       | M      | Descoped v1 |
| #342  | Referral program                                   | backend + kmp       | P2       | L      | Stage 12    |
| NEW-5 | i18n launch language selection and translation prep| marketing + docs    | P2       | M      | NEW         |
| NEW-6 | v1.1 launch campaign and growth marketing plan     | marketing           | P2       | M      | NEW         |

**Total: 8 items (6 engineering + 2 business)**

> **Note:** #293 (platform widgets) and #264 (i18n) are both XL. Sprint capacity is managed because each XL decomposes into parallel platform-specific work, and #318/#319 are focused KMP+platform tasks.

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #315 (widget data models, shared widget logic), #264 (i18n string extraction, locale framework, plural rules), #319 (quick-entry parsing logic), #318 (bulk selection and batch operation models)
- **iOS Agent:** #293 (WidgetKit — spending summary, budget progress, quick-entry widgets), #264 (iOS localization with .strings/.stringsdict)
- **Android Agent:** #293 (App Widgets with Material You and Glance, Quick Settings tile — ref #381), #264 (Android string resources, locale handling)
- **Windows Agent:** #293 (Windows Widget Board integration or Compose Desktop widgets), #264 (Windows localization)
- **Web Agent:** #264 (react-intl or i18next integration, RTL CSS support), #315 (dashboard widget grid)
- **Backend Agent:** #342 (referral codes, tracking, reward attribution, fraud prevention)

### Business Tasks

- **NEW-5 — i18n Launch Language Selection:** Identify top 5 launch languages based on app store geographic data and competitive analysis. Likely: Spanish, French, German, Portuguese, Japanese. Prepare translation workflow (professional translation + community review). Create glossary of financial terms per language.
- **NEW-6 — v1.1 Launch and Growth Marketing:** Plan the v1.1 release marketing campaign. Emphasize: premium features now available, widgets for daily engagement, enhanced security. Update ASO for all storefronts. Plan social proof campaign (user testimonials from launch).

### Platform Widget Specifications

| Widget Type          | iOS (WidgetKit) | Android (Glance) | Windows | Web (Dashboard) |
| -------------------- | --------------- | ---------------- | ------- | --------------- |
| Daily Spending       | Small/Medium    | 2x1 / 4x2       | Small   | Card            |
| Budget Progress      | Medium/Large    | 4x2 / 4x4       | Medium  | Card            |
| Quick Transaction    | Small           | 2x1              | Small   | N/A (in-app)    |
| Account Balance      | Small           | 2x1              | Small   | Card            |
| Goal Progress        | Medium          | 4x2              | Medium  | Card            |

### Dependencies

```
#315 (dashboard widgets, KMP) --> #293 (platform widgets share data models)
#264 (i18n framework, KMP) --> all platforms implement locale support in parallel
#319 (quick-entry, KMP) --> platform agents implement UI
#318 (bulk editing, KMP) --> platform agents implement UI
#337 (Sprint 7, freemium gating) --> #293 may gate widget customization as premium
#338 (Sprint 7, IAP) --> #342 (referral rewards may include free premium trials)
```

### Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| i18n framework retrofitting is invasive (touching every string) | High | Phase 1: extract strings + framework only. Phase 2 (post-sprint): actual translations |
| Widget APIs vary significantly across platforms | Medium | Define shared data contract in KMP; platform-specific rendering is expected |
| Quick-entry NLP parsing accuracy for diverse formats | Medium | Start with structured quick-entry (amount + category); NLP comes in Sprint 9 |
| Referral fraud (self-referrals, fake accounts) | Low | Rate limit referrals per account; require minimum activity before reward |
| Android widget styling inconsistencies across OEMs | Low | Use Glance composables with Material You; test on 3+ OEM skins |

### Definition of Done

- [ ] In-app dashboard supports customizable widget layout on all platforms
- [ ] iOS WidgetKit widgets live: daily spending, budget progress, quick transaction
- [ ] Android App Widgets live with Material You styling
- [ ] Windows widgets functional
- [ ] i18n framework operational — all user-facing strings extracted and localizable
- [ ] At least 1 non-English language fully translated and testable
- [ ] Quick-entry transaction mode functional on all platforms
- [ ] Bulk transaction editing (multi-select + batch categorize/delete) working
- [ ] Referral program backend operational with tracking and attribution
- [ ] v1.1 launched to app stores with updated listings

---

## Sprint 9: "Intelligence Layer" (Weeks 17-18)

### Sprint Goal

Build the AI/ML intelligence layer: auto-categorize transactions using ML, enable natural language transaction input, detect spending anomalies, predict end-of-month balances, identify subscriptions automatically, and compute a financial health score.

### Why This Next

- AI categorization (#263) is the **highest-value premium feature** — it reduces the number one friction point (manual categorization)
- NLP input (#322) is the second most impactful UX improvement — "Spent 30 dollars at Trader Joes" vs filling 5 form fields
- These features are the core premium value proposition that drives free-to-paid conversion
- Anomaly detection (#323) adds a trust and safety dimension that reinforces our privacy-first brand
- Financial health score (#299) creates a retention hook — users return to track their score

### Issues

| #     | Title                                              | Agent Type       | Priority | Effort | Source     |
| ----- | -------------------------------------------------- | ---------------- | -------- | ------ | ---------- |
| #263  | AI-powered transaction categorization              | kmp + backend    | P1       | XL     | Post-launch|
| #322  | Natural language transaction input                 | kmp              | P2       | L      | Stage 10   |
| #323  | Anomaly detection for unusual transactions         | backend + kmp    | P2       | L      | Stage 10   |
| #324  | Predictive end-of-month balance                    | kmp              | P2       | M      | Stage 10   |
| #325  | Smart subscription detection                       | kmp              | P2       | M      | Stage 10   |
| #299  | Financial health score with benchmarking           | kmp + design     | P2       | L      | V2 backlog |
| NEW-7 | AI features launch campaign and premium positioning| marketing + docs | P2       | M      | NEW        |

**Total: 7 items (6 engineering + 1 business)**

> **Note on #237 vs #322:** Issue #237 ("[Phase 7] Implement natural language transaction input") and #322 ("[Stage 10] Natural language transaction input") appear to be the same feature tracked in two planning phases. **Recommendation:** Close #237 as duplicate, work #322. Note this in the issue.

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #263 (on-device ML categorization model — edge-first, no server dependency), #322 (NLP parser — regex + rule-based first, ML enhancement later), #324 (prediction algorithm using historical spending + recurring transactions), #325 (subscription detection via recurring amount/merchant pattern matching), #299 (health score computation — budget adherence, savings rate, debt ratio)
- **Backend Agent:** #263 (model training pipeline, category taxonomy sync, fallback server-side categorization), #323 (anomaly detection — statistical model comparing transaction against user historical patterns, alert generation)
- **Design Agent:** #299 (financial health score visualization — gauge, trend line, breakdown by factor)
- **Platform Agents (all):** Integration of all 6 features into existing UI (category suggestions, NLP input field, anomaly alerts, balance predictions, subscription list, health score dashboard)

### AI Architecture Decision (Requires @architect Consultation)

Before Sprint 9 begins, the team must decide:

| Decision | Option A (Recommended) | Option B |
| -------- | --------------------- | -------- |
| Categorization model | On-device (edge-first, privacy-aligned) | Server-side (more powerful, privacy trade-off) |
| NLP parsing | Rule-based regex + heuristics | LLM API call (latency + cost + privacy concerns) |
| Anomaly detection | Server-side (needs cross-user baselines) | On-device only (limited to individual patterns) |
| Model format | TensorFlow Lite (KMP-compatible) | ONNX Runtime or CoreML + TFLite per platform |

**Recommendation:** Edge-first for categorization and NLP (aligns with privacy brand). Server-side for anomaly detection (benefits from aggregate patterns, but anonymized). Consult @architect and @security-reviewer.

### Dependencies

```
#263 (AI categorization, KMP) --> #323 (anomaly detection uses categories)
#263 --> #324 (predictions improve with proper categorization)
#263 --> #325 (subscription detection leverages categorization patterns)
#337 (Sprint 7, freemium gating) --> all AI features gated as premium
#304 (Sprint 6, APM) --> monitor ML model performance and accuracy
#322 (NLP input) --> may reference #237 (close as duplicate)
```

### Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| On-device ML model size too large (impacts app download) | High | Start with rule-based categorization + small model (under 5MB). Download full model on-demand. |
| NLP parsing accuracy insufficient for production | Medium | Ship as beta feature with explicit user feedback loop. Rule-based first, ML later. |
| Anomaly detection false positives annoy users | Medium | High confidence threshold (over 95 percent); mute option; learn from user feedback |
| Financial health score methodology controversial | Low | Transparent scoring with explanations; never frame as judgment; cite methodology |
| Model training data insufficient (new app) | High | Use synthetic training data + public datasets. Improve with real (anonymized, consented) data over time. |
| Privacy concerns with ML training on financial data | Critical | All training on-device. No financial data sent to servers for ML. Document in privacy policy. |

### Definition of Done

- [ ] AI categorization suggests categories for new transactions with 80 percent or greater accuracy (top-3)
- [ ] NLP input parses "Spent 45 dollars at Target yesterday on groceries" correctly
- [ ] Anomaly detection flags transactions exceeding 2 standard deviations from user pattern with configurable sensitivity
- [ ] End-of-month balance prediction shown on dashboard with confidence range
- [ ] Subscriptions auto-detected and listed in dedicated view
- [ ] Financial health score computed and displayed with factor breakdown
- [ ] All AI features gated behind premium tier
- [ ] AI feature marketing campaign published (blog post, app store update, social)
- [ ] Privacy documentation updated to explain on-device ML approach

---

## Sprint 10: "Platform Expansion" (Weeks 19-20)

### Sprint Goal

Ship the highest-value advanced features: bank connection API for automatic transaction import, receipt scanning OCR for effortless entry, family/household collaboration for the Couple's Coordinator persona (Sam), family premium plan monetization, RASP security hardening, and offline backup/migration.

### Why This Next

- Bank connections (#265) are the most-requested feature in personal finance apps — this removes the biggest friction point (manual entry)
- Receipt OCR (#301) complements bank connections for cash transactions
- Family collaboration (#270) opens a new market segment and justifies the family premium plan (#339)
- RASP (#330) addresses remaining security hardening for a maturing financial app
- Offline backup (#302) prevents data loss — critical for user trust in an edge-first app

### Issues

| #     | Title                                              | Agent Type           | Priority | Effort | Source     |
| ----- | -------------------------------------------------- | -------------------- | -------- | ------ | ---------- |
| #265  | Bank connection API integration (Plaid/MX)         | backend + kmp        | P1       | XL     | Post-launch|
| #301  | Smart receipt scanning and OCR                     | kmp + ios/android    | P2       | L      | V2 backlog |
| #270  | Family/household collaboration features            | backend + kmp        | P1       | XL     | Post-launch|
| #339  | Family/household premium plan                      | backend              | P2       | M      | Stage 12   |
| #330  | Runtime application self-protection (RASP)         | ios/android/win      | P2       | L      | Stage 11   |
| #302  | Offline-first data migration and backup            | kmp + backend        | P2       | L      | V2 backlog |
| NEW-8 | Enterprise plan scoping and v1.2 release planning  | product              | P2       | M      | NEW        |
| NEW-9 | v1.2 launch campaign and family plan marketing     | marketing            | P2       | M      | NEW        |

**Total: 8 items (6 engineering + 2 business)**

### Engineering Breakdown by Agent

- **Backend Agent:** #265 (Plaid/MX API integration — institution search, OAuth link flow, transaction sync, webhook handling), #270 (family collaboration — household entity, member invitations, shared account permissions, RLS policies for multi-user access), #339 (family plan pricing, multi-seat entitlements, billing per household), #302 (backup endpoint — encrypted database export/import, cross-device migration)
- **KMP/Shared Agent:** #265 (bank connection shared models, account linking UI logic), #270 (shared household models, member permissions, shared budget logic), #301 (OCR result parsing, receipt data extraction models), #302 (offline backup/restore logic, encrypted export format)
- **iOS Agent:** #301 (camera capture with VisionKit, on-device OCR via Vision framework), #330 (jailbreak detection, debugger detection, integrity checks)
- **Android Agent:** #301 (CameraX capture, ML Kit text recognition for OCR), #330 (root detection, integrity verification via Play Integrity API, tamper detection)
- **Windows Agent:** #330 (Windows integrity verification, anti-debugging, code signing validation)
- **Web Agent:** #265 (Plaid Link web integration), #270 (household management UI)

### Bank Connection Architecture (Requires @architect + @security-reviewer)

```
Client (app) --> Supabase Edge Function --> Plaid/MX API --> Bank API
     |                   |
     |                   v
     +------------> PowerSync (transactions synced to client)
```

**Security requirements:**
- Plaid/MX access tokens stored **only** on server (never on client)
- All bank credentials handled by Plaid/MX — Finance app never sees them
- Token refresh and revocation handled server-side
- User can disconnect bank at any time with immediate token revocation
- Must pass @security-reviewer audit before shipping

### Family Collaboration Model

| Role   | Permissions                                                |
| ------ | ---------------------------------------------------------- |
| Owner  | Full access, manage members, billing, delete household     |
| Admin  | Full access, manage members (not billing)                  |
| Member | View shared accounts/budgets, add transactions, set goals  |
| View   | Read-only access to shared financial data                  |

### Dependencies

```
#265 (bank connections) --> requires @security-reviewer sign-off before merge
#265 --> requires Plaid/MX API key provisioning (human-gated)
#270 (family collaboration) --> backend auth model + sync engine must support multi-user
#270 --> #339 (family plan monetization depends on collaboration features)
#338 (Sprint 7, IAP) --> #339 (family plan extends IAP infrastructure)
#263 (Sprint 9, AI categorization) --> #265 (bank transactions feed into auto-categorization)
#301 (OCR) --> #263 (OCR results auto-categorized by AI)
#330 (RASP) --> independent per platform, all agents work in parallel
```

### Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Plaid/MX API costs significant at scale | High | Start with Plaid Sandbox then Development. Negotiate pricing. Pass cost to premium tier. |
| Bank connection security audit failure | Critical | Engage @security-reviewer early. Follow Plaid security best practices. Never store credentials. |
| Family collaboration RLS complexity | High | Extensive testing with multi-user scenarios. Edge cases: member removal, household deletion, data ownership on leave. |
| OCR accuracy varies by receipt quality | Medium | Set expectations in UI: works best with clear receipts. User confirms/edits parsed data. |
| RASP false positives on rooted/dev devices | Medium | Warn, do not block. Allow developer mode override in debug builds only. |
| Plaid institution coverage gaps | Low | Support manual entry as fallback. Display coming soon for unsupported banks. |

### Definition of Done

- [ ] Plaid/MX integration functional — users can link bank accounts and import transactions
- [ ] Bank connection security reviewed and approved by @security-reviewer
- [ ] Receipt OCR functional on iOS (VisionKit) and Android (ML Kit) — captures and parses receipt data
- [ ] Family/household collaboration working — create household, invite members, shared budgets
- [ ] Family premium plan purchasable with multi-seat pricing
- [ ] RASP protections active on iOS, Android, and Windows
- [ ] Offline backup and restore functional — encrypted database export/import
- [ ] Enterprise plan scope document drafted (target: Sprint 11+ if market demand)
- [ ] v1.2 launched with comprehensive release marketing

---

## Cross-Sprint Dependency Graph (Sprints 6-10)

```
Sprint 6                    Sprint 7                Sprint 8              Sprint 9              Sprint 10
---------                   ---------               ---------             ---------             ---------
#304 (APM) --------------> protects IAP ----------> monitor widgets ----> monitor ML ----------> monitor Plaid
#332 (rate limiting) -----> protects IAP endpoints
#329 (cert pinning) ------> secures IAP comms
#305 (notifications) -------------------------------------------> smart alerts ----------> anomaly/collab alerts
#320 (tips) --------------> contextual upgrade prompts

                            #337 (gating) --------> gates widgets ------> gates AI features --> gates bank/OCR
                            #338 (IAP) -----------> #342 (referral) --------------------------> #339 (family plan)
                            NEW-3 (paywall UX) ---> upgrade prompts throughout

                                                    #315 (dash widgets) ------------------------> dashboard data
                                                    #293 (platform widgets) ---------------------> widget Plaid data
                                                    #264 (i18n) --------------------------------> localize new features
                                                    #319 (quick entry) -> #322 (NLP) -----------> supplements OCR
                                                    #318 (bulk edit) ------------------------------------------->

                                                                          #263 (AI cat) -------> #265 (bank txn cat)
                                                                          #322 (NLP) ----------> supplements OCR
                                                                          #323 (anomaly) ------> alerts for bank txns
                                                                          #324 (predict) ------> better w/ bank data
                                                                          #325 (subs) ---------> auto-detect from bank
                                                                          #299 (health) -------> enriched by all data

                                                                                                 #265 (bank API)
                                                                                                 #301 (receipt OCR)
                                                                                                 #270 (family collab)
                                                                                                 #330 (RASP)
                                                                                                 #302 (backup)
```

---

## New Issues to Create

These issues should be created before Sprint 6 begins:

| ID    | Title                                                           | Sprint | Labels                          | Agent Type |
| ----- | --------------------------------------------------------------- | ------ | ------------------------------- | ---------- |
| NEW-1 | task(product): Post-launch analytics review and feedback synthesis  | 6   | task, analytics, priority:high  | product    |
| NEW-2 | task(marketing): v1.1 release planning and app store optimization   | 6   | task, priority:medium           | marketing  |
| NEW-3 | task(design): Premium upgrade UX — paywall and comparison design    | 7   | task, ui, priority:high         | design     |
| NEW-4 | task(product): Conversion funnel analytics and pricing validation   | 7   | task, analytics, priority:medium| product    |
| NEW-5 | task(marketing): i18n launch language selection and translation prep | 8   | task, priority:medium           | marketing  |
| NEW-6 | task(marketing): v1.1 launch campaign and growth marketing plan     | 8   | task, priority:medium           | marketing  |
| NEW-7 | task(marketing): AI features launch campaign and premium positioning| 9   | task, priority:medium           | marketing  |
| NEW-8 | task(product): Enterprise plan scoping and v1.2 release planning    | 10  | task, priority:medium           | product    |
| NEW-9 | task(marketing): v1.2 launch campaign and family plan marketing     | 10  | task, priority:medium           | marketing  |

---

## Descoped v1.0 Issue Disposition

All items descoped from v1.0 are now scheduled:

| #     | Title                          | Scheduled | Notes                                    |
| ----- | ------------------------------ | --------- | ---------------------------------------- |
| #237  | NLP transaction input          | —         | **Duplicate of #322.** Close #237.       |
| #242  | Gamification                   | Backlog   | Deferred to v1.3+. Not in Sprints 6-10.  |
| #315  | Customizable dashboard widgets | Sprint 8  | Paired with #293 (platform widgets)      |
| #316  | Spending watchlists            | Backlog   | Deferred. #323 (anomaly) covers some scope. |
| #318  | Bulk transaction editing       | Sprint 8  | Power user feature, grouped with growth  |
| #319  | Quick-entry transaction mode   | Sprint 8  | High-demand feature, grouped with growth |
| #320  | Contextual financial tips      | Sprint 6  | Quick win — content-driven, lower risk   |
| #338  | Premium subscription IAP       | Sprint 7  | Core monetization sprint                 |
| #337  | Freemium tier feature gating   | Sprint 7  | Core monetization sprint                 |

### Items NOT in Sprints 6-10 (Backlog for v1.3+)

| #     | Title                                    | Reason                                   |
| ----- | ---------------------------------------- | ---------------------------------------- |
| #242  | Gamification                             | Engagement feature; needs data on what users respond to first |
| #316  | Spending watchlists                      | Partially covered by #323 (anomaly detection). Revisit after Sprint 9. |
| #266  | Apple Watch / Wear OS tiles              | Companion app is v2 scope. Widgets (#293) are higher priority. |
| #267  | Browser extension                        | Niche. Web PWA covers most use cases.    |
| #294  | Siri/Google Assistant/Cortana            | Platform integrations — v2 after core intelligence layer ships |
| #295  | Biometric-protected categories           | Niche security feature. Revisit with user demand data. |
| #300  | Collaborative budget negotiation         | Complex UX. Revisit after #270 (family collab) ships. |
| #303  | Custom report builder                    | Premium feature. Revisit in v1.3 alongside advanced analytics. |
| #326  | Personalized savings suggestions         | AI feature. Revisit after Sprint 9 intelligence layer ships. |
| #327  | AI budget recommendations                | AI feature. Revisit after Sprint 9 intelligence layer ships. |
| #328  | Spending forecast w/ confidence intervals| AI feature. Revisit after Sprint 9 intelligence layer ships. |
| #331  | Device attestation                       | Security hardening. Revisit after #330 (RASP) ships. |
| #333  | Biometric liveness detection             | Security hardening. Revisit after #330 (RASP) ships. |
| #334  | Session binding / device fingerprinting  | Security hardening. Revisit after #330 (RASP) ships. |
| #343  | Enterprise/team plan                     | NEW-8 scopes this in Sprint 10. Execution is v1.3+. |
| #377  | Can I Afford This widget                 | Fun feature. Revisit after widgets (#293) ship. |
| #378  | Contextual financial education           | Partially covered by #320 (tips). Expand later. |
| #379  | Expertise tier system                    | UX enhancement. Revisit with user skill data. |
| #381  | Android home screen widgets              | **Covered by #293** (widget support across all platforms). Link as sub-task. |
| #382  | Financial learning paths (Premium)       | Premium content. Revisit in v1.3. |
| #383  | Non-manipulative streak tracking         | Engagement. Revisit alongside #242 (gamification). |
| #384  | Opt-in notification system               | **Partially covered by #305** (notification scheduling). |
| #385  | Two-path onboarding                      | Onboarding #768 shipped in v1.0. Revisit if data shows drop-off. |

---

## Velocity and Capacity Planning

### Sprint Sizing Assumptions

| Metric                   | Sprints 1-5 Actuals | Sprints 6-10 Target |
| ------------------------ | ------------------- | ------------------- |
| Issues per sprint        | 8-11                | 7-8                 |
| Engineering tasks        | 6-9                 | 5-6                 |
| Business tasks           | 1-2                 | 2                   |
| XL items per sprint      | 0-1                 | 1-2 (max)           |
| Agent parallelism        | 5-6 agents          | 5-7 agents          |
| Bug buffer               | 10-15%              | 15-20% (post-launch)|

> **Rationale for lower velocity target:** Post-launch sprints carry higher interrupt load (bug reports, user feedback, app store issues). We also tackle more XL-effort features (IAP, i18n, AI, bank connections). Planning for 7-8 issues per sprint with 15-20% buffer is more realistic.

### Agent Utilization Across Sprints 6-10

| Agent            | Sprint 6       | Sprint 7       | Sprint 8              | Sprint 9                    | Sprint 10              |
| ---------------- | -------------- | -------------- | --------------------- | --------------------------- | ---------------------- |
| KMP/Shared       | #320           | #337, #341     | #315, #264, #319, #318| #263, #322, #324, #325, #299| #265, #270, #301, #302 |
| Backend          | #304, #332, #305| #344          | #342                  | #263, #323                  | #265, #270, #339, #302 |
| iOS              | #329           | #338           | #293, #264            | platform integration        | #301, #330             |
| Android          | #329           | #338           | #293, #264            | platform integration        | #301, #330             |
| Web              | —              | #338           | #264                  | platform integration        | #265                   |
| Windows          | #329           | #338           | #293, #264            | platform integration        | #330                   |
| DevOps           | #304           | —              | —                     | —                           | —                      |
| Design           | —              | NEW-3          | —                     | #299                        | —                      |
| Product          | NEW-1          | NEW-4          | —                     | —                           | NEW-8                  |
| Marketing        | NEW-2          | #340           | NEW-5, NEW-6          | NEW-7                       | NEW-9                  |

---

## Sprint Metrics to Track (Post-Launch KPIs)

| Metric                          | Target              | Measured From |
| ------------------------------- | ------------------- | ------------- |
| Sprint completion rate          | 80% or greater      | Sprint close  |
| P0/P1 bug response time        | Under 24 hours      | Issue triage  |
| Crash-free rate                 | 99.5% or greater    | APM (#304)    |
| DAU / MAU                       | 25% or greater      | Analytics     |
| Free to Premium conversion     | 3% or greater (30d) | Funnel (NEW-4)|
| App store rating                | 4.5 stars or greater| Stores        |
| Feature adoption (new features) | 30% of MAU or greater| Analytics    |
| Premium ARPU                    | Track (no target)   | Revenue       |
| Referral program virality       | 1.1 K-factor or greater| #342 metrics|
| i18n expansion readiness        | 5 languages         | #264 status   |
| AI categorization accuracy      | 80% or greater (top-3)| ML metrics  |

---

## Release Calendar

| Date (Relative)  | Event                                    | Milestone |
| ---------------- | ---------------------------------------- | --------- |
| Week 12          | v1.1-rc1 — stabilization + security      | v1.1      |
| Week 14          | v1.1 release — monetization live         | v1.1      |
| Week 15          | v1.1 marketing push — premium launch     | v1.1      |
| Week 16          | v1.2-alpha — widgets + i18n preview      | v1.2      |
| Week 18          | v1.2-beta — AI features beta             | v1.2      |
| Week 20          | v1.2 release — full feature release      | v1.2      |
| Week 21          | v1.2 marketing push — bank + family      | v1.2      |

---

## Summary: Issue Count by Sprint

| Sprint | Eng | Design | Business | Buffer | Total | XL Items | Key Risk                |
| ------ | --- | ------ | -------- | ------ | ----- | -------- | ----------------------- |
| 6      | 5   | 0      | 2        | 1      | 8     | 0        | Post-launch bug volume  |
| 7      | 4   | 1      | 2        | 0      | 7     | 2        | App store IAP rejection |
| 8      | 6   | 0      | 2        | 0      | 8     | 2        | i18n retrofitting scope |
| 9      | 6   | 0      | 1        | 0      | 7     | 1        | ML model size/accuracy  |
| 10     | 6   | 0      | 2        | 0      | 8     | 2        | Bank API security audit |
| **Total** | **27** | **1** | **9** | **1** | **38** | **7** |                     |

### All Existing Issues Scheduled (27 issues from backlog)

| Sprint 6 | Sprint 7 | Sprint 8 | Sprint 9 | Sprint 10 |
| -------- | -------- | -------- | -------- | --------- |
| #304     | #337     | #315     | #263     | #265      |
| #332     | #338     | #293     | #322     | #301      |
| #329     | #344     | #264     | #323     | #270      |
| #320     | #341     | #319     | #324     | #339      |
| #305     | #340     | #318     | #325     | #330      |
|          |          | #342     | #299     | #302      |

### New Issues to Create (9 business/design tasks)

NEW-1 through NEW-9 (see New Issues to Create section above)

---

*This document is the source of truth for post-launch sprint execution. Updated after each sprint retrospective. Predecessor: [Sprint Plan 1-5](sprint-plan-1-5.md).*
