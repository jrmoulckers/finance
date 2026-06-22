# Design Decisions Record — May 2026

> **Date**: 2026-05-19
> **Participants**: Human (product owner), Copilot (facilitator)
> **Scope**: 19 issues from the [Issue Triage Report](../business/sprints/issue-triage-report.md) flagged as needing human design decisions

## Table of Contents

### Session 1 — May 19, 2026

- [Architecture Decisions](#architecture-decisions)
- [Product Decisions](#product-decisions)
- [Design Decisions](#design-decisions)
- [New Issues Created](#new-issues-created)
- [Summary Table](#summary-table)

### Session 2 — May 20, 2026

- [ADR-010: Alpha Launch — All Four Platforms](#adr-010-alpha-launch--all-four-platforms)
- [ADR-011: AI Feature Tiering](#adr-011-ai-feature-tiering)
- [ADR-012: Receipt OCR — On-Device Platform ML](#adr-012-receipt-ocr--on-device-platform-ml)
- [ADR-013: Banking Integration — Provider-Agnostic Abstraction](#adr-013-banking-integration--provider-agnostic-abstraction)
- [ADR-014: Platform UX Enhancements — All v2](#adr-014-platform-ux-enhancements--all-v2)
- [ADR-015: Privacy Features — Biometric v1, Rest v2](#adr-015-privacy-features--biometric-v1-rest-v2)
- [ADR-016: iOS Extensions — Widgets v1, Watch v2](#adr-016-ios-extensions--widgets-v1-watch-v2)
- [ADR-017: External Integrations — All v2](#adr-017-external-integrations--all-v2)
- [Issues Created This Session](#issues-created-this-session)
- [Issues Closed This Session](#issues-closed-this-session)

---

## Architecture Decisions

### ADR-001: AI Infrastructure (#1633, #1742, #1637)

**Issues**: AI Natural Language Financial Query Engine (#1633), Personalized wealth-insights digest (#1742), Proactive Overspend Coach (#1637)

**Decision**: **Deferred** — All three AI features are deferred. These are complex and carry risk for a financial app. Focus on non-AI features first.

**Rationale**: AI features require resolving privacy vs. capability trade-offs (on-device vs. cloud LLM for financial data). The privacy-first principle conflicts with cloud-based AI that sends financial data off-device. Deferring allows the core product to mature before adding AI complexity.

**Impact**: No AI features in v1.x. Revisit for v2.0+ after core features are stable.

---

### ADR-002: Self-Hosted Sync (#1632)

**Decision**: **Begin implementation** — Create a sync backend abstraction layer now so the sync backend is swappable between PowerSync/Supabase and self-hosted options.

**Rationale**: Building the abstraction early prevents tight coupling to PowerSync/Supabase. Self-hosted sync is a key differentiator for privacy-conscious users.

**Implementation**: Define a `SyncProvider` interface in `packages/sync/` with PowerSync as the default implementation. Self-hosted implementation to follow.

---

### ADR-003: Personal Data API (#1610)

**Decision**: **Deferred** — No external API until core features are stable and security is audited.

**Rationale**: An external API is a potential vector for data exfiltration. Requires thorough security review, rate limiting, and auth model design before exposing any financial data programmatically.

---

### ADR-004: Financial Automation Rule Engine (#1614)

**Decision**: **Hybrid with monetization tiering**

- **Free tier**: Rules execute on-device only (edge-first). May be slower, requires app to be open/not force-quit.
- **Premium tier**: Server-side triggers and cloud-backed rules for complex automation. Faster, runs in background.

All features are available at every tier — free users just run them on-device.

**Rationale**: Aligns with edge-first architecture for free users while providing a compelling premium upgrade path. Server-side rules enable background execution and cross-device triggers.

---

### ADR-005: ML Transaction Auto-Categorization (#1545)

**Decision**: **Rule-based now, ML deferred**

- **Current**: Implement deterministic keyword/merchant matching (covers ~80% of use cases)
- **Future (free)**: On-device ONNX model (#1818)
- **Future (premium)**: Cloud AI model (#1819)
- **Future (self-hosted)**: Self-hosted AI model (#1820)

**Rationale**: Rule-based categorization provides immediate value without ML complexity. Three-tier ML approach allows users at every level to benefit while creating upgrade incentive.

---

## Product Decisions

### PD-001: Peer Spending Benchmarks (#1670, #1778)

**Decision**: **Local BLS benchmarks only** for the standard feature. Premium social benchmarks deferred to #1817.

- Compare user spending against published Bureau of Labor Statistics Consumer Expenditure Survey data
- No user data shared or collected for benchmarking
- Premium feature (#1817): Friends can set up shared spending benchmarks and fun goals (opt-in, privacy-first)

---

### PD-002: Accountability Partner (#1777)

**Decision**: **Implement** — Allow users to share financial progress with a user-selected accountability partner.

- Partners can be inside or outside the household
- User explicitly elects their accountability partner (no social randomization)
- Fully compliant with privacy regulations
- Granular control over what data is shared

---

### PD-003: Anti-Coercion Safeguards (#1727)

**Decision**: **Implement basic safeguards** that meet or exceed industry standards.

- ADP-style masked view: show percentages, colors, trends, and visuals without raw financial amounts
- Default option to show no numbers (similar to ADP paystub privacy view)
- Duress PIN/biometric that opens a "safe" view
- Hidden accounts invisible to abusive partners
- Discreet access to domestic violence resources

**Design reference**: ADP paystub privacy view pattern where amounts are hidden but trends, categories, and relative information remain visible.

---

### PD-004: Emotional Spending & Mood Correlation (#1773, #1656)

**Decision**: **Two-tier approach**

- **Default**: Simple mood tagging on transactions (optional emoji/mood tag). Show spending-mood correlations. No clinical advice or scores.
- **Experimental opt-in**: Full wellness features (anxiety scores, mood tracking, deeper correlations) with appropriate disclaimers and user assumption of risk.

**Rationale**: Mood-spending correlations are useful insight but clinical validity is a liability concern. The experimental flag gives interested users access while protecting the app from clinical advice claims.

---

### PD-005: Financial Decision Alignment Score (#1751)

**Decision**: **Implement** with goal alignment and user-defined values.

- Users craft their financial vision (goals, values, priorities, timelines)
- App assesses spending/saving alignment against their stated vision
- Scoring is a continuous scale, not pass/fail
- Non-judgmental framing per content language guidelines (PR #1804)

---

### PD-006: Estate and End-of-Life Financial Inventory (#1774)

**Decision**: **Data inventory only** — "Here's everything you have" document generator.

- Lists all accounts, assets, beneficiaries, important documents
- No legal advice whatsoever
- Full disclaimers ("consult your attorney")
- Legal API integration deferred to #1821 (premium feature)

---

### PD-007: Relationship Transition Finance Wizard (#1772)

**Decision**: **Account separation tool** — Paywalled advanced feature.

- Helps visualize splitting shared accounts and adjusting budgets
- No legal or relationship advice
- Full disclaimers
- Premium/paywalled feature

---

## Design Decisions

### DD-001: Cognitive Simplification Mode (#1703) & Elder/Caregiver Mode (#1732)

**Decision**: **Separate features** with distinct purposes.

- **Cognitive simplification** (#1703): Standalone accessibility feature. Reduces UI complexity for users who want a simpler experience (not limited to elders).
- **Caregiver mode** (#1732): Implemented as a delegation/accountability partner feature. A caregiver is granted read-only (or limited) access to financial data. Loops into the accountability partner system (#1777).

**Rationale**: Simplification is an accessibility concern (WCAG). Caregiving is a permissions/delegation concern. Conflating them would create a confusing UX.

---

### DD-002: Natural-Language Voice Transaction Capture (#1752)

**Decision**: **Deferred** — Use platform-native voice-to-text instead.

Each platform already provides voice-to-text input (iOS keyboard dictation, Android voice input, Windows speech-to-text). No need for a custom in-app voice capture feature at this time.

---

### DD-003: Stable Navigation and Muscle Memory (#1725)

**Decision**: **Deferred** — Navigation is still evolving; too early to lock it down.

Navigation structure will stabilize naturally as features are implemented. Locking it prematurely would constrain design decisions.

---

## New Issues Created

| Issue | Title                                           | Tier        | Background       |
| ----- | ----------------------------------------------- | ----------- | ---------------- |
| #1817 | Premium social spending benchmarks with friends | Premium     | Split from #1670 |
| #1818 | On-device ML transaction auto-categorization    | Free        | Split from #1545 |
| #1819 | Cloud AI transaction auto-categorization        | Premium     | Split from #1545 |
| #1820 | Self-hosted AI transaction auto-categorization  | Self-hosted | Split from #1545 |
| #1821 | Legal service API for estate planning           | Premium     | Split from #1774 |

---

## Summary Table

| #     | Issue                           | Decision                              | Status                  |
| ----- | ------------------------------- | ------------------------------------- | ----------------------- |
| #1633 | AI NL Query Engine              | Deferred                              | —                       |
| #1742 | Wealth insights NL assistant    | Deferred                              | —                       |
| #1637 | Proactive Overspend Coach       | Deferred                              | —                       |
| #1632 | Self-hosted sync                | Implement abstraction layer           | Actionable              |
| #1610 | Personal Data API               | Deferred                              | —                       |
| #1614 | Automation Rule Engine          | Hybrid (free=edge, premium=cloud)     | Actionable              |
| #1545 | ML auto-categorization          | Rule-based now, ML later              | Actionable (rule-based) |
| #1670 | Peer spending benchmarks        | Local BLS only                        | Actionable              |
| #1778 | Differential-privacy benchmarks | Deferred (premium social → #1817)     | —                       |
| #1777 | Accountability partner          | Implement (opt-in, user-selected)     | Actionable              |
| #1727 | Anti-coercion safeguards        | Implement (ADP-style + duress)        | Actionable              |
| #1773 | Emotional spending journal      | Simple mood tagging + experimental    | Actionable              |
| #1656 | Financial Wellness Insights     | Experimental opt-in only              | Actionable              |
| #1751 | Decision Alignment Score        | Implement (user-defined values)       | Actionable              |
| #1774 | Estate financial inventory      | Data inventory only (no legal)        | Actionable              |
| #1772 | Relationship transition wizard  | Account separation tool (premium)     | Actionable              |
| #1703 | Cognitive simplification        | Standalone a11y feature               | Actionable              |
| #1732 | Elder/caregiver mode            | Delegation feature (→ #1777)          | Actionable              |
| #1752 | Voice transaction capture       | Deferred (use platform voice-to-text) | —                       |
| #1725 | Stable navigation               | Deferred (too early)                  | —                       |

---

## Session 2 — May 20, 2026

### Participants

- Human (product owner), Copilot (facilitator)

### Scope

8 design topics covering alpha launch, AI roadmap, receipt OCR, banking integrations, platform UX, privacy, iOS widgets, and external integrations.

---

### ADR-010: Alpha Launch — All Four Platforms

**Decision**: Ship alpha to all 4 platforms simultaneously (iOS, Android, Web, Windows).

**Scaffolding prepared** (branches, not PRs — human must complete enrollments first):

- `feat/ios-signing-scaffolding-1239` — Fastlane + Match + provisioning profiles
- `feat/android-signing-scaffolding-1242` — Gradle signing + Fastlane + Play Console
- `feat/oauth-scaffolding-1241` — Google + Apple Sign-In via Supabase
- `feat/windows-signing-scaffolding-1244` — MSIX signing + SignTool
- `feat/alpha-deploy-scaffolding-1248` — Submission checklist + web deployment

**E2E test plan**: 78-item verification matrix posted to #1243.

**Human-gated**: All enrollments, certificates, and credential configuration must be done by human before scaffolding branches can be merged.

---

### ADR-011: AI Feature Tiering

**Decision**: Keep all 15 AI issues open, categorized into priority tiers for v2+.

| Tier           | Priority | Issues                                                                                                                                           |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — High value | v2.0     | #1637 (overspend coach), #1647 (AI savings goals), #1633 (NLP query), #1742 (wealth digest)                                                      |
| B — Medium     | v2.x     | #1642 (AI recommendations), #1661/#1770 (explain this), #1818/#1819/#1820/#1545 (ML categorization)                                              |
| C — Low        | v3+      | #1656 (mood AI), #1751 (decision alignment), #1748 (AI savings — overlaps #1647), #1665 (learning path), #1753 (receipt OCR — merged into #1852) |

**Rationale**: AI carries privacy and cost risks for a financial app. Tier A features could start rule-based (automation engine built in #1849) and upgrade to ML later.

---

### ADR-012: Receipt OCR — On-Device Platform ML

**Decision**: Use on-device OCR via platform-native ML APIs. No cloud OCR dependency.

| Platform | API                                       |
| -------- | ----------------------------------------- |
| iOS      | Vision Framework (VNRecognizeTextRequest) |
| Android  | ML Kit Text Recognition v2                |
| Web      | Tesseract.js (WASM, runs in browser)      |
| Windows  | Windows.Media.Ocr namespace               |

**Consolidated issue**: #1852 replaces #1611, #1615, #1753.

**Rationale**: On-device processing is free, privacy-preserving, and works offline — aligned with edge-first architecture.

---

### ADR-013: Banking Integration — Provider-Agnostic Abstraction

**Decision**: Build a `BankConnectionProvider` abstraction layer supporting any aggregator, self-hosted solution, or manual import.

**Architecture**:

```
BankConnectionProvider (interface)
├── PlaidProvider         (#1854)
├── MXProvider            (#1855)
├── TrueLayerProvider     (#1856 — international)
├── ManualImportProvider   (built — uses lib/import/)
├── SelfHostedProvider    (#1857)
└── MockProvider          (built — for testing)
```

**Rationale**: Provider-agnostic design allows cost pivoting, supports privacy-focused self-hosted users, and avoids vendor lock-in. Manual import already works via lib/import/ parsers.

**Issues created**: #1853 (abstraction), #1854 (Plaid), #1855 (MX), #1856 (TrueLayer), #1857 (self-hosted).

---

### ADR-014: Platform UX Enhancements — All v2

**Decision**: All gesture/haptic/drag-drop features deferred to v2. Core UI must stabilize first.

**Epic**: #1858 tracks all 7 issues (#1760, #1756, #1764, #1758, #1725, #1651, #1638).

**v2 priority order**: Navigation stability → Swipe actions → Haptics → Milestone notifications → Drag-and-drop.

---

### ADR-015: Privacy Features — Biometric v1, Rest v2

**Decision**: Biometric-protected sensitive categories (#1719) is v1. All other privacy UI features are v2 (data layers already built).

| Issue                                   | Version | Data Layer                                            |
| --------------------------------------- | ------- | ----------------------------------------------------- |
| #1719 — Biometric categories            | v1      | Platform-native (Face ID, fingerprint, Windows Hello) |
| #1643 — Public privacy mode             | v2      | Built in lib/enhancements/                            |
| #1613 — Widget privacy masking          | v2      | Depends on widget implementation                      |
| #1778 — Differential privacy benchmarks | v2      | Built in lib/social/                                  |
| #1697 — Encryption details center       | v2      | Built in lib/enhancements/                            |

---

### ADR-016: iOS Extensions — Widgets v1, Watch v2

**Decision**: iOS home-screen and lock-screen widgets are v1. Apple Watch is v2.

| Issue                                  | Version            |
| -------------------------------------- | ------------------ |
| #1605 — Lock-screen quick-entry widget | v1                 |
| #1608 — Home-screen budget widget      | v1                 |
| #1613 — Widget privacy masking         | v1 (ties to #1719) |
| #1618 — Apple Watch glanceable budget  | v2                 |
| #1623 — Apple Watch quick-entry flow   | v2                 |

---

### ADR-017: External Integrations — All v2

**Decision**: All external integration features are v2. Banking abstraction layer (#1853) is the foundation.

**Epic**: #1859 tracks all integration issues.

**Rationale**: External APIs have ongoing costs, require contracts/API keys, and add maintenance burden. Build abstraction first, add providers based on user demand.

---

### Issues Created This Session

| #     | Title                                       | Type         |
| ----- | ------------------------------------------- | ------------ |
| #1852 | On-device receipt OCR with itemized parsing | Consolidated |
| #1853 | Banking connection abstraction layer        | New          |
| #1854 | Plaid banking provider                      | New          |
| #1855 | MX banking provider                         | New          |
| #1856 | TrueLayer international provider            | New          |
| #1857 | Self-hosted banking sync provider           | New          |
| #1858 | v2 Platform UX enhancements epic            | Epic         |
| #1859 | v2 External integrations epic               | Epic         |

### Issues Closed This Session

| #     | Reason                            |
| ----- | --------------------------------- |
| #1611 | Superseded by #1852               |
| #1615 | Superseded by #1852               |
| #1753 | Superseded by #1852               |
| #1545 | Superseded by #1818, #1819, #1820 |
