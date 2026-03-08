# ADR-0009: Legal, Licensing & Monetization Analysis for Public Release

**Status:** Accepted (BSL 1.1 recommendation implemented)
**Date:** 2025-07-27
**Updated:** 2026-03-08 (license change to BSL 1.1 implemented)
**Author:** AI agent (Architect), requires human review and legal counsel
**Reviewers:** Jeffrey Moulckers, external legal counsel (recommended)

> **⚠️ DISCLAIMER:** This document is an architectural analysis, NOT legal advice.
> The findings and recommendations herein are based on publicly available information
> about open-source licensing, intellectual property law, and regulatory frameworks.
> **You must consult a qualified attorney** before making licensing changes, filing
> trademarks, creating legal entities, or publishing the repository. This is especially
> critical for a financial application handling sensitive user data.

> **✅ UPDATE (2026-03-08):** The primary recommendation from §2.6 — BSL 1.1 with
> a 4-year change date to Apache 2.0 — has been implemented. The `LICENSE` file,
> `package.json`, SPDX headers, `README.md`, and all documentation references have
> been updated to reflect BUSL-1.1. The remaining findings in this ADR (CLA,
> trademark, entity formation, export controls, ToS/Privacy Policy) are still
> outstanding and should be addressed per the pre-publication checklist in §9.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [MIT License & Monetization](#2-mit-license--monetization)
3. [Contributor License Agreement](#3-contributor-license-agreement-cla)
4. [Trademark Strategy](#4-trademark-strategy)
5. [Patent Considerations](#5-patent-considerations)
6. [Export Controls & Cryptography](#6-export-controls--cryptography)
7. [Terms of Service & Privacy Policy](#7-terms-of-service--privacy-policy)
8. [Individual vs. Entity Ownership](#8-individual-vs-entity-ownership)
9. [Pre-Publication Checklist](#9-pre-publication-checklist)

---

## 1. Executive Summary

This analysis evaluates the legal readiness of the Finance monorepo for transition from a private to a public GitHub repository. The project was originally under the MIT License and has since adopted the **Business Source License 1.1 (BUSL-1.1)** per this ADR's primary recommendation (§2.6), with a monetization strategy.

### Critical Findings (Must Address Before Public)

| # | Finding | Risk | Priority |
|---|---------|------|----------|
| 1 | ~~MIT License allows competitors to fork, rebrand, and sell an identical product~~ | ~~**Critical**~~ | ✅ Resolved — BSL 1.1 adopted |
| 2 | No Contributor License Agreement exists | **Critical** | Must address before public |
| 3 | No legal entity separates personal liability from the application | **Critical** | Must address before public |
| 4 | Cryptographic code requires BIS notification before public release | **High** | Must address before public |
| 5 | No Terms of Service or Privacy Policy for the application | **High** | Must address before public |

### High/Medium Findings (Address Soon After Public)

| # | Finding | Risk | Priority |
|---|---------|------|----------|
| 6 | "Finance" is likely unregistrable as a trademark | **Medium** | Should do soon |
| 7 | MIT lacks an explicit patent grant (Apache 2.0 has one) | **Medium** | Should do soon |
| 8 | No GDPR/CCPA compliance documentation for the application | **High** | Should do soon |
| 9 | No contributor DCO or sign-off mechanism in git hooks | **Low** | Nice to have |

---

## 2. MIT License & Monetization

### 2.1 Current State

**Finding:** The repository was originally licensed under MIT. Following this ADR's recommendation, the license has been changed to **Business Source License 1.1 (BUSL-1.1)** (see `LICENSE`), copyright 2026 Jeffrey Moulckers. All source files now contain `// SPDX-License-Identifier: BUSL-1.1` headers. The `package.json` declares `"license": "BUSL-1.1"`.

**Risk Level:** ✅ **Mitigated** — The BSL 1.1 adoption addresses the competitive risk identified below while preserving source transparency.

### 2.2 Can You Monetize an MIT-Licensed App?

**Yes, absolutely.** The MIT License does not restrict commercialization by the copyright holder. Many successful businesses are built on MIT-licensed code (e.g., Next.js/Vercel, Babel, Rails). The copyright holder retains the right to:

- Sell the app through app stores
- Charge subscription fees for backend services (sync, cloud features)
- Offer premium features not in the open-source repo
- Dual-license the code under commercial terms

However, MIT also grants **everyone else** the same rights.

### 2.3 What Competitors Can Legally Do With Your Code

Under MIT, **any person or company** can:

| Action | Permitted? | Notes |
|--------|-----------|-------|
| Fork the entire codebase | ✅ Yes | Including all business logic, sync engine, crypto |
| Remove your branding and rebrand | ✅ Yes | Only must keep the copyright notice |
| Sell the forked version commercially | ✅ Yes | As a competing product |
| Offer it as a hosted SaaS | ✅ Yes | Without contributing back |
| Modify and distribute without source | ✅ Yes | No copyleft obligation |
| Patent derived implementations | ✅ Yes | MIT has no patent retaliation clause |
| Sublicense under different terms | ✅ Yes | Can even make derivatives proprietary |

This is not hypothetical. Amazon, Google, and other cloud providers have built commercial offerings from MIT/BSD-licensed projects, which led companies like Elastic, MongoDB, and HashiCorp to change their licenses.

### 2.4 License Comparison for Monetized Products

| License | Competitors can fork & sell? | Competitors must share changes? | SaaS protection? | Compatible with App Store? | Complexity |
|---------|---------------------------|-------------------------------|-------------------|---------------------------|------------|
| **MIT** (current) | ✅ Yes | ❌ No | ❌ None | ✅ Yes | Very low |
| **Apache 2.0** | ✅ Yes | ❌ No | ❌ None | ✅ Yes | Low (adds patent grant) |
| **AGPL-3.0** | ✅ Yes, but must share source | ✅ Yes, including SaaS | ✅ Strong | ⚠️ Controversial | Medium |
| **BSL 1.1** (MariaDB) | ❌ No (until change date) | N/A (not OSS until change date) | ✅ Strong | ✅ Yes | Medium |
| **SSPL** (MongoDB) | ❌ No (for SaaS) | ✅ Entire service stack | ✅ Very strong | ⚠️ Not OSI-approved | Medium |
| **Elastic License 2.0** | ⚠️ Limited | ❌ No | ✅ Strong | ✅ Yes | Medium |
| **Dual license** (MIT + Commercial) | Depends on track | Depends on track | ✅ Configurable | ✅ Yes | High (legal) |

### 2.5 Detailed License Analysis

#### AGPL-3.0 (Copyleft)
- **How it protects you:** Anyone who modifies the code and offers it as a network service must release their modifications under AGPL. This means a competitor can't take your sync engine, improve it, and offer a competing SaaS without open-sourcing their changes.
- **Downside:** Strong copyleft scares away enterprise contributors and some integrations. Apple's App Store historically has tension with GPL-family licenses (though this is debated and several AGPL apps are on the App Store). Some companies have blanket policies against AGPL dependencies.
- **Fit for Finance:** Moderate. Protects the sync engine from SaaS competitors but may limit adoption.

#### BSL 1.1 (Business Source License)
- **How it protects you:** Source code is publicly visible but cannot be used in production by others until a "change date" (typically 3–4 years). After that, it converts to an open-source license (usually Apache 2.0 or MIT). Used by MariaDB, Sentry, CockroachDB, HashiCorp (Terraform).
- **Downside:** Not OSI-approved "open source." Community contributors may be less willing to contribute to a project they can't freely use. However, it's become very common for venture-backed infrastructure companies.
- **Fit for Finance:** Strong. Allows source transparency (aligns with "open development" principle) while preventing commercial competition for a window.

#### Elastic License 2.0 / SSPL
- **How it protects you:** Prevents offering the software as a managed service. Elastic License 2.0 is simpler and more modern; SSPL (MongoDB) is broader but more controversial.
- **Downside:** Neither is OSI-approved. SSPL is considered overly broad by many. Elastic License 2.0 is cleaner but still limits some use cases.
- **Fit for Finance:** Moderate. If the primary competitive threat is cloud providers offering a hosted version, these are strong. But Finance's moat is more likely the native apps and UX than the backend code.

#### Dual Licensing (Recommended Approach)
- **How it protects you:** The open-source codebase uses a copyleft license (e.g., AGPL-3.0) that requires competitors to share their changes. Companies that want to use the code without the copyleft obligation purchase a commercial license. This is the model used by Qt, MySQL (historically), GitLab (partially), and many others.
- **Downside:** Requires all contributors to sign a CLA granting you the right to dual-license (see §3). More complex legal setup.
- **Fit for Finance:** Strong. Supports the "open development" principle while protecting commercial interests. The CLA you need anyway (see §3) naturally enables this.

### 2.6 Recommendation

**Primary Recommendation: BSL 1.1 with a 3-year change date to Apache 2.0**

This is the strongest recommendation for a solo developer monetizing a financial app:

- ✅ Source code is publicly visible (aligns with "open development" principle)
- ✅ Community can inspect, learn from, and suggest changes
- ✅ No competitor can take the code and launch a competing product
- ✅ After 3 years, each version becomes fully open source (Apache 2.0)
- ✅ App Store compatible
- ✅ Simple to implement — change `LICENSE` file, no CLA complexity for dual-licensing
- ⚠️ Not OSI-approved "open source" — be transparent about this in your README

**Alternative Recommendation: AGPL-3.0 + CLA (for dual-licensing)**

If true "open source" status matters for community building:

- Use AGPL-3.0 as the public license
- Require a CLA from all contributors (see §3)
- Offer a commercial license for entities that can't comply with AGPL
- This is a well-understood model with decades of precedent

**What to do with the current MIT code:**

Since the repository is currently private and all code has been written by you (Jeffrey Moulckers) or AI tools (which don't hold copyright), you have full authority to change the license before going public. Once the repository is public and others contribute under MIT, changing the license becomes much harder (you can only re-license contributions you own). **This is why license selection must happen before publication.**

### 2.7 License Change Checklist

If changing from MIT:

1. [x] Choose the new license (BSL 1.1 or AGPL-3.0) — **BSL 1.1 selected**
2. [x] Replace `LICENSE` file content — **Done (BUSL-1.1 with 2030-03-08 change date)**
3. [x] Update `package.json` `"license"` field — **Done (`"BUSL-1.1"`)**
4. [x] Update all `// SPDX-License-Identifier: MIT` headers in source files — **Done (`BUSL-1.1`)**
5. [x] Update `README.md` license section — **Done**
6. [ ] Update `build.gradle.kts` SPDX identifiers (in `packages/core/`, `packages/sync/`, `packages/models/`)
7. [ ] Add a `LICENSING.md` file explaining the license choice and any commercial licensing options
8. [x] If BSL: define the "Change Date" (e.g., 3 years from each release) and "Change License" (Apache 2.0) — **Change Date: 2030-03-08, Change License: Apache 2.0**
9. [ ] If AGPL: prepare a CLA (see §3) before accepting any external contributions
10. [ ] Consult an attorney to review the license text and any modifications

---

## 3. Contributor License Agreement (CLA)

### 3.1 Current State

**Finding:** No CLA or DCO mechanism exists in the repository. The `CONTRIBUTING.md` does not mention any IP assignment or license grant. There are no git hooks or GitHub Actions enforcing contributor agreements.

**Risk Level:** 🔴 **Critical** — Without a CLA, external contributors retain copyright over their contributions, making it legally impossible to change the license later or to offer commercial licensing.

### 3.2 Why a CLA Is Critical

For a **monetized** open-source project, a CLA serves several vital functions:

1. **License flexibility:** Without a CLA, every contributor co-owns copyright in their contributions. Changing the license (e.g., from MIT to BSL) requires **unanimous consent** from every contributor. For a project with hundreds of contributors, this is practically impossible.

2. **Commercial licensing:** If you want to offer a commercial license (e.g., for enterprises that can't use AGPL), you need the legal right to license all code commercially. Without a CLA, you can only license your own contributions commercially.

3. **Patent protection:** A CLA can include a patent grant from contributors, protecting you and downstream users from patent claims.

4. **Legal clarity:** A CLA removes ambiguity about the contribution's IP status — the contributor confirms they have the right to contribute the code and that it doesn't infringe third-party IP.

### 3.3 CLA vs. DCO

| Aspect | CLA (Contributor License Agreement) | DCO (Developer Certificate of Origin) |
|--------|--------------------------------------|---------------------------------------|
| **What it does** | Grants specific license rights to the project | Certifies the contributor has the right to submit the code |
| **Legal weight** | Stronger — explicit contractual agreement | Weaker — attestation only, not a license grant |
| **Allows relicensing?** | ✅ Yes (if CLA includes this right) | ❌ No — only certifies the contribution matches the project license |
| **Patent grant?** | ✅ Can include | ❌ No |
| **Contributor friction** | Higher — must sign a document | Lower — just add `Signed-off-by:` to commits |
| **Used by** | Apache, Google, Microsoft, Facebook | Linux kernel, GitLab |
| **Right for Finance?** | ✅ **Yes** — needed for monetization | ❌ Insufficient alone |

**Recommendation:** Use a **CLA** (not just a DCO). A DCO only certifies origin — it doesn't grant you the rights needed for dual licensing or license changes. You can additionally require DCO sign-offs for lightweight provenance tracking, but the CLA is the critical document.

### 3.4 CLA Approach: IP License Grant (NOT Assignment)

There are two CLA models:

1. **Copyright Assignment:** Contributors transfer copyright ownership to you. Used by FSF (GNU projects), Canonical (Ubuntu). Highly controversial — many contributors refuse to sign.

2. **License Grant (Recommended):** Contributors retain their copyright but grant you a broad, irrevocable license to use, modify, sublicense, and distribute their contributions under any license. Used by Apache, Google, Microsoft.

**Recommendation:** Use the **license grant** model. It's less controversial, more contributor-friendly, and still gives you the rights needed for commercial licensing.

### 3.5 Recommended CLA Template

Use the **Apache Individual Contributor License Agreement** as the basis, with modifications for Finance. The Apache ICLA is:
- The most widely used CLA in open source
- Well-understood by corporate legal departments
- Includes a patent grant
- Battle-tested in court

Key clauses the CLA must include:

```
1. DEFINITIONS
   "Contribution" — any original work of authorship submitted to the Project.
   "You" — the individual or legal entity making the Contribution.

2. GRANT OF COPYRIGHT LICENSE
   You grant to [Project Owner Entity] a perpetual, worldwide, non-exclusive,
   no-charge, royalty-free, irrevocable copyright license to reproduce, prepare
   derivative works of, publicly display, publicly perform, sublicense, and
   distribute Your Contributions and derivative works thereof, under any
   license terms, including proprietary licenses.

3. GRANT OF PATENT LICENSE
   You grant to [Project Owner Entity] a perpetual, worldwide, non-exclusive,
   no-charge, royalty-free, irrevocable patent license to make, use, sell,
   import, and otherwise transfer Your Contributions, where such license
   applies only to patent claims licensable by You that are necessarily
   infringed by Your Contribution alone or by combination with the Project.

4. REPRESENTATIONS
   You represent that:
   (a) You are legally entitled to grant the above licenses
   (b) Your Contribution is Your original creation
   (c) Your Contribution does not violate any third-party rights
   (d) If employed, Your employer has authorized the contribution OR
       the contribution is outside the scope of your employment

5. NO OBLIGATION TO USE
   The Project is under no obligation to incorporate any Contribution.

6. SUPPORT
   You are not expected to provide support for Your Contributions unless
   You choose to do so.
```

### 3.6 CLA Implementation

**Recommended tool:** [CLA Assistant](https://cla-assistant.io/) (GitHub integration)

- Free for open-source projects
- Integrates with GitHub pull requests
- Contributors sign via GitHub OAuth (low friction)
- Stores signed CLAs for legal record
- Blocks PR merging until CLA is signed
- Alternative: [CLA Assistant Lite](https://github.com/contributor-assistant/github-action) (GitHub Action, no external service)

**Implementation steps:**

1. [ ] Draft the CLA document (based on Apache ICLA) — have an attorney review it
2. [ ] Store the CLA as `CLA.md` in the repository root
3. [ ] Set up CLA Assistant or CLA Assistant Lite GitHub Action
4. [ ] Add CLA requirement to `CONTRIBUTING.md`
5. [ ] Configure the GitHub Action to check for CLA signature on PRs
6. [ ] Add a note to the PR template about CLA requirements

### 3.7 AI-Generated Code Considerations

**Special consideration:** This project uses AI-first development (GitHub Copilot). The IP status of AI-generated code is legally unsettled:

- **U.S. Copyright Office (2023):** AI-generated content without human creative input is not copyrightable. However, a human's selection, arrangement, and creative direction of AI output may be copyrightable.
- **Practical implication:** Code generated by Copilot where a human developer provides substantial direction, reviews, modifies, and integrates the output is likely copyrightable by the developer. Pure AI output with no human creativity is not.
- **GitHub Copilot ToS:** GitHub's terms state that the user (not GitHub) owns the code suggestions they accept.

**Recommendation:** Document in the CLA and `CONTRIBUTING.md` that:
1. Contributors using AI tools are responsible for ensuring they have the right to contribute the code
2. Contributors should not accept AI suggestions verbatim without review and modification
3. The `Co-authored-by: Copilot` trailer (already in your contributing guide) is good practice for transparency

---

## 4. Trademark Strategy

### 4.1 Current State

**Finding:** The project is named "Finance" — an extremely generic, descriptive term. No trademark notices (™ or ®) appear anywhere in the repository. No trademark registration has been filed.

**Risk Level:** 🟡 **Medium** — The name "Finance" is almost certainly unregistrable as a trademark for a financial application. However, trademark protection may be available for a distinctive logo, tagline, or stylized mark.

### 4.2 Trademark Analysis of "Finance"

Trademark law classifies marks on a spectrum of distinctiveness:

| Category | Example | Registrable? | "Finance" for a Finance App |
|----------|---------|-------------|---------------------------|
| **Fanciful** (invented words) | "Xerox," "Kodak" | ✅ Strongest | ❌ Not applicable |
| **Arbitrary** (real words, unrelated meaning) | "Apple" for computers | ✅ Strong | ❌ Not applicable |
| **Suggestive** (hints at product) | "Netflix" | ✅ Moderate | ❌ Not applicable |
| **Descriptive** (describes the product) | "Sharp" for TVs | ⚠️ Only with "secondary meaning" | ⚠️ Borderline descriptive/generic |
| **Generic** (the category name) | "Computer" for computers | ❌ Never | ✅ **This is "Finance" for a finance app** |

**"Finance" is generic or at best descriptive** for a financial tracking application. The USPTO would almost certainly refuse registration under Section 2(e)(1) of the Lanham Act (merely descriptive) or Section 2(e)(1)/(d) (generic).

**Comparison:**
- "Mint" (Intuit) — arbitrary for finance (a plant/flavor, not a finance term) → registrable ✅
- "Quicken" — suggestive (suggests speed) → registrable ✅
- "Finance" — generic (literally the product category) → not registrable ❌

### 4.3 What CAN Be Trademarked

Even though "Finance" alone is likely unregistrable, other brand elements can be protected:

| Element | Protectable? | Action |
|---------|-------------|--------|
| **Logo / icon** (when designed) | ✅ Yes | File trademark once logo is finalized |
| **Stylized wordmark** (unique typographic treatment of "Finance") | ⚠️ Possibly | Depends on distinctiveness of the styling |
| **Tagline** (e.g., "Re-think your financial life") | ✅ Possibly | If sufficiently distinctive |
| **Product name + distinctive element** (e.g., "Finance by [Name]") | ⚠️ Possibly | Stronger if combined with distinctive element |
| **Different product name** | ✅ Yes | Best long-term strategy |

### 4.4 Recommendations

**Short-term (before public release):**

1. **Add a ™ notice to the README** — You can use ™ (unregistered trademark) without filing anything. It provides notice of claimed rights even without registration.
   ```markdown
   # Finance™
   ```

2. **Add a `TRADEMARKS.md` file** — Common in open-source projects (see Node.js, Rust). It clarifies what is and isn't covered by trademark claims and sets usage guidelines for forks.

3. **Reserve your brand in app stores and domains** — Even if you can't trademark "Finance," you can control `finance-app.com`, the App Store listing name, etc.

**Medium-term (consider seriously):**

4. **Choose a more distinctive product name.** This is the strongest recommendation. "Finance" will cause perpetual problems:
   - SEO: impossible to rank for "finance app" when your brand IS "finance"
   - App Store: dozens of apps named "Finance" or similar
   - Legal: no trademark protection means anyone can use the same name
   - Word of mouth: "I use Finance" is ambiguous — "I use [DistinctiveName]" is clear

   Examples of distinctive names in the space: Mint, YNAB, Monarch, Copilot (the finance app), Lunch Money, Actual Budget.

5. **If keeping "Finance":** File a trademark application for the **logo/icon** (design mark) rather than the word mark. A distinctive logo + the generic word "Finance" together may be registrable as a composite mark.

**Long-term:**

6. **Create trademark usage guidelines** for community forks (similar to Mozilla's guidelines for Firefox forks — they can use the code but not the branding).

### 4.5 Trademark Notices for the Repository

Add the following to a `TRADEMARKS.md` file:

```markdown
# Trademark Notice

"Finance" and the Finance logo are trademarks of [Entity Name].

The source code of Finance is available under [license], but this does not
grant permission to use the Finance trademarks. You may:

- ✅ Use the source code under the terms of the [license]
- ✅ Describe your project as "based on Finance" or "compatible with Finance"
- ❌ Use the Finance name or logo in a way that suggests your project IS Finance
- ❌ Use the Finance name or logo in your product name
- ❌ Use the Finance name or logo in your domain name

For questions about trademark usage, contact [contact info].
```

---

## 5. Patent Considerations

### 5.1 Code Analysis for Patentable Subject Matter

After reviewing the codebase, here is an assessment of potentially patentable innovations:

| Component | File(s) | Innovation | Patentable? |
|-----------|---------|------------|-------------|
| **Envelope encryption for sync** | `packages/sync/crypto/EnvelopeEncryption.kt` | DEK/KEK pattern for per-record encryption with household key sharing | ❌ Known pattern (AWS uses this; well-documented) |
| **Crypto-shredding for GDPR** | `packages/sync/crypto/CryptoShredder.kt` | Key destruction as data deletion with deletion certificates | ❌ Known technique (documented in NIST SP 800-88) |
| **Household key management** | `packages/sync/crypto/HouseholdKeyManager.kt` | Asymmetric key exchange for household KEK sharing | ❌ Standard key exchange pattern |
| **Delta sync with sequence tracking** | `packages/sync/delta/DeltaSyncManager.kt` | Per-table monotonic sequences with gap detection and checksum verification | ❌ Standard sync pattern (used by CouchDB, PowerSync, etc.) |
| **Conflict resolution** | `packages/sync/conflict/` | LWW and merge-based conflict resolution | ❌ Well-known CRDT/sync patterns |
| **Categorization engine** | `packages/core/categorization/CategorizationEngine.kt` | Rule-based transaction categorization with learning from history | ❌ Basic pattern matching, not novel |
| **Money allocation** | `packages/core/money/MoneyOperations.kt` | Remainder-distributing allocation with banker's rounding | ❌ Standard financial computation |
| **Financial aggregation** | `packages/core/aggregation/FinancialAggregator.kt` | Edge-first financial analytics (spending velocity, savings rate) | ❌ Standard financial calculations |

**Finding:** The codebase implements well-known patterns and algorithms. No novel, non-obvious inventions were identified that would meet the patent eligibility threshold under 35 U.S.C. §101–103. The innovation in Finance is in the **combination and execution** of these patterns, not in any individual algorithm.

**Risk Level:** 🟡 **Medium** — The MIT license contains **no explicit patent grant**. This creates ambiguity.

### 5.2 MIT vs. Apache 2.0 Patent Grant

| Aspect | MIT | Apache 2.0 |
|--------|-----|-----------|
| **Explicit patent grant** | ❌ No | ✅ Yes (Section 3) |
| **Implied patent grant** | ⚠️ Debated — some courts find an implied license | ✅ Explicit |
| **Patent retaliation** | ❌ No | ✅ Yes — patent license terminates if you sue |
| **Contributor patent grant** | ❌ No | ✅ Yes — contributors grant patent rights |

The MIT License's phrase "to deal in the Software without restriction" arguably implies a patent license, but this has never been definitively tested in court. Apache 2.0 removes all ambiguity.

### 5.3 Recommendations

1. **No defensive patents recommended at this stage.** Patent filing is expensive ($10K–$15K+ per patent in the US), and the codebase doesn't contain patentable innovations. The cost-benefit ratio is unfavorable for a solo developer.

2. **If staying with a permissive license, prefer Apache 2.0 over MIT** for the explicit patent grant and retaliation clause. This protects both you and your users from patent trolls.

3. **If switching to AGPL-3.0 or BSL 1.1:** Both include explicit patent provisions. GPLv3/AGPL-3.0 includes an implicit patent grant via Section 11. BSL 1.1 can be configured with Apache 2.0 as the change license, inheriting its patent protections.

4. **Add patent-related language to the CLA** (see §3.5, clause 3). This ensures contributors grant patent rights along with copyright.

---

## 6. Export Controls & Cryptography

### 6.1 Current Cryptographic Usage

The Finance codebase uses the following cryptographic technologies:

| Technology | Usage | Location | Classification |
|-----------|-------|----------|----------------|
| **AES-256-GCM** | Envelope encryption (DEK/KEK) | `packages/sync/crypto/` | Symmetric encryption — export controlled |
| **AES-256-CBC** | SQLCipher local database encryption | `packages/models/` (via SQLCipher dependency) | Symmetric encryption — export controlled |
| **HMAC-SHA512** | SQLCipher page authentication | `packages/models/` (via SQLCipher dependency) | Authentication — controlled |
| **Argon2id** | Key derivation | `packages/sync/crypto/KeyDerivation.kt` | KDF — controlled |
| **X25519** | Household key exchange (planned) | `packages/sync/crypto/HouseholdKeyManager.kt` | Asymmetric encryption — controlled |
| **ES256 (ECDSA P-256)** | JWT signing | `services/api/` (via Supabase) | Digital signature — controlled |
| **WebAuthn/FIDO2** | Passkey authentication | Auth architecture (ADR-0004) | Authentication — controlled |
| **TLS 1.2+** | Transit encryption | All network communication | Transport — usually exempt |
| **PKCE (SHA-256)** | OAuth challenge | `packages/sync/auth/PKCEHelper.kt` | Hash only — usually exempt |

### 6.2 Applicable Regulations

#### U.S. Export Administration Regulations (EAR)

Software that implements, uses, or provides access to cryptography is classified under **Category 5, Part 2 — Information Security** of the Commerce Control List (CCL).

**Key classifications:**

| ECCN | Description | Applies to Finance? |
|------|-------------|-------------------|
| **5D002** | Software that uses or performs cryptographic functionality | ✅ Yes — AES-256, Argon2id, X25519 |
| **5D992** | Mass-market encryption software | ⚠️ Possibly — depends on distribution |

#### Open-Source Exception (License Exception TSU / EAR §740.13(e))

**Good news:** EAR provides a specific exception for **publicly available encryption source code** under License Exception TSU (Technology and Software Unrestricted):

> Source code that is publicly available (e.g., posted on the internet) and subject to an open-source license is eligible for License Exception TSU, provided:
> 1. The source code is not subject to an express agreement for payment of a licensing fee
> 2. A copy of the source code is sent (or a URL notification is made) to the Bureau of Industry and Security (BIS) and the ENC Encryption Request Coordinator at NSA

**This means:** Publishing the repository on GitHub under an open-source license qualifies for the TSU exception, **BUT you must file a notification with BIS before or concurrent with publication.**

### 6.3 Required Actions

**Risk Level:** 🟠 **High** — Failure to file the BIS notification is technically a violation of export control law, even for open-source software.

#### Step 1: File BIS/ENC Notification (Required Before Publication)

Send an email to **both**:
- `crypt@bis.doc.gov` (Bureau of Industry and Security)
- `enc@nsa.gov` (NSA Encryption Request Coordinator)

The email should contain:

```
Subject: TSU Notification — Finance (Encryption Source Code)

Submitted by: [Your Name / Entity Name]
Date: [Date]

I am providing this notification pursuant to 15 C.F.R. § 740.13(e)
for publicly available encryption source code.

Product Name: Finance
URL: https://github.com/jrmoulckers/finance
Version: 0.x (pre-release)

Encryption algorithms used:
- AES-256-GCM (symmetric encryption, 256-bit key)
- AES-256-CBC with HMAC-SHA512 (via SQLCipher)
- Argon2id (key derivation)
- X25519 (asymmetric key exchange)
- ECDSA P-256 / ES256 (digital signatures)
- WebAuthn/FIDO2 (authentication)

Purpose: Personal/family financial data encryption at rest and in transit.

The source code is publicly available at the URL above under
[License Name]. No fee is charged for access to the source code.

This software uses encryption for:
1. Encrypting local financial databases (SQLCipher)
2. Encrypting sensitive fields during cloud sync (envelope encryption)
3. User authentication (passkeys, OAuth)
4. Secure key derivation and management

[Your Name]
[Contact Information]
```

#### Step 2: Document the ECCN Classification

Add an `EXPORT_CONTROL.md` or a section in `README.md`:

```markdown
## Export Control Notice

This software contains cryptographic functionality and is subject to
U.S. Export Administration Regulations (EAR). This software has been
classified as ECCN 5D002 and is eligible for License Exception TSU
under 15 C.F.R. § 740.13(e) as publicly available encryption source code.

A notification has been filed with the Bureau of Industry and Security
(BIS) and the NSA Encryption Request Coordinator per EAR requirements.

This software may not be exported or re-exported to countries under
U.S. embargo or to persons on the U.S. Denied Persons List.
```

#### Step 3: App Store Considerations

When publishing to the App Store and Google Play:
- **Apple App Store:** Requires an annual self-classification report for apps using encryption. You'll need to declare encryption usage in App Store Connect (ITSAppUsesNonExemptEncryption = YES, then provide ECCN).
- **Google Play:** Less formal, but the app must comply with export regulations of the countries where it's distributed.

### 6.4 ITAR Considerations

ITAR (International Traffic in Arms Regulations) applies to defense-related items on the United States Munitions List (USML). Finance is a consumer financial application with no military or defense application. **ITAR does not apply.**

### 6.5 Recommendation

| Action | Priority |
|--------|----------|
| File BIS/ENC notification email | **Must do before public** |
| Add `EXPORT_CONTROL.md` to repository | **Must do before public** |
| Set `ITSAppUsesNonExemptEncryption` in iOS `Info.plist` | Should do before App Store submission |
| Document ECCN classification internally | Should do soon |

---

## 7. Terms of Service & Privacy Policy

### 7.1 Current State

**Finding:** No Terms of Service (ToS) or Privacy Policy exists in the repository or as referenced documents. The `SECURITY.md` mentions GDPR and CCPA compliance but no formal privacy policy or legal terms are available.

**Risk Level:** 🟠 **High** — The _repository_ doesn't necessarily need ToS/Privacy Policy, but the _application_ absolutely does before it handles any real user data. Given that ADR-0004 already plans for GDPR/CCPA compliance mechanisms (crypto-shredding, data export), the legal documents to support those mechanisms are missing.

### 7.2 What's Needed

| Document | Needed for Repo? | Needed for App? | When? |
|----------|-----------------|-----------------|-------|
| **Privacy Policy** | Not required (repo doesn't collect user data) | ✅ Required (App Store requirement, GDPR/CCPA mandate) | Before app launch |
| **Terms of Service** | Not required | ✅ Required (for monetized app with accounts) | Before app launch |
| **Cookie Policy** | N/A | ✅ Required for web app (if using cookies) | Before web app launch |
| **Data Processing Agreement (DPA)** | N/A | ⚠️ May be required (if processing EU data with Supabase) | Before app launch |
| **Acceptable Use Policy** | N/A | ⚠️ Recommended (especially for household sharing) | Before app launch |

### 7.3 Privacy Policy Requirements

The Privacy Policy must comply with:

**GDPR (EU/EEA users):**
- Legal basis for processing (consent, legitimate interest, contract performance)
- What data is collected, how it's used, who has access
- Data retention periods
- Data subject rights (access, erasure, portability, rectification)
- Data transfer mechanisms (EU → US: review Standard Contractual Clauses with Supabase)
- Data Protection Officer designation (may not be required for a small entity)
- Right to lodge a complaint with a supervisory authority

**CCPA/CPRA (California users):**
- Categories of personal information collected
- Purpose of collection
- Right to know, delete, correct, and opt out
- "Do Not Sell or Share My Personal Information" notice (even if you don't sell data)
- Financial incentive disclosure (if premium features offer different data practices)

**App Store requirements (Apple):**
- Privacy "nutrition labels" in App Store Connect
- A URL to the privacy policy (required for all apps with accounts)
- App Tracking Transparency (ATT) disclosure if using any tracking

**Google Play:**
- Data Safety section completion
- Privacy policy URL (required for all apps that handle personal data)

### 7.4 PCI DSS Considerations

**Finance is a tracking app, not a payments processor.** Based on the codebase, Finance:
- ✅ Tracks transactions (amounts, payees, categories)
- ✅ Tracks account balances
- ❌ Does NOT process payments
- ❌ Does NOT store credit card numbers (account numbers are encrypted, but these are for display/reference, not for processing)
- ❌ Does NOT connect to bank APIs (no Plaid/Yodlee integration observed)

**PCI DSS likely does not apply** unless the app adds direct payment processing or stores full PANs (Primary Account Numbers). However, if the app stores partial card numbers (last 4 digits), this is generally acceptable and does not trigger PCI DSS obligations.

**Recommendation:** Clearly document in the Privacy Policy and ToS that Finance does NOT process payments and is not PCI DSS certified. If Plaid/bank integration is added later, revisit PCI DSS and SOC 2 requirements.

### 7.5 Where Should Legal Documents Live?

```
finance/
├── docs/
│   └── legal/
│       ├── PRIVACY_POLICY.md        # Privacy Policy (source of truth)
│       ├── TERMS_OF_SERVICE.md      # Terms of Service (source of truth)
│       ├── COOKIE_POLICY.md         # Cookie Policy (for web app)
│       └── DPA.md                   # Data Processing Agreement template
├── CLA.md                           # Contributor License Agreement (repo root)
├── TRADEMARKS.md                    # Trademark usage guidelines (repo root)
└── EXPORT_CONTROL.md                # Export control notice (repo root)
```

The app itself should link to hosted versions (e.g., `https://finance-app.com/legal/privacy`) that render the markdown as HTML. The markdown files in the repo serve as the version-controlled source of truth.

### 7.6 Recommendations

| Action | Priority |
|--------|----------|
| Draft Privacy Policy covering GDPR + CCPA | Must do before app launch |
| Draft Terms of Service | Must do before app launch |
| Set up `docs/legal/` directory structure | Should do before public |
| Ensure Supabase DPA is in place for EU data processing | Must do before app launch |
| Complete Apple Privacy Nutrition Labels | Must do before App Store submission |
| Complete Google Play Data Safety section | Must do before Play Store submission |

---

## 8. Individual vs. Entity Ownership

### 8.1 Current State

**Finding:** The copyright holder in `LICENSE` is "Jeffrey Moulckers" — an individual person. There is no mention of a company, LLC, or other legal entity associated with the project. The `SECURITY.md` describes the project as "bootstrapped" with a "sole maintainer."

**Risk Level:** 🔴 **Critical** — Operating a monetized financial application as an individual (not a legal entity) exposes the individual to unlimited personal liability.

### 8.2 Liability Analysis

| Risk | Without Entity (Current) | With LLC/Corp |
|------|-------------------------|---------------|
| **User sues over data breach** | Personal assets at risk (house, savings, car) | Limited to company assets |
| **User sues over incorrect financial calculations** | Personal liability | Limited liability |
| **Tax authority dispute** | Personal tax situation complicated | Clean business/personal separation |
| **Regulatory fine (GDPR/CCPA)** | Assessed against individual | Assessed against entity |
| **App Store disputes** | Personal developer account | Business developer account |
| **Contract disputes (Supabase, etc.)** | Personal obligation | Entity obligation |
| **Intellectual property lawsuit** | Personal financial exposure | Limited to entity |

### 8.3 Why This Is Critical for a Financial App

A financial tracking application carries **elevated risk** compared to a typical consumer app:

1. **Data sensitivity:** Financial data is among the most sensitive categories of personal data. A breach could result in identity theft, fraud, or financial harm to users. Regulatory fines can be severe:
   - GDPR: Up to €20M or 4% of global annual revenue
   - CCPA: $2,500–$7,500 per intentional violation
   
2. **Accuracy expectations:** Users rely on the app for financial decisions. If a calculation error causes a user to overspend, misallocate, or make a poor financial decision, there is potential for a negligence claim.

3. **Fiduciary-adjacent perception:** While a tracking app is not a financial advisor, users may perceive it as providing financial guidance. Clear disclaimers are needed.

### 8.4 Recommended Entity Structure

**Recommendation: Form a single-member LLC** in a business-friendly state (Delaware, Wyoming, or your state of residence).

| Consideration | Recommendation |
|--------------|----------------|
| **Entity type** | Single-member LLC (simplest, pass-through taxation) |
| **State** | Wyoming (lowest cost, strong privacy), Delaware (standard for tech), or Texas (if resident) |
| **Cost** | $100–$500 formation + $50–$300/year maintenance |
| **Timeline** | 1–2 weeks for formation |
| **Tax treatment** | Default: disregarded entity (pass-through to personal taxes). Can elect S-Corp later for tax optimization. |

### 8.5 Steps After Entity Formation

1. [ ] Form LLC and obtain EIN (Employer Identification Number) from IRS
2. [ ] Open a business bank account (separate finances from personal)
3. [ ] Transfer IP ownership to the LLC (simple IP assignment agreement)
4. [ ] Update `LICENSE` copyright line: `Copyright (c) 2026 [LLC Name]`
5. [ ] Register App Store developer accounts under the LLC
6. [ ] Sign service agreements (Supabase, hosting, etc.) under the LLC
7. [ ] Update `SECURITY.md` contact information
8. [ ] File DBA ("doing business as") if using "Finance" as a trade name
9. [ ] Obtain business insurance:
   - **General liability insurance** ($500–$1,500/year)
   - **Errors & omissions (E&O) / professional liability** ($1,000–$3,000/year) — critical for a financial app
   - **Cyber liability insurance** ($500–$2,000/year) — covers data breach costs

### 8.6 IP Protection Under an LLC

| Aspect | Individual Ownership | LLC Ownership |
|--------|---------------------|---------------|
| **Copyright enforcement** | You sue personally | Entity sues (less personal exposure) |
| **Trademark registration** | Filed by individual | Filed by entity (more credible) |
| **CLA counterparty** | Contributors grant rights to you personally | Contributors grant rights to the entity (survives you) |
| **Continuity** | IP dies with you (enters estate) | Entity continues independently |
| **Credibility** | "A guy's side project" | "A company's product" |
| **Acquisition** | Complex personal asset sale | Clean entity sale (standard M&A) |

**Recommendation:** Form the LLC and transfer IP **before going public.** The `LICENSE` file's copyright holder should be the LLC, not an individual. This also makes the CLA cleaner — contributors grant rights to the entity, not to a person.

---

## 9. Pre-Publication Checklist

### Must Do Before Going Public

| # | Action | Section | Effort | Blocked By | Status |
|---|--------|---------|--------|------------|--------|
| 1 | **Decide on license** (BSL 1.1 or AGPL-3.0 recommended over MIT) | §2 | 1 day (decision) + attorney review | Attorney consultation | ✅ Done — BSL 1.1 selected |
| 2 | **Form LLC** and transfer IP ownership | §8 | 1–2 weeks | State filing | ⬜ Pending |
| 3 | **Update LICENSE** with new entity name and chosen license | §2, §8 | 1 hour | LLC formation, license decision | ✅ Done (BUSL-1.1) |
| 4 | **Draft and implement CLA** (based on Apache ICLA) | §3 | 2–3 days + attorney review | LLC formation | ⬜ Pending |
| 5 | **File BIS/ENC notification** for cryptographic code | §6 | 1 hour (email) | None | ⬜ Pending |
| 6 | **Add EXPORT_CONTROL.md** | §6 | 30 minutes | BIS notification | ⬜ Pending |
| 7 | **Update all SPDX headers** if license changes | §2 | 1 hour (scripted) | License decision | ✅ Done (BUSL-1.1) |

### Should Do Soon After Public

| # | Action | Section | Effort |
|---|--------|---------|--------|
| 8 | **Add TRADEMARKS.md** | §4 | 1 hour |
| 9 | **Draft Privacy Policy** | §7 | 2–3 days + attorney review |
| 10 | **Draft Terms of Service** | §7 | 2–3 days + attorney review |
| 11 | **Set up CLA Assistant** GitHub integration | §3 | 2 hours |
| 12 | **Consider renaming the product** for trademark viability | §4 | Ongoing |
| 13 | **Obtain business insurance** (E&O + cyber liability) | §8 | 1 week |
| 14 | **Review Supabase DPA** for GDPR compliance | §7 | 1 day |

### Nice to Have

| # | Action | Section | Effort |
|---|--------|---------|--------|
| 15 | Add DCO sign-off to git hooks (in addition to CLA) | §3 | 1 hour |
| 16 | File trademark application for logo (when designed) | §4 | $250–$350 USPTO fee + attorney |
| 17 | Add `LICENSING.md` explaining license rationale | §2 | 1 hour |
| 18 | Set up Apple Privacy Nutrition Labels | §7 | 2 hours |
| 19 | Prepare Google Play Data Safety form | §7 | 2 hours |

---

## References

- [MIT License — OSI](https://opensource.org/licenses/MIT)
- [Apache License 2.0 — OSI](https://opensource.org/licenses/Apache-2.0)
- [AGPL-3.0 — FSF](https://www.gnu.org/licenses/agpl-3.0.html)
- [Business Source License 1.1 — MariaDB](https://mariadb.com/bsl11/)
- [Apache Individual CLA](https://www.apache.org/licenses/icla.pdf)
- [CLA Assistant](https://cla-assistant.io/)
- [Developer Certificate of Origin](https://developercertificate.org/)
- [EAR §740.13(e) — License Exception TSU](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.13)
- [BIS Encryption FAQ](https://www.bis.doc.gov/index.php/policy-guidance/encryption)
- [USPTO Trademark Basics](https://www.uspto.gov/trademarks/basics)
- [U.S. Copyright Office — AI and Copyright (2023)](https://www.copyright.gov/ai/)
- [GDPR — Full Text](https://gdpr-info.eu/)
- [CCPA — Full Text](https://oag.ca.gov/privacy/ccpa)
- [PCI DSS v4.0](https://www.pcisecuritystandards.org/)
- [HashiCorp License Change (2023)](https://www.hashicorp.com/blog/hashicorp-adopts-business-source-license) — precedent for BSL adoption
- [Sentry BSL](https://blog.sentry.io/relicensing-sentry/) — precedent for BSL adoption
- [Elastic License Change (2021)](https://www.elastic.co/blog/elastic-license-v2) — precedent for source-available licensing

---

## Related ADRs

- [ADR-0004: Authentication & Security Architecture](./0004-auth-security-architecture.md) — crypto design informing §5 (Export Controls) and §7 (Privacy/Compliance)
- [ADR-0008: Competitive Protection Strategy](./0008-competitive-protection-strategy.md) — companion analysis covering what code is exposed and how to maintain competitive advantage; this ADR covers the legal framework for that protection

---

*This analysis was prepared by the Architect AI agent and requires review by Jeffrey Moulckers and qualified legal counsel before any actions are taken. No legal decisions should be made based on this document alone.*
