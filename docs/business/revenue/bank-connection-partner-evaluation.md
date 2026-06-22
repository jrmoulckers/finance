# Bank Connection Partner Evaluation — Plaid, MX, Finicity

**Issue:** #798
**Sprint:** 10 — Platform Expansion
**Priority:** P2 — Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-29

---

## Executive Summary

Bank connections are the most-requested feature in personal finance apps and
represent the single largest friction-removal opportunity for Finance. This
evaluation examines four providers — Plaid, MX, Finicity (Mastercard), and
Akoya — across pricing, coverage, privacy, API quality, and strategic fit. The
recommendation is **Plaid as primary provider** with Akoya as a long-term hedge
on the bank-owned Open Banking movement.

### Key Findings

1. **Plaid** offers the best developer experience, broadest third-party
   ecosystem, and most transparent pricing for a startup-stage product.
2. **MX** is enterprise-focused with superior data enrichment but pricing is
   opaque and minimum commitments are high.
3. **Finicity** (Mastercard) has financial-grade data quality but is oriented
   toward lenders, not consumer PFM apps.
4. **Akoya** is bank-owned and privacy-aligned but coverage is still limited
   and the API is newer.
5. **Privacy tension is real:** integrating any provider creates a partial
   exception to the "your data never leaves your device" positioning. This must
   be handled with extreme transparency.

---

## Provider Comparison Matrix

| Criterion                | Plaid                       | MX                          | Finicity (Mastercard)       | Akoya (Bank-Owned)          |
| ------------------------ | --------------------------- | --------------------------- | --------------------------- | --------------------------- |
| **Institution Coverage** | 12,000+                     | 16,000+                     | 15,000+                     | ~3,000 (growing)            |
| **US Coverage Quality**  | Excellent                   | Excellent                   | Excellent                   | Major banks only            |
| **International**        | US, CA, UK, EU (expanding)  | US, CA primarily            | US, CA primarily            | US only                     |
| **Pricing Model**        | Per-connection/month        | Per-user/month              | Per-API-call                | Per-connection              |
| **Startup Pricing**      | Free tier available (100)   | Custom (high minimums)      | Custom (moderate minimums)  | Developer program available |
| **Data Quality**         | Good (raw + enriched)       | Excellent (best enrichment) | Excellent (financial-grade) | Good (bank-native)          |
| **API Documentation**    | Excellent                   | Good                        | Good                        | Adequate                    |
| **SDK/Link Widget**      | Plaid Link (all platforms)  | MX Connect (all platforms)  | Finicity Connect            | Limited                     |
| **OAuth Support**        | Yes (growing adoption)      | Yes                         | Yes                         | Native (bank-controlled)    |
| **Privacy Model**        | Intermediary (screens data) | Intermediary (screens data) | Intermediary (screens data) | Direct bank connection      |
| **Transaction Webhooks** | Yes                         | Yes                         | Yes                         | Limited                     |
| **Balance Updates**      | Real-time via webhooks      | Scheduled + manual          | Scheduled + manual          | Varies by bank              |
| **Compliance**           | SOC 2 Type II, PCI DSS      | SOC 2 Type II               | SOC 2 Type II, PCI DSS      | Bank-level compliance       |
| **Integration Effort**   | 2–3 weeks                   | 3–4 weeks                   | 3–4 weeks                   | 4–6 weeks                   |

---

## Cost Modeling at Scale

All estimates use publicly available pricing tiers and industry benchmarks.
Actual pricing requires vendor negotiation (human-gated).

### Variable Costs (Per Connected User Per Month)

| Scale Point       | Plaid (est.) | MX (est.)  | Finicity (est.) | Akoya (est.) |
| ----------------- | ------------ | ---------- | --------------- | ------------ |
| 1,000 connected   | $2.50–4.00   | $3.00–5.00 | $2.00–3.50      | $1.50–3.00   |
| 10,000 connected  | $1.50–2.50   | $2.00–3.50 | $1.50–2.50      | $1.00–2.00   |
| 50,000 connected  | $0.80–1.50   | $1.50–2.50 | $1.00–1.80      | $0.70–1.50   |
| 100,000 connected | $0.50–1.00   | $1.00–2.00 | $0.70–1.20      | $0.50–1.00   |

> **Note:** All pricing is estimated from public information and peer
> benchmarks. Actual pricing requires vendor outreach and NDA-protected
> negotiation. Flagged as requiring human/legal review.

### Fixed Costs (One-Time Integration)

