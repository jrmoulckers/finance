# i18n Market Prioritization Research

> **Sprint:** 8 — Growth and Retention
> **Issue:** #795
> **Priority:** P2 — Medium
> **Date:** 2025-07-27
> **Owner:** Product Management
> **Status:** Complete

---

## Executive Summary

This document ranks international markets by opportunity for the Finance app, defines a localization strategy, and provides the translation workflow and financial term glossary framework. The goal is to identify the top 5 launch languages that maximize addressable market while keeping localization costs manageable.

---

## Market Ranking Methodology

Markets are scored on 5 weighted criteria:

| Criterion               | Weight | Description                                                   |
| ----------------------- | ------ | ------------------------------------------------------------- |
| Addressable Market Size | 30%    | Smartphone users with personal finance app potential          |
| Willingness to Pay      | 25%    | IAP revenue per user in the region                            |
| Competitive Density     | 20%    | Number and strength of localized competitors (lower = better) |
| Privacy Sensitivity     | 15%    | Cultural alignment with privacy-first positioning             |
| Localization Complexity | 10%    | Technical and linguistic difficulty (lower = better)          |

---

## Top 5 Language Prioritization

### Ranked Results

| Rank  | Language        | Locale              | Score  | Addressable Market                                      | WTP Index     | Competition                    | Privacy Fit                  |
| ----- | --------------- | ------------------- | ------ | ------------------------------------------------------- | ------------- | ------------------------------ | ---------------------------- |
| **1** | Spanish         | es-ES, es-MX, es-AR | 87/100 | 580M+ speakers, 20+ countries                           | Medium        | Low — few privacy-focused apps | Medium                       |
| **2** | German          | de-DE, de-AT, de-CH | 84/100 | 100M+ speakers, strong EU market                        | High          | Medium                         | **Very High** (GDPR leaders) |
| **3** | Portuguese (BR) | pt-BR               | 81/100 | 215M+ speakers, Brazil is 5th largest smartphone market | Medium        | Low — underserved market       | Medium                       |
| **4** | French          | fr-FR, fr-CA, fr-BE | 79/100 | 320M+ speakers, EU + Canadian markets                   | Medium-High   | Medium                         | High (GDPR)                  |
| **5** | Japanese        | ja-JP               | 76/100 | 125M speakers, 3rd largest app market                   | **Very High** | High — strong local apps       | High                         |

### Detailed Rationale

#### 1. Spanish (es) — Score: 87/100

**Why #1:**

- Largest addressable market by speaker count (580M+ across 20+ countries)
- Latin America is severely underserved by privacy-focused finance apps
- Single translation covers Spain, Mexico, Argentina, Colombia, and 15+ more countries
- Low localization complexity (Latin script, well-established finance terminology)
- Growing fintech adoption in Latin America (60%+ smartphone penetration in Mexico, Brazil, Colombia)

**Risks:**

- Currency diversity across countries requires careful formatting
- Different financial customs (e.g., aguinaldo in Mexico, SAC in Argentina)
- App store optimization varies significantly by country

**Recommended variants:** es-ES (Spain), es-MX (Mexico), es-AR (Argentina) — 3 locale variants covering 80%+ of Spanish speakers

#### 2. German (de) — Score: 84/100

**Why #2:**

- Strongest privacy-culture alignment of any market (Germany leads GDPR enforcement)
- "Made with privacy" messaging resonates deeply in DACH region
- High willingness to pay for software (German app market ARPU is 2-3x global average)
- Strong existing demand for local-first tools (German users distrust cloud services)
- Relatively small localization scope (1 language, 3 locales)

**Risks:**

- High expectations for software quality and compliance
- Strong local competitors (Finanzguru, MoneyMoney)
- Complex compound words may affect UI layout

**Recommended variants:** de-DE (Germany), de-AT (Austria), de-CH (Switzerland)

#### 3. Portuguese — Brazilian (pt-BR) — Score: 81/100

**Why #3:**

- Brazil is the 5th largest smartphone market globally
- PIX (instant payment system) adoption at 70%+ shows fintech readiness
- Very few privacy-focused finance apps available in Portuguese
- Young, tech-savvy population (median age 33)
- One locale covers the primary market

**Risks:**

- Economic volatility affects willingness to pay for subscriptions
- PIX integration expectations (future feature request)
- Different financial terminology from Portuguese (Portugal)

