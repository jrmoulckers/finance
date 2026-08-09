# Finance — product

> **Product authority:** obligations are defined in
> [jrmoulckers/product](https://github.com/jrmoulckers/product) and cited here by
> stable ID. This document is the local, per-application product definition —
> the shape is central (`templates/PRODUCT.md`), the instance is local.
> Ratified obligation set:
> [`3a752c1`](https://github.com/jrmoulckers/product/tree/3a752c11856515a74eb204675d5d5198cac1e48e/principles).

## Users

> Satisfies `PROD-STRAT-001`, `PROD-BUS-003`.

People who want to understand their money without needing a finance degree.
They are not spreadsheet users and do not want to become spreadsheet users. They
track money in short bursts — standing in a checkout line, on a phone, often
offline, frequently interrupted — rather than in a weekly sit-down session.

The audience explicitly includes users with cognitive differences; ADHD-friendly
design is a design principle rather than an accessibility checkbox. Users span
personal, partnered, and family financial arrangements, so a household is the
primary tenancy and data-isolation boundary rather than an add-on.

Evidence and interpretation for market claims, competitive position, and
international opportunity are dated and recorded separately in
[`docs/business/revenue/`](docs/business/revenue/),
[`docs/business/pricing/`](docs/business/pricing/), and
[`docs/business/sprints/sprint-8-i18n-market-research.md`](docs/business/sprints/sprint-8-i18n-market-research.md).
Where those documents record an assumption rather than an observation, they label
it as such. The behavioral profile above is an assumption pending post-launch
measurement; the retention and engagement evidence that would confirm or refute it
is tracked in [`docs/business/growth/`](docs/business/growth/).

## Purpose

> Satisfies `PROD-STRAT-001`, `PROD-STRAT-003`.

Finance makes tracking personal, partnered, and family money accessible to people
who do not think in spreadsheets. It translates financial complexity into human
language, keeps financial data on the user's device by default, and makes the
daily act of recording money take less than 30 seconds. Working well means a user
can answer "where did my money go?" and "can I afford this?" without study,
without a network connection, and without handing their financial life to a third
party.

## Promise

> Satisfies `PROD-STRAT-001`, `PROD-BUS-001`.

**See your money clearly. Keep it private. No expertise required.**

Proof points:

1. **Works with your brain** — an expertise-tiered interface adapts language and
   complexity to the user instead of demanding the user adapt to the product.
2. **Your money never leaves your device** — offline-first, encrypted at rest,
   sync is opt-in.
3. **30 seconds or less** — three-tap transaction entry and a widget-first daily
   habit loop.
4. **Facts, not judgments** — the product observes and informs; it never shames.

Trust constraints that no growth or monetization decision may weaken:

- On-device-first storage and encryption at rest are not negotiable for revenue.
- Sync is opt-in and remains opt-in.
- Financial data is never sold, shared, or used to build advertising profiles.
  Finance has no advertising business model.
- A user's access to their own existing data — including export and deletion — is
  never gated behind a paid tier.
- Non-judgmental language is a product obligation, not a copy preference.

## Operating context and constraints

> Satisfies `PROD-STRAT-003`, `PROD-PLAN-003`.

Four first-class platforms: iOS (iPhone, iPad, Mac, watchOS), Android (phone,
tablet, Wear OS), Web (PWA), and Windows 11. Platform parity is an explicit
obligation, not an aspiration; intentional parity gaps are recorded as decisions
rather than discovered at release. Current parity state and the dated assessment
live in
[`docs/business/roadmap/launch-readiness-dashboard-and-platform-parity.md`](docs/business/roadmap/launch-readiness-dashboard-and-platform-parity.md).

Connectivity is assumed to be intermittent. The product is fully functional
offline; synchronization is opportunistic and optional. Data ownership sits with
the user: local storage is the system of record from the user's perspective, and
export is always available.

If the optional sync backend is unavailable, single-device tracking, budgeting,
goals, reporting, and export all continue to work. If the optional bank-connection
aggregator is unavailable, manual entry and file import remain the supported paths
— manual entry is the primary path, not a fallback. If the optional AI layer is
unavailable, categorization and budgeting remain available manually.

The household is the tenancy and isolation boundary. Constraints accepted for the
single-user alpha are recorded in
[`docs/business/sprints/alpha-household-constraints.md`](docs/business/sprints/alpha-household-constraints.md).

Mechanism choices that realize this context — the shared-logic strategy, storage
engine, sync engine, and per-platform interface technology — are Engineering and
Studio decisions recorded in [`docs/architecture/`](docs/architecture/), not
product obligations.

## Invariants

> Satisfies `PROD-PLAN-002`, `PROD-REL-003`.

These must remain true of product behavior regardless of implementation. A change
may not silently break one.

1. Core tracking — accounts, transactions, budgets, goals, categories, and rules —
   works with no network connection.
2. Financial data is encrypted at rest on the device.
3. Synchronization is opt-in and can be declined without losing core function.
4. A user can export their own complete financial data at any time, on any tier,
   in a machine-readable format.
5. A user can delete their account and have their personal data erased within the
   promised window recorded in
   [`docs/compliance/data-retention-schedule.md`](docs/compliance/data-retention-schedule.md).
6. Monetary amounts are held and computed as integer minor units with
   `HALF_EVEN` rounding; no monetary value is stored or computed as a binary
   floating-point number.
7. Household data is isolated: no user sees another household's financial data.
8. User-facing financial language observes and informs; it does not assign blame.
9. Privacy, safety, accessibility, and access to a user's own existing data are
   never placed behind a paid tier.
10. Financial data is never sold, shared for advertising, or used to derive an
    advertising profile.
11. Every user-facing surface meets WCAG 2.2 AA at minimum.
12. An AI-produced categorization, forecast, or insight is identifiable as such and
    can be corrected or overridden by the user.

## Scope and non-goals

> Satisfies `PROD-PLAN-001`, `PROD-PLAN-004`, `PROD-STRAT-003`.

Outcome milestones, sequenced rather than enumerated as features:

1. **Track confidently on one device** — a user records and understands their
   money offline, on any of the four platforms, without instruction.
2. **Plan and pursue** — budgeting and goal tracking make future money legible,
   not just past money.
3. **Share a financial life** — household and partner arrangements work without
   either party losing privacy or control.
4. **Understand without studying** — contextual education and reporting turn data
   into comprehension.
5. **Reduce the effort** — assistive categorization, import, and forecasting cut
   the manual cost of accuracy.

Each milestone is valuable if the ones after it never ship. Dated sequencing lives
in [`docs/business/roadmap/`](docs/business/roadmap/) and
[`docs/business/sprints/`](docs/business/sprints/).

Non-goals — as load-bearing as the goals:

- Not an investment brokerage, trading platform, or tax-filing service.
- Not a financial-advice product. It does not tell a user what they should do with
  their money.
- Not a data business. There is no advertising model and no data resale.
- Not a spreadsheet replacement for professional accounting.
- Not cloud-first. A server-dependent product is out of scope by design.

## Anti-references

> Satisfies `PROD-STRAT-001`.

This must never feel like:

- **A budgeting app that scolds.** Shame-based framing drives users to stop
  looking at their money, which is the opposite of the promise.
- **A product that holds your data hostage.** Export and deletion behind a paywall,
  or a proprietary format, converts trust into lock-in.
- **A dashboard for financial professionals.** Dense terminology and unexplained
  ratios exclude exactly the users this product exists for.
- **An engagement-optimized feed.** Time in app is not the goal; 30 seconds and out
  is the goal.
- **A free product whose real product is the user.** Any monetization path that
  depends on the financial data itself is rejected regardless of revenue.

## Monetization

> Satisfies `PROD-BUS-001`, `PROD-BUS-002`.

The value metric charged for is the **assistive intelligence and multi-device
layer**, not access to a user's own financial data.

- **Free** — the complete single-device financial tracker: all accounts,
  transactions, budgets, goals, categories, and rules; the full expertise-tiered
  interface; contextual education; basic reporting; and data export.
- **Paid** — AI categorization, suggested budgets, forecasting, holistic goal and
  portfolio analysis, structured learning paths, multi-device sync, household
  sharing, and advanced reporting.

Never gated, on any tier: privacy and encryption, accessibility, data export, data
deletion, and access to a user's own existing data.

Tier boundaries, prices, the value hypothesis, and the dated competitive and
sensitivity evidence are recorded in
[`docs/business/revenue/monetization-roadmap.md`](docs/business/revenue/monetization-roadmap.md),
[`docs/business/pricing/premium-strategy-conversion-funnel.md`](docs/business/pricing/premium-strategy-conversion-funnel.md),
and [`docs/business/pricing/`](docs/business/pricing/). Viability assumptions,
ranges, and reassessment triggers are recorded there rather than restated here.

## Measurement

> Satisfies `PROD-MET-001`, `PROD-MET-002`.

The local metric catalog is
[`docs/business/growth/kpi-dashboard-spec.md`](docs/business/growth/kpi-dashboard-spec.md)
§2, with collection bounds and privacy constraints stated alongside each
definition. Supporting analysis and readouts live in
[`docs/business/growth/`](docs/business/growth/).

Definitions are not restated here. Measurement is bounded by purpose and consent:
telemetry is consent-gated and excludes raw financial values. Consent evidence is
[`docs/compliance/consent-management-audit.md`](docs/compliance/consent-management-audit.md).

## Compliance posture

> Satisfies `PROD-COMP-002`, `PROD-COMP-003`, `PROD-COMP-005`.

Processing is bounded to operating the product for the user: recording and
presenting the user's own financial data, optional synchronization between that
user's own devices and their household, and consent-gated product telemetry that
excludes raw financial values. Financial data is not processed for advertising,
profiling, or resale.

Retention is bounded per data category, with a stated terminal disposition, in
[`docs/compliance/data-retention-schedule.md`](docs/compliance/data-retention-schedule.md).
The processing map and data inventory are in
[`docs/compliance/data-inventory.md`](docs/compliance/data-inventory.md), and
rights-handling evidence — access, erasure, portability, and CCPA/CPRA
verification — is in [`docs/compliance/`](docs/compliance/).

Obligation-to-evidence traceability is
[`docs/compliance/README.md`](docs/compliance/README.md), which satisfies
`PROD-COMP-001`.

Compliance principles establish governance, evidence expectations, and triggers
for qualified human review. They are not legal advice, and nothing in this
document or the linked evidence is legal advice.

## Accessibility and inclusion

> Satisfies `PROD-CONTENT-005`.

Every user-facing surface meets WCAG 2.2 AA at minimum. This is a product
obligation, not a design preference: an inaccessible surface is an unmet
obligation regardless of how it looks. Cognitive accessibility is in scope —
progressive disclosure, plain-language tiering, and non-judgmental framing exist
because financial anxiety and cognitive load are accessibility concerns.

Conformance evidence is
[`docs/compliance/vpat-2.5.md`](docs/compliance/vpat-2.5.md). Studio owns the
interface expression; this section owns the obligation.

## Authority

> Satisfies `PROD-CONTENT-001`.

Product obligations are defined in
[jrmoulckers/product](https://github.com/jrmoulckers/product). Engineering
mechanisms are defined in
[jrmoulckers/engineering](https://github.com/jrmoulckers/engineering), design and
interface in [jrmoulckers/studio](https://github.com/jrmoulckers/studio), and
automation in [jrmoulckers/.github](https://github.com/jrmoulckers/.github).

This document defines what this product owes its users. It does not define
mechanism, interface implementation, or automation. The detailed interface and
identity specification is
[`docs/design/product-identity.md`](docs/design/product-identity.md); the system
architecture is [`docs/architecture/roadmap.md`](docs/architecture/roadmap.md).