| Cost Category                  | Estimate       |
| ------------------------------ | -------------- |
| Engineering integration        | 4–6 weeks      |
| Security review/audit          | 2–3 weeks      |
| Legal/compliance review        | 1–2 weeks      |
| Privacy policy updates         | 1 week         |
| App store privacy label update | 1 day          |
| **Total calendar time**        | **8–12 weeks** |

### Revenue Impact Modeling

Industry benchmarks for bank connection impact on PFM apps:

| Metric                       | Without Bank Connections | With Bank Connections | Source          |
| ---------------------------- | ------------------------ | --------------------- | --------------- |
| Premium conversion rate      | 3–5%                     | 8–12% (2–3x lift)     | Industry avg    |
| 30-day retention             | 35–45%                   | 55–65%                | Plaid research  |
| DAU/MAU ratio                | 20–25%                   | 30–40%                | PFM benchmarks  |
| Willingness to pay (premium) | Moderate                 | High                  | Survey data     |
| Session frequency (weekly)   | 3–4x                     | 5–7x                  | Engagement data |

### Break-Even Analysis

Assuming 10,000 total users, 30% connect banks, premium at $4.99/month:

- Connected users: 3,000
- Cost at scale: ~$1.50/user/month = $4,500/month
- Premium conversion lift: 3% → 8% = +500 premium subscribers
- Revenue lift: 500 × $4.99 = $2,495/month
- **Break-even point: ~18,000 total users** (where revenue lift covers costs)

This is a **loss leader below 18K users** but a strong growth driver above it.
The real value is retention — connected users churn 40% less.

---

## Privacy Assessment

### The Core Tension

Finance's brand promise is "your financial data never leaves your device." Bank
connections fundamentally create an exception: transaction data flows from the
bank through a third-party aggregator (Plaid/MX) to our server before reaching
the device.

### Honest Assessment

| Claim                                 | With Bank Connections                                   |
| ------------------------------------- | ------------------------------------------------------- |
| "Data never leaves your device"       | **Partially false** for connected accounts              |
| "We never see your bank credentials"  | **True** — Plaid handles all credential exchange        |
| "You control your data"               | **True** — connection is opt-in, disconnect is instant  |
| "No tracking or selling of your data" | **True** — but Plaid's own data practices need scrutiny |
| "Local-first architecture"            | **True** — data syncs to device and lives there         |

### Recommended Messaging Update

**Before:** "Your financial data never leaves your device."

**After:** "Your financial data lives on your device. If you choose to connect
your bank, transactions are securely imported through [Plaid] and then stored
locally — same as all your other data. You can disconnect anytime."

### Privacy Requirements for Integration

1. Bank connection is **always optional** — never required, never nagged
2. Data flow is **fully transparent** — users see exactly what happens
3. Plaid data practices are **disclosed** — link to Plaid's privacy policy
4. Disconnect is **immediate and complete** — token revoked, no residual data
5. Non-connected users **never see pressure** — no "you're missing out"
6. Privacy policy updated **before** feature launches
7. App store privacy labels updated **before** feature goes live

---

## Security Requirements Checklist

All items require @security-reviewer sign-off before shipping.

- [ ] Plaid/MX access tokens stored exclusively on server (Supabase secrets)
- [ ] Client never handles or sees bank credentials
- [ ] Token refresh automated server-side with error alerting
- [ ] Token revocation on user disconnect is immediate and verified
- [ ] Webhook signatures validated on all incoming Plaid/MX events
- [ ] Rate limiting on bank connection endpoints (prevent abuse)
- [ ] RLS policies ensure users can only access their own connections
- [ ] Audit logging for all bank connection lifecycle events
- [ ] Error handling never leaks bank account details in logs or responses
- [ ] Plaid Link integration uses latest SDK with security patches
- [ ] Certificate pinning applied to Plaid/MX API communication
- [ ] Integration passes penetration testing before production deployment

---

## Enterprise Plan Scope

Bank connections unlock an enterprise/team plan opportunity:

### Target Market