**Recommended variants:** pt-BR (Brazil primary), pt-PT (Portugal secondary)

#### 4. French (fr) — Score: 79/100

**Why #4:**

- Covers France, Canada (Quebec), Belgium, Switzerland, and 20+ African nations
- Strong EU privacy awareness (CNIL is aggressive on enforcement)
- Canadian French market is underserved by finance apps
- Medium-high willingness to pay in France and Canada

**Risks:**

- Significant dialect differences between France, Quebec, and African French
- French localization requires formal/informal tone decisions (tu vs. vous)
- Canadian financial terminology differs from European French

**Recommended variants:** fr-FR (France), fr-CA (Canada) — 2 variants covering primary markets

#### 5. Japanese (ja) — Score: 76/100

**Why #5:**

- Highest willingness to pay of any market (Japan app ARPU is 3-4x global average)
- 3rd largest app market by revenue globally
- Privacy-conscious culture aligns with app positioning
- High smartphone penetration (90%+)

**Risks:**

- Highest localization complexity (CJK characters, honorific language levels)
- Very strong local competitors (MoneyForward, Zaim, Moneytree)
- Requires right-to-left number formatting and unique date formats
- UI redesign may be needed for character density

**Recommended variants:** ja-JP (single locale)

---

## Markets Considered but Not Selected for Launch

| Language     | Score | Reason for Deferral                                                     |
| ------------ | ----- | ----------------------------------------------------------------------- |
| Korean (ko)  | 72    | Strong local competitors (Toss, KakaoPay), high localization complexity |
| Italian (it) | 68    | Smaller market, covered partially by EU English adoption                |
| Dutch (nl)   | 65    | Small market, high English proficiency reduces urgency                  |
| Arabic (ar)  | 62    | RTL layout requires significant engineering investment                  |
| Hindi (hi)   | 58    | Large market but low WTP, complex script, many local alternatives       |
| Chinese (zh) | 55    | Regulatory barriers (data localization), dominant local ecosystem       |

---

## Localization Strategy

### Phase 1: Top 3 Languages (Sprint 8-9)

| Language              | Target Sprint | Effort | Cost Estimate |
| --------------------- | ------------- | ------ | ------------- |
| Spanish (es)          | Sprint 8-9    | Medium | $3,000-5,000  |
| German (de)           | Sprint 8-9    | Medium | $2,500-4,000  |
| Portuguese BR (pt-BR) | Sprint 9      | Medium | $2,500-4,000  |

### Phase 2: Languages 4-5 (Sprint 10+)

| Language      | Target Sprint | Effort | Cost Estimate |
| ------------- | ------------- | ------ | ------------- |
| French (fr)   | Sprint 10     | Medium | $3,000-5,000  |
| Japanese (ja) | Sprint 10+    | High   | $5,000-8,000  |

### Total Estimated Localization Cost: $16,000-26,000

This includes:

- Professional translation (not machine translation for financial terms)
- Cultural adaptation review
- App store listing localization
- Marketing material localization

---

## Translation Workflow

### Process

```
1. String Extraction
   |  i18n framework (#264) extracts all user-facing strings
   v
2. Context Documentation
   |  Each string tagged with context, screenshots, character limits
   v
3. Professional Translation
   |  Native-speaker financial translators (not general translators)
   v
4. Cultural Adaptation Review
   |  In-market reviewer validates financial terminology and tone
   v
5. QA: Layout & Formatting
   |  Verify all translated strings fit in UI, no truncation
   v
6. QA: Financial Accuracy
   |  Verify currency formatting, number systems, date formats
   v
7. Community Review (Optional)
   |  Beta users in target market validate natural language feel
   v
8. Release
```

### Translation Quality Standards

- **Financial terminology:** Must use established, recognized terms in each market
- **Tone:** Non-judgmental, supportive — matches English brand voice
- **Consistency:** Same term used for same concept throughout the app
- **No machine translation** for financial terms (risk of harmful misinterpretation)
- **Character limits:** All strings must fit in allocated UI space
- **Pluralization:** Correct plural forms for each language
- **Number formatting:** Locale-specific (1,000.00 vs 1.000,00)
- **Currency symbols:** Correct placement (prefix vs suffix) per locale
- **Date formatting:** Locale-specific (MM/DD vs DD/MM vs YYYY-MM-DD)

---

## Financial Terms Glossary Framework

### Core Terms Requiring Specialized Translation

