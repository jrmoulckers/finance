# Design Decisions Record — May 2026

> **Date**: 2026-05-19
> **Participants**: Human (product owner), Copilot (facilitator)
> **Scope**: 19 issues from the [Issue Triage Report](../business/issue-triage-report.md) flagged as needing human design decisions

## Table of Contents

- [Architecture Decisions](#architecture-decisions)
- [Product Decisions](#product-decisions)
- [Design Decisions](#design-decisions)
- [New Issues Created](#new-issues-created)
- [Summary Table](#summary-table)

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