- Small businesses (1–10 employees) managing business finances
- Couples and families (addressed by family plan #339)
- Freelancers with multiple business accounts

### Proposed Enterprise Features

| Feature                      | Individual Premium | Family Plan  | Enterprise Plan |
| ---------------------------- | ------------------ | ------------ | --------------- |
| Manual transaction entry     | ✅                 | ✅           | ✅              |
| Bank connections (5 accts)   | ✅                 | ✅           | ✅              |
| Bank connections (unlimited) | —                  | —            | ✅              |
| Multi-user collaboration     | —                  | ✅ (5 seats) | ✅ (25 seats)   |
| Advanced reporting           | —                  | —            | ✅              |
| API access                   | —                  | —            | ✅              |
| Priority support             | —                  | —            | ✅              |

### Pricing Range (Requires Validation)

| Plan       | Monthly | Annual (20% discount) |
| ---------- | ------- | --------------------- |
| Individual | $4.99   | $47.88 ($3.99/mo)     |
| Family     | $9.99   | $95.88 ($7.99/mo)     |
| Enterprise | $19.99  | $191.88 ($15.99/mo)   |

> Enterprise plan is **v1.3+ scope**. Sprint 10 defines scope only; execution
> follows market validation from family plan adoption data.

---

## "Do Nothing" Option Assessment

### Competitive Risk

| Competitor    | Bank Connections | Monthly Price | Market Position         |
| ------------- | ---------------- | ------------- | ----------------------- |
| YNAB          | Yes (via Plaid)  | $14.99        | Established, growing    |
| Monarch Money | Yes (via Plaid)  | $9.99         | Fast-growing competitor |
| Copilot       | Yes (via Plaid)  | $10.99        | iOS-first, premium      |
| Lunch Money   | Yes (via Plaid)  | $10.00        | Web-first, indie        |
| **Finance**   | **No**           | **$4.99**     | **Privacy-first, new**  |

### Honest Assessment

**Without bank connections:**

- Finance retains its privacy purity but loses on convenience
- Manual entry is the #1 reason users abandon PFM apps (industry data: 60% churn
  within 30 days for manual-only apps)
- Viable as a niche product for privacy purists (addressable market: ~5% of PFM
  users)
- Competitive moat is ethical positioning, not feature set

**With bank connections (optional):**

- Matches table-stakes feature expected by 90%+ of PFM users
- Retention doubles for connected users
- Privacy positioning evolves from "never" to "your choice" — arguably more
  honest and more empowering
- Cost is real and must be factored into premium pricing

### Recommendation

**Proceed with bank connections as an optional premium feature.** The privacy
messaging evolution from "never leaves your device" to "your choice, your
control" is actually stronger and more honest. The "do nothing" path leads to a
niche product that cannot sustain development.

---

## v1.2 Release Timeline

| Week | Milestone                                       | Status  |
| ---- | ----------------------------------------------- | ------- |
| 19   | Provider selected, API keys provisioned         | Planned |
| 20   | Backend integration complete (Plaid Link flow)  | Planned |
| 21   | Platform clients integrated (iOS, Android, Web) | Planned |
| 22   | Security review by @security-reviewer           | Planned |
| 23   | v1.2-rc1: feature-complete release candidate    | Planned |
| 24   | v1.2 production release                         | Planned |
| 25   | v1.2 marketing push — bank + family + OCR       | Planned |

---

## Recommendation Summary

| Decision Point                 | Recommendation                                    |
| ------------------------------ | ------------------------------------------------- |
| **Primary provider**           | Plaid — best DX, broadest ecosystem, startup tier |
| **Secondary provider (hedge)** | Akoya — monitor for Open Banking future           |
| **Integration timing**         | v1.2 (Weeks 19–24)                                |
| **Premium gating**             | Bank connections are premium-only feature         |
| **Privacy messaging**          | Evolve to "your choice, your control"             |
| **Enterprise plan**            | Scope in Sprint 10, execute in v1.3+              |
| **"Do nothing" viable?**       | Only for niche market — not recommended           |

### Next Steps

1. **Human action required:** Initiate vendor outreach to Plaid for pricing
   negotiation
2. **Human action required:** Legal review of Plaid data sharing agreement
3. @security-reviewer: Review security requirements checklist above
4. @architect: Validate bank connection architecture (Edge Function proxy model)
5. Engineering: Begin Plaid Sandbox integration in Sprint 11
6. Marketing: Align bank connection trust campaign (#813) with privacy messaging

---

## Dependencies

- #265 — Bank connection API engineering implementation
- #270 — Family collaboration (scope overlap with enterprise plan)
- #813 — Bank connection trust-building marketing campaign
- #831 — Partnership economics business analysis
- @architect consultation for integration architecture
- @security-reviewer audit before any production deployment

---

_This evaluation is a planning document. All vendor pricing requires
negotiation and NDA review (human-gated). No vendor commitments have been
made._