| English Term | Context                      | Translation Notes                               |
| ------------ | ---------------------------- | ----------------------------------------------- |
| Account      | Bank account, cash account   | Must distinguish from "user account"            |
| Transaction  | Money in/out event           | Must not imply credit card only                 |
| Budget       | Spending limit by category   | Some cultures use "envelope" metaphor           |
| Goal         | Savings target               | Must imply aspiration, not obligation           |
| Balance      | Current amount               | Must not imply "owed"                           |
| Income       | Money received               | Tax implications vary by country                |
| Expense      | Money spent                  | Must be neutral (not "cost" or "loss")          |
| Transfer     | Movement between accounts    | Must not imply bank wire                        |
| Category     | Transaction classification   | Some languages prefer "type" or "group"         |
| Sync         | Multi-device synchronization | Technical term — may need explanation           |
| Export       | Data download                | Must not imply "send to third party"            |
| Premium      | Paid subscription tier       | Must not translate to "luxury" or "elite"       |
| Free trial   | 14-day trial period          | Must clearly convey "no charge" and "temporary" |

### Language-Specific Considerations

| Language          | Key Consideration                                                              |
| ----------------- | ------------------------------------------------------------------------------ |
| **Spanish**       | Formal "usted" for financial context; "presupuesto" (budget) is standard       |
| **German**        | Compound words may exceed UI character limits; "Haushaltsbuch" vs "Finanz-App" |
| **Portuguese BR** | "Orçamento" (budget) is standard; PIX-related vocabulary expected              |
| **French**        | "tu" vs "vous" decision needed; "budget" is borrowed from English              |
| **Japanese**      | Honorific level (です/ます form) required; katakana for loan words             |

---

## Cultural Adaptation Guidelines

### Per-Market Adaptations

| Market      | Adaptation                                                            | Reason                       |
| ----------- | --------------------------------------------------------------------- | ---------------------------- |
| **Spain**   | Euro formatting (1.234,56 €)                                          | EU convention                |
| **Mexico**  | Peso formatting ($1,234.56 MXN)                                       | Avoid confusion with USD     |
| **Germany** | Euro formatting (1.234,56 €), strict privacy language                 | GDPR culture                 |
| **Brazil**  | Real formatting (R$ 1.234,56), PIX awareness                          | Local financial norms        |
| **France**  | Euro formatting (1 234,56 €), formal tone                             | Space as thousands separator |
| **Japan**   | Yen formatting (¥1,234), vertical text support not needed for finance | High-density UI              |

### App Store Localization

Each market requires:

- [ ] Localized app name / subtitle
- [ ] Localized description (short + long)
- [ ] Localized keywords / tags
- [ ] Localized screenshots with translated overlay text
- [ ] Localized "What's New" for each release
- [ ] Localized privacy policy summary

---

## Success Metrics for i18n Launch

| Metric                                  | Target                                | Timeframe                      |
| --------------------------------------- | ------------------------------------- | ------------------------------ |
| Downloads from localized markets        | 20%+ of total downloads               | Within 30 days of localization |
| Retention in localized markets          | Within 10% of English D7 retention    | Within 60 days                 |
| App store rating in localized markets   | >=4.0 stars                           | Within 90 days                 |
| Premium conversion in localized markets | Within 80% of English conversion rate | Within 90 days                 |
| Support tickets in non-English          | <15% of total                         | Ongoing                        |

---

## Dependencies

| Dependency                | Issue           | Status  | Impact                                           |
| ------------------------- | --------------- | ------- | ------------------------------------------------ |
| i18n framework            | #264            | Open    | String extraction must be implemented first      |
| Analytics instrumentation | #764            | Open    | Required to measure localized market performance |
| App store geographic data | Post-launch     | Needed  | Validates market prioritization with real data   |
| Marketing localization    | Sprint 8 (#808) | Planned | Coordinated launch messaging                     |

---

## Action Items

- [ ] Validate market ranking with app store geographic download data (4+ weeks post-launch)
- [ ] RFP for professional translation services (financial domain expertise required)
- [ ] Begin string extraction and context documentation (#264 prerequisite)
- [ ] Create per-language glossary with in-market financial advisors
- [ ] Design UI with 30%+ text expansion buffer for German and French
- [ ] Set up localized app store listings in developer consoles
- [ ] Coordinate with marketing (#808) on localized launch messaging
- [ ] Plan community review program for beta translations
