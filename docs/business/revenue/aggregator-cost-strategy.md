# Aggregator Cost Strategy — Correcting the Plaid Cost Model and Setting a Switch Rule

**Issue:** #4380
**Related:** #4379 (P0 — bank connections have no entitlement gate or cap)
**Priority:** P1 — High
**Status:** Complete — pending decision on the Item cap value
**Document Owner:** Business Analysis
**Date:** 2026-08-23

> **Satisfies:** `PROD-BUS-003` — Product obligations are defined in
> [jrmoulckers/product](https://github.com/jrmoulckers/product). This document is the local
> instance and evidence; the obligation is central.

---

## Executive Summary

This analysis was triggered by the claim that **"Plaid is $0.30 per API call, which is detrimental
to our business model."**

**That premise is wrong on the unit.** Plaid's Transactions product — the only product we request —
is billed as a **recurring monthly subscription per Item**, not per API call. Our incremental
`/transactions/sync` calls and inbound webhooks are not separately metered. The `$0.30` figure is
a community pay-as-you-go benchmark, not an official list price; Plaid publishes no price list at
all.

Correcting the unit changes the conclusion. The four findings that matter:

1. **There is no per-call cost problem.** We do not use any per-request Plaid product. Sync
   frequency, webhook volume, and backfill depth are cost-free at the margin. Optimizing call
   volume would save nothing.
2. **The cost driver is Items, and an Item is one institution login, not one account.** COGS scales
   with how many institutions a user links, not with how many accounts or how often we sync.
3. **At realistic Item counts the model is healthy; at high Item counts it is not.** Aggregation
   COGS runs **7.7%–20.6% of net revenue at 1–2 Items** and **30.9% at 3 Items on mobile**. The
   margin problem starts at 3+ Items on mobile, not at any headline rate.
4. **The real exposure is not provider choice — it is that the documented premium gate does not
   exist.** Confirmed: free-tier users can create unlimited Items, each an open-ended monthly
   liability against $0 revenue. Modeled below, this can exceed **100% of total net revenue**.
   Filed as **#4379**.

**Recommendation: do not switch providers. Cap and gate Items, then tier aggregation.** No
evaluated alternative is cheaper at published rates, and the one we have already built (MX) was
previously modeled as _more_ expensive. The switch decision rule is in
[§7](#7-recommendation-and-decision-rule) so this is not re-litigated from vibes next quarter.

---

## 1. What Plaid Actually Costs Us

### 1.1 The four Plaid pricing models

Plaid Customer Help Center,
["How much does Plaid cost, and what are the pricing models?"](https://support.plaid.com/hc/en-us/articles/16194632655895)
(updated 2026-08-13), states Plaid uses four models:

| Model                     | Basis                                                                                    | Products                                   |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| One-time fees             | Charged once per connected account, **regardless of how many API calls are made for it** | Auth, Identity                             |
| **Subscription fees**     | **"A recurring monthly fee for as long as the Item exists"**                             | **Transactions**, Liabilities, Investments |
| Per-request flat fees     | Flat fee per successful API request                                                      | Balance, Signal                            |
| Per-request flexible fees | Varies by request parameters                                                             | —                                          |

**Only Balance and Signal are per-request.** We use neither.

### 1.2 Our actual Plaid surface

We request exactly one product:

```ts
// services/api/supabase/functions/_shared/plaid.ts:175
products: ['transactions'],
```

We call five endpoints, all in `services/api/supabase/functions/_shared/plaid.ts`:

| Endpoint                      | Line | Purpose                       | Billing effect                      |
| ----------------------------- | ---- | ----------------------------- | ----------------------------------- |
| `/link/token/create`          | 196  | Start the Link flow           | None — no Item exists yet           |
| `/item/public_token/exchange` | 209  | Create the Item               | **Starts the monthly subscription** |
| `/accounts/get`               | 226  | Discover accounts on the Item | None — Auth/Identity not requested  |
| `/transactions/sync`          | 290  | Incremental transaction pull  | None — covered by the subscription  |
| `/item/remove`                | 275  | Invalidate the access token   | **Stops the monthly subscription**  |

> **Correction to the brief:** the brief listed four endpoints. There are five — `/item/remove`
> exists at line 275. This matters: it is the _only_ lever that stops an accrued charge, so every
> disconnect and soft-delete path must reach it or we keep paying for connections the user has
> already abandoned. That is remediation item 4 in #4379.

**Consequence:** every billable event is `exchange` (start) and `remove` (stop). Nothing between
them costs anything at the margin. Sync cadence, webhook volume, and historical backfill depth are
**not** cost levers.

### 1.3 The rate itself

Plaid does not publish one. Their billing docs are explicit:

> "A price list is not available in the documentation. To view pricing, apply for Production
> access." — [plaid.com/docs/account/billing](https://plaid.com/docs/account/billing/)

So **any Plaid number in this document is an estimate, not a quote.** The `~$0.30/Item/month`
benchmark is widely cited for pay-as-you-go Transactions but is unverifiable without a Plaid
Dashboard application.

It is, however, **corroborated by the only comparable vendor that does publish**: Teller lists
Transactions at **"$0.30 Per enrollment, per month"**
([teller.io](https://teller.io/)). An enrollment is Teller's equivalent of an Item. Two independent
sources landing on $0.30/Item/month is reasonable grounds to model at that rate.

**This is the resolution of the original confusion:** `$0.30` is real and is roughly right — the
error was the denominator. It is per institution connection per month, not per API call. At our
sync cadence those differ by three to four orders of magnitude.

Plaid's plan tiers ([billing docs](https://plaid.com/docs/account/billing/)):

- **Trial** — free, hard-limited to **10 Production Items**. Notably, "Removing Items created on a
  Trial plan (using `/item/remove`) will **not** allow you to create more Items."
- **Pay-as-you-go** — no minimum or commitment.
- **Growth** — minimum spend, annual commitment, lower per-use costs, for usage up to $6,000/month.
- **Custom / Scale** — higher minimum, lowest per-use costs, required for EU/UK end users.

> **Which plan are we on?** Not determinable from this repository. If we are on Trial, total
> exposure is bounded at 10 Items and the free-tier risk in §3 is currently theoretical — but the
> Trial ceiling then also caps the product at 10 users' worth of connections, so it cannot be the
> production state. **Confirm the plan before sizing anything in §3.**

### 1.4 Arithmetic

Let `I` = Items per paying, connected user, and `r` = $0.30/Item/month.

```
Aggregation COGS per paying connected user  = I × r
COGS share of net revenue                   = (I × r) / net_ARPU
Aggregation gross margin                    = 1 − (I × r) / net_ARPU
```

Net ARPU from `docs/business/revenue/revenue-model-validation-sprint7.md:98-102`: blended gross ARPU
$4.16/mo (50% annual mix), less store fees → **$2.91 mobile (30% Year-1 cut)**, **$3.88 web
(Stripe ~5.9%)**.

---

## 2. Sensitivity — COGS as a Share of Net Revenue

At $0.30/Item/month:

| Items per paying user | COGS/user/mo | % of $2.91 (mobile) | Margin (mobile) | % of $3.88 (web) | Margin (web) |
| --------------------- | ------------ | ------------------- | --------------- | ---------------- | ------------ |
| 1                     | $0.30        | **10.3%**           | 89.7%           | **7.7%**         | 92.3%        |
| 2                     | $0.60        | **20.6%**           | 79.4%           | **15.5%**        | 84.5%        |
| 3                     | $0.90        | **30.9%**           | 69.1%           | **23.2%**        | 76.8%        |
| 5                     | $1.50        | **51.5%**           | 48.5%           | **38.7%**        | 61.3%        |

### 2.1 What threshold should we accept?

Aggregation is one COGS line among several (Supabase, PowerSync, storage, notifications — fixed
costs ~$171/mo per `revenue-model-validation-sprint7.md`). A consumer subscription app that wants
room for CAC, support, and the rest of infrastructure should not spend more than **~20% of net
revenue on any single variable vendor**, implying an **80% aggregation gross-margin floor**.

Solving `I × 0.30 ≤ 0.20 × net_ARPU`:

| Net ARPU       | Max spend on aggregation | Break-even Items | Practical cap                                     |
| -------------- | ------------------------ | ---------------- | ------------------------------------------------- |
| $2.91 (mobile) | $0.582                   | 1.94             | **1 Item** comfortably; 2 Items marginal at 20.6% |
| $3.88 (web)    | $0.776                   | 2.59             | **2 Items** comfortably                           |

**Findings:**

- **1 Item is unambiguously fine** on every platform (7.7%–10.3%).
- **2 Items is the practical ceiling.** It sits at 15.5% on web and 20.6% on mobile — just over the
  floor on the worst-case platform, which is acceptable given Year-2 store fees drop to 15%
  (`revenue-model-validation-sprint7.md:100-101`), lifting mobile net ARPU and pulling 2 Items back
  under 20%.
- **3 Items on mobile (30.9%) is where this becomes a real margin problem.** Not catastrophic, but
  it consumes a third of net revenue.
- **5 Items on mobile (51.5%) is untenable.** Over half of net revenue, before any other cost line.

**The decisive number is therefore not the rate — it is the Item count.** Nothing about provider
choice changes the shape of this table; a 33% cheaper provider only shifts the untenable point from
5 Items to ~7. **Capping Items is a strictly more effective lever than switching providers**, and
costs hours instead of weeks.

### 2.2 Sensitivity to the rate itself

Because the rate is unconfirmed, at 3 Items on mobile ($2.91):

| Rate/Item/mo | COGS at 3 Items | % of net ARPU            |
| ------------ | --------------- | ------------------------ |
| $0.20        | $0.60           | 20.6%                    |
| $0.30        | $0.90           | 30.9%                    |
| $0.50        | $1.50           | 51.5%                    |
| $1.00        | $3.00           | **103.1% — loss-making** |

We are safe up to roughly **$0.50/Item/month at 2 Items**. The model only breaks if the true rate is
several times the benchmark. Confirming the actual rate (§8) is therefore high-value and low-effort.

---

## 3. The Free-Tier Exposure — Modeled Separately

**Status: CONFIRMED.** Independently verified against the edge function, RLS policies, the
migrations, and all client code. Full evidence in **#4379**. Summary:

| Layer             | Expected control                                                                                              | Actual                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Documented policy | "Bank connections \| Premium \| Hard gate" — `docs/business/pricing/premium-strategy-conversion-funnel.md:72` | —                                                                                                                                       |
| Edge function     | Entitlement check                                                                                             | **None.** `services/api/supabase/functions/bank-connection/index.ts` has only `checkRateLimit(...)` at line 405                         |
| Rate limit        | A cap                                                                                                         | **Not a cap.** `_shared/rate-limit.ts:231` — 30 requests/60s. Throughput, not total                                                     |
| RLS               | Tier predicate                                                                                                | **None.** `migrations/20260327000002_bank_connections.sql:161-168` gates on household membership + `role IN ('owner','admin')` only     |
| Schema            | Entitlements table                                                                                            | **Does not exist** — no `entitlement`/`is_premium`/`subscription_tier` in any migration                                                 |
| Web client        | Paywall                                                                                                       | **None.** No `premium`/`entitle`/`paywall` reference in `apps/web/src/pages/BankConnectionsPage.tsx` or `apps/web/src/components/bank/` |
| Feature flag      | Partial rollout                                                                                               | `config/feature-flags/flags.json:51-58` — `enabled: true`, `rollout_percentage: 100`                                                    |

The gate exists **only in a pricing document**. Even a client-side paywall would be insufficient —
the edge function is directly reachable with any valid JWT.

### 3.1 Sized

Using the prior evaluation's scale point of 10,000 users with a 30% connect rate
(`bank-connection-partner-evaluation.md:62-74`), a 5% premium conversion
(`premium-strategy-conversion-funnel.md` funnel band of 3–5% without bank connections), and 2 Items
per connected user:

| Cohort         | Users  | Connected   | Items | Monthly COGS | Monthly net revenue      |
| -------------- | ------ | ----------- | ----- | ------------ | ------------------------ |
| Paying (5%)    | 500    | 150 (30%)   | 300   | $90          | 500 × $2.91 = **$1,455** |
| **Free (95%)** | 9,500  | 2,850 (30%) | 5,700 | **$1,710**   | **$0**                   |
| Total          | 10,000 | 3,000       | 6,000 | $1,800       | $1,455                   |

**Free-tier aggregation COGS alone ($1,710/mo) exceeds total net revenue ($1,455/mo).** Adding the
~$171/mo fixed infrastructure cost, the business runs at roughly **−$516/mo** at a scale point where
the paying cohort by itself is comfortably profitable (`$1,455 − $90 − $171 = +$1,194/mo`).

More conservatively, if only 10% of free users connect: 950 × 2 × $0.30 = **$570/mo**, still **39% of
net revenue** spent on users who pay nothing.

### 3.2 The unbounded case

The rate limit permits 30 Item creations per minute, per user. Sustained for 24 hours that is 43,200
Items — approximately **$12,960/month of recurring liability created by one account in one day**,
persisting until each Item is individually `/item/remove`d. Plaid may impose its own limits, but
**we impose none**, and this is not a scenario we should rely on a vendor to bound for us.

### 3.3 Comparison of exposures

| Exposure                        | Monthly size (10k-user model)           | Cost to fix                                         |
| ------------------------------- | --------------------------------------- | --------------------------------------------------- |
| **Missing gate / cap (#4379)**  | **$1,710 recurring, unbounded ceiling** | **Hours** — a `count` + reject in one edge function |
| Choosing a 33%-cheaper provider | $30/mo saved on the paying cohort       | Weeks of migration, plus coverage risk              |

The gate is roughly **57× the exposure** of provider choice in this model, at a small fraction of the
cost to fix. **Provider migration is the wrong response to this problem.**

---

## 4. What Has Changed Since the Prior Evaluation

`docs/business/revenue/bank-connection-partner-evaluation.md` (2025-07-29, #798) recommended Plaid as
primary with Akoya as a long-term hedge. That recommendation stands. What has changed:

| Then                                                                                                                    | Now                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plaid pricing described as "Per-connection/month" (line 48) — correct, but the per-call misreading persisted downstream | Corrected and sourced here (§1.1)                                                                                                                                                                       |
| Cost modeled as $1.50–$4.00 **per connected user** per month (lines 69–74)                                              | Modeled **per Item**, at $0.30. The prior figure implicitly bundled multiple Items and/or additional products; at 2 Items and Transactions-only we are at **$0.60**, well below the prior low estimate  |
| Integration was prospective, 8–12 weeks estimated (lines 80–89)                                                         | Plaid **and** MX are both built and shipped (`_shared/plaid.ts`, `_shared/mx.ts`; PRs #4372, #4378). Provider routing exists (`apps/web/src/lib/banking/aggregator-providers.ts`, `provider-router.ts`) |
| No live traffic                                                                                                         | `live_bank_data` at 100% rollout                                                                                                                                                                        |
| No premium-gate risk identified                                                                                         | **Gate confirmed absent (#4379)**                                                                                                                                                                       |

The prior cost estimate was **conservative by roughly 3–6×** for our actual Transactions-only,
low-Item usage. This is the second correction: we were overestimating aggregator cost, not
underestimating it.

---

## 5. Options Analysis

### Option A — Stay on Plaid; cap Items and enforce the gate

| Dimension        | Assessment                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Cost structure   | ~$0.30/Item/mo (benchmark). Capping at 2 Items bounds paying-user COGS at $0.60/mo (15.5%–20.6% of net ARPU) |
| Coverage/quality | Unchanged — 12,000+ institutions, best-in-class Link UX (`bank-connection-partner-evaluation.md:45,52`)      |
| Migration cost   | **None.** A row count + rejection in `bank-connection/index.ts`, plus a DB-level cap                         |
| Reversibility    | Fully reversible — a constant                                                                                |
| Residual risk    | Rate still unconfirmed; a user with 3+ real institutions hits the cap and may perceive it as a downgrade     |

**This is the highest exposure-reduction per unit of effort available.**

### Option B — Shift volume to MX

| Dimension        | Assessment                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost structure   | **Unknown — quote-based.** `mx.com/pricing` returns 404; the site routes to "Request Demo" ([mx.com](https://www.mx.com/products/data-access/)). The prior evaluation estimated MX at **$2.00–3.50 vs Plaid's $1.50–2.50** at 10k connected users (`bank-connection-partner-evaluation.md:72`) — i.e. **more** expensive — and noted "high minimums" (line 49) |
| Coverage/quality | 16,000+ institutions, best-in-class enrichment (`bank-connection-partner-evaluation.md:45,50`). Genuinely better than Plaid on both                                                                                                                                                                                                                            |
| Migration cost   | **Unusually low.** `_shared/mx.ts` implements widget URL, accounts, transactions, member endpoints. Routing with priority ordering already exists (`apps/web/src/lib/banking/aggregator-providers.ts:41-121`)                                                                                                                                                  |
| Reversibility    | High — routing is config, both paths coexist                                                                                                                                                                                                                                                                                                                   |

**Verdict: MX is a resilience asset, not a cost lever.** Having built it, we can fail over or split
volume on days when Plaid coverage degrades — real operational value. But every available estimate
points to MX costing _more_, and no public price disproves that. **Do not migrate to MX to save
money without a written quote in hand.**

### Option C — Teller

| Dimension      | Assessment                                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost structure | **Published**: Transactions **$0.30/enrollment/month**; Balance $0.10/call; Verify $1.50/account; Identity $1.75/call ([teller.io](https://teller.io/)). Transactions-only, we would pay **exactly the Plaid benchmark**                        |
| Free tier      | 100 live connections, but scoped: _"Teller is free for independent developers and teams **prototyping ideas**"_. Prototyping scope, not a commercial production tier. Also insufficient — 100 connections is ~3% of the 10k-user model's demand |
| Coverage       | **7,000+** institutions vs Plaid's 12,000+ — a material downgrade                                                                                                                                                                               |
| Migration cost | Low-ish — Teller advertises "Sidecar" zero-code Plaid migration ("a one-line config change")                                                                                                                                                    |
| Reversibility  | High                                                                                                                                                                                                                                            |

**Verdict: no cost advantage at list price, worse coverage, and the free tier is not a real option
for a paid commercial product.** Worth keeping on file as a third fallback given the cheap
migration path; not a cost strategy.

### Option D — SimpleFIN

| Dimension      | Assessment                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cost structure | **The end user pays, not us.** SimpleFIN Bridge is **$1.50/month or $15.00/year + tax**, for up to 25 institutions and 25 apps ([beta-bridge.simplefin.org](https://beta-bridge.simplefin.org/)). Our marginal COGS is **≈$0** |
| Coverage       | Via the Bridge, which aggregates on the user's behalf. Not independently verified here                                                                                                                                         |
| UX cost        | The user must sign up separately, connect banks in a second product, and pay a second bill. Against a $4.99/mo subscription, a mandatory $1.50/mo add-on is a **30% effective price increase** for a worse onboarding flow     |
| Migration cost | Moderate — a genuinely different protocol (read-only, "like RSS for financial information" — [simplefin.org](https://www.simplefin.org/))                                                                                      |
| Reversibility  | High — additive, not a replacement                                                                                                                                                                                             |

**Verdict: not viable as the default path.** But its privacy model — read-only, user-held, no
credential exposure to us — aligns unusually well with our core principles, and its marginal cost to
us is zero. **Viable as an opt-in bring-your-own-connection path for privacy-conscious and
high-Item users**, where it neatly solves the §2 margin problem: a user with 6 institutions costs us
nothing on SimpleFIN.

### Option E — Non-aggregator paths (OFX/QFX/CSV import, file sync, manual entry)

| Dimension      | Assessment                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cost structure | **~$0 marginal.** No vendor, no per-Item liability                                                                                                                                               |
| Coverage       | Universal — every institution offers statement export. Manual, and not real-time                                                                                                                 |
| Current state  | CSV import exists but is **not production-ready**: `services/api/supabase/functions/import-data/index.ts:3` — `TODO(alpha): SPECULATIVE — Not wired to any client. No tests.` No OFX/QFX support |
| Migration cost | Moderate — finish and wire CSV, add OFX/QFX parsing                                                                                                                                              |
| Reversibility  | Fully additive                                                                                                                                                                                   |

**Verdict: strategically undervalued.** This is the path that best fits `AGENTS.md` core principle 2
(edge-first — prefer client-side computation) and the privacy positioning that
`bank-connection-partner-evaluation.md:118-135` identifies as partially compromised by _any_
aggregator. It is also the only option that makes the free tier safe by construction: **free users
get import, paying users get aggregation.** That single split converts §3's unbounded liability into
zero.

### Option F — Tier aggregation itself

| Dimension        | Assessment                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Cost structure   | Turns a fixed liability into a revenue-linked one. Every incremental Item is either included in a priced tier or sold as overage |
| Coverage/quality | Unaffected                                                                                                                       |
| Migration cost   | Low technically (the cap from Option A plus a counter); moderate in pricing/comms work                                           |
| Reversibility    | Moderate — pricing changes are hard to walk back with existing subscribers                                                       |

Concretely, from §2's thresholds:

| Tier             | Items included           | Aggregation COGS | % of net ARPU (mobile)        |
| ---------------- | ------------------------ | ---------------- | ----------------------------- |
| Free             | 0 (import + manual only) | $0.00            | n/a                           |
| Premium $4.99    | **2**                    | $0.60            | 20.6%                         |
| Family/Household | **4** (shared)           | $1.20            | Spread across up to 6 members |
| Add-on           | +1 Item @ $0.99/mo       | $0.30            | **70% margin on the add-on**  |

Note the competitive context: `bank-connection-partner-evaluation.md` observes competitors charge
2–3× our price largely _for_ aggregation. We are underpricing the most expensive thing we ship.

---

## 6. Options Summary

| Option                  | Marginal COGS          | Coverage impact       | Migration cost       | Reversible | Reduces §3 exposure       |
| ----------------------- | ---------------------- | --------------------- | -------------------- | ---------- | ------------------------- |
| **A. Plaid + cap/gate** | $0.30/Item             | None                  | Hours                | Fully      | **Yes — directly**        |
| B. MX                   | Unknown, likely higher | Better                | Days (already built) | Fully      | No                        |
| C. Teller               | $0.30/enrollment       | **Worse** (7k vs 12k) | Low ("Sidecar")      | Fully      | No                        |
| D. SimpleFIN            | **~$0 (user pays)**    | Unverified            | Moderate             | Fully      | Partly                    |
| E. Import/manual        | **~$0**                | Manual, universal     | Moderate             | Fully      | **Yes — by construction** |
| F. Tier aggregation     | Revenue-linked         | None                  | Low + pricing work   | Moderate   | **Yes**                   |

---

## 7. Recommendation and Decision Rule

### 7.1 Recommendation

**Do not change providers.** The trigger premise was wrong on the unit, the corrected cost is
7.7%–20.6% of net revenue at defensible Item counts, and no evaluated alternative is cheaper at
published rates. Instead, in order:

1. **Adopt Option A + F** — cap Items server-side, enforce the documented premium gate, and price
   aggregation explicitly by tier. This addresses both the margin question (§2) and the exposure
   (§3) with the least effort and full reversibility.
2. **Adopt Option E as the free-tier substitute** — finish CSV import and add OFX/QFX. This makes
   the free tier zero-COGS by construction rather than by policy enforcement, which is a stronger
   guarantee, and it is the option most aligned with our edge-first, privacy-first principles.
3. **Keep MX warm as redundancy, not as a cost play** (Option B). The build is done and the routing
   exists; the value is availability, not price.
4. **Hold Options C and D on file.** SimpleFIN specifically as an opt-in high-Item / privacy path
   where our marginal cost is zero.

### 7.2 Decision rule for switching providers

Track a single metric monthly:

```
aggregation_cost_ratio = aggregation_COGS_per_paying_connected_user / blended_net_ARPU
```

| Condition                                                                                                                                                        | Action                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ratio ≤ 20%`                                                                                                                                                    | **No action.** Model is healthy                                                                    |
| `ratio > 20%` for 2 consecutive months                                                                                                                           | **Renegotiate.** Move to a Growth or Custom plan; revisit the tier Item allowance                  |
| `ratio > 30%` for 2 consecutive months **AND** a written alternative quote is **≥25% lower** at **equal-or-better institution coverage** at our committed volume | **Switch provider.** Route new connections to the alternative first; migrate existing on reconnect |
| `ratio > 30%` with **no** qualifying alternative quote                                                                                                           | **Do not switch.** Reduce the tier Item allowance or raise price instead                           |

Two hard side conditions, neither of which is a pricing question:

- **Free-tier attributable aggregation COGS must be $0.** Any nonzero value is a **defect**, not a
  cost-optimization problem. Resolve via #4379.
- **A coverage regression is disqualifying.** Institution coverage below Plaid's ~12,000 is not
  offset by any price saving; churn from a bank we can no longer connect costs more than the
  delta. This is what disqualifies Teller at 7,000 today.

### 7.3 Instrumentation required to run the rule

The rule is currently unmeasurable. To operate it we need:

- Monthly Plaid/MX invoice total, tagged by product.
- Count of active (non-revoked) `bank_connections` rows, split by paying vs free — derivable from
  `bank_connections` once an entitlement source of truth exists.
- Blended net ARPU from the existing revenue model.

Until an entitlement table exists, the free-vs-paying split cannot be computed at all. **#4379 is a
prerequisite for this decision rule, not merely a remediation.**

---

## 8. Open Questions — Require a Sales Conversation

No vendor was contacted and no account was created for this analysis. These numbers are
unobtainable without one, and the exact questions to ask are:

**Plaid** (via Dashboard Production application or sales):

1. What plan is our production account on today — Trial, Pay-as-you-go, Growth, or Custom?
2. What is the exact Transactions subscription fee per Item per month on that plan?
3. Is `/accounts/get` billable when only `transactions` is requested, or is it included?
4. Is there a prorated or minimum charge for an Item created and `/item/remove`d within the same
   billing period? (This determines the cost of an abuse burst.)
5. At what monthly Item volume does a Growth plan beat Pay-as-you-go, and what is the minimum spend?
6. Does the subscription bill for an Item in `ITEM_LOGIN_REQUIRED` / errored state that is no longer
   syncing?

**MX** (via Request Demo):

7. What is the per-member (per-connection) monthly rate for transaction aggregation only?
8. What is the annual minimum commitment, and is there a tier below it?
9. Is billing per member (institution) or per user, and what happens when a user links five
   institutions?

**Teller** (documentation is sufficient; only if seriously considered):

10. Does the free developer tier permit revenue-generating commercial use, or is it prototyping-only
    as the site copy states?
11. Which of our top-20 institutions by user count are in the 7,000 supported, and which are not?

Question 4 is the highest-value one: it determines whether §3.2's abuse ceiling is $12,960/month or
effectively zero.

---

## 9. Immediate Actions — Ordered by Cost-to-Fix vs Exposure Reduced

| #   | Action                                                                                                                    | Effort           | Exposure reduced                                                                              | Owner                                  | Tracking  |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 1   | **Cap `bank_connections` per household** in `bank-connection/index.ts` — count non-revoked rows, reject beyond a constant | Hours            | Converts unbounded → bounded. Largest single reduction available                              | @backend-engineer                      | **#4379** |
| 2   | **Confirm the Plaid plan and actual rate** (§8 Q1–Q2)                                                                     | One conversation | Removes the largest modeling uncertainty in this document                                     | Business Analysis                      | **#4379** |
| 3   | **Verify `/item/remove` is reached on every disconnect path**                                                             | Hours            | Stops paying for abandoned connections                                                        | @backend-engineer                      | **#4379** |
| 4   | **Add a DB-level cap** (trigger) so the limit survives any caller bypassing the edge function                             | ~1 day           | Defence in depth; RLS currently has no cap at all                                             | @database-engineer                     | **#4379** |
| 5   | **Alert on `bank_connections` row-count growth rate**                                                                     | ~1 day           | Detection — ensures this cannot silently recur                                                | @sre-engineer                          | **#4379** |
| 6   | **Introduce an entitlement source of truth** and enforce the documented premium gate                                      | ~1 sprint        | Closes the gap in `premium-strategy-conversion-funnel.md:72`; unblocks the §7.2 decision rule | @database-engineer + @backend-engineer | New issue |
| 7   | **Finish CSV import; add OFX/QFX** (`import-data/index.ts:3` is `SPECULATIVE`)                                            | ~1 sprint        | Makes the free tier zero-COGS **by construction** and softens the cap for high-Item users     | @backend-engineer + @web-engineer      | New issue |
| 8   | **Ratify tier Item allowances** (§5 Option F table)                                                                       | Pricing decision | Converts a fixed liability into a revenue-linked one                                          | Business Analysis + human sign-off     | New issue |

Actions 1–3 are same-day and remove the majority of the exposure. Everything below action 5 is
strategy, not incident response.

---

## 10. Assumptions and Limitations

- **The $0.30/Item/month Plaid rate is a benchmark, not a quote.** Corroborated by Teller's
  published rate but unverified for our account. §2.2 shows the model survives up to ~$0.50/Item at
  2 Items.
- **Net ARPU of $2.91/$3.88** is carried forward from
  `revenue-model-validation-sprint7.md:98-102` and inherits its 50%-annual-mix assumption.
- **Items per user (1/2/3/5)** are modeled ranges, not observed data. We have no production
  telemetry on institutions-per-user; the §7.3 instrumentation would supply it.
- **The 10,000-user / 30%-connect scale point** is carried from
  `bank-connection-partner-evaluation.md:62-74` for comparability, not forecast.
- **Revenue projections are directional estimates, not commitments.**
- No vendor was contacted, no account was created, and no live provider API or production webhook
  endpoint was probed.
- Coverage figures for Plaid, MX, and Finicity are carried from the prior evaluation and were not
  re-verified; Teller's 7,000+ and SimpleFIN's terms were read directly from their sites on
  2026-08-23.

---

## References

**Our code:**

- `services/api/supabase/functions/_shared/plaid.ts` — lines 175, 196, 209, 226, 275, 290
- `services/api/supabase/functions/_shared/mx.ts` — lines 275, 311, 343, 366
- `services/api/supabase/functions/bank-connection/index.ts` — line 405
- `services/api/supabase/functions/_shared/rate-limit.ts` — line 231
- `services/api/supabase/functions/import-data/index.ts` — line 3
- `services/api/supabase/migrations/20260327000002_bank_connections.sql` — lines 148-186
- `config/feature-flags/flags.json` — lines 51-58
- `apps/web/src/lib/banking/aggregator-providers.ts` — lines 41-121

**Our documents:**

- `docs/business/revenue/bank-connection-partner-evaluation.md`
- `docs/business/revenue/revenue-model-validation-sprint7.md`
- `docs/business/pricing/premium-strategy-conversion-funnel.md`
- `docs/business/pricing/pricing-validation-sprint7.md`

**Vendor sources** (retrieved 2026-08-23):

- Plaid pricing models — https://support.plaid.com/hc/en-us/articles/16194632655895
- Plaid billing and plans — https://plaid.com/docs/account/billing/
- Teller published pricing — https://teller.io/
- SimpleFIN Bridge pricing — https://beta-bridge.simplefin.org/
- SimpleFIN protocol — https://www.simplefin.org/
- MX data access (no public pricing; `mx.com/pricing` returns 404) — https://www.mx.com/products/data-access/
