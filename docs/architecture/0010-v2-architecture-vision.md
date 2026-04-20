# ADR-0010: V2 Architecture Vision — Bank Connections, AI Features, Multi-Currency

**Status:** Proposed
**Date:** 2025-07-27
**Author:** System Architect (AI agent)
**Reviewers:** Pending human review
**Sprint:** S8

## Context

Finance V1 delivers a fully functional offline-first financial tracker with manual transaction entry, CSV import, household sharing, and multi-platform support (iOS, Android, Web, Windows). As the product matures toward V2, three major capability areas demand architectural planning:

1. **Bank connections** — Automated transaction ingestion via Plaid, GoCardless, or similar aggregators.
2. **AI-powered features** — Intelligent categorization, spending anomaly detection, natural-language search, and personalized financial insights (premium tier differentiators per ADR-0009).
3. **Multi-currency first-class support** — Real-time exchange rates, multi-currency portfolio views, cross-currency budget tracking, and automatic conversion for multi-country households.

### Architectural Tension

V2 features create tension with the V1 edge-first principle. The server must expand, but only for capabilities that physically cannot run on the client:

| Capability                 | Edge-viable? | Why                                                                           |
| -------------------------- | ------------ | ----------------------------------------------------------------------------- |
| Bank connection OAuth      | ❌ Server    | Aggregators require server-to-server API calls with institutional credentials |
| Transaction ingestion      | ❌ Server    | Webhooks from aggregators arrive at a server endpoint                         |
| AI categorization          | ✅ On-device | Small models (< 50 MB) run efficiently on modern mobile hardware              |
| Anomaly detection          | ✅ On-device | Statistical analysis over local transaction history                           |
| NLP search                 | ⚠️ Hybrid    | Simple search on-device; semantic search requires embedding models            |
| Exchange rate fetching     | ❌ Server    | API calls to rate providers (ECB, Fixer, Open Exchange Rates)                 |
| Currency conversion        | ✅ On-device | Computation over cached rates                                                 |
| Multi-currency aggregation | ✅ On-device | Local computation once rates are available                                    |

### Constraints

- V2 must not break V1 offline functionality
- Bank connections involve regulated data (PSD2, PCI DSS awareness)
- AI models must be < 100 MB per model with < 50 ms inference latency
- Multi-currency must handle 150+ ISO 4217 currencies with sub-second conversion
- Self-hosted VPS ($10–20/mo, ADR-0007) must absorb V2 workloads

## Decision

Adopt a **capability-layered V2 architecture** with well-defined edge/server boundaries per feature area.

### 1. Bank Connection Architecture

- **Staging table pattern** — Bank-ingested transactions land in `bank_transactions`, not in `transactions` directly. Client pulls staged data for review/approval, preserving user agency.
- **Aggregator abstraction** — `BankingProvider` interface abstracts Plaid, GoCardless, TrueLayer. Server translates to canonical `BankTransaction` format.
- **Credential isolation** — API keys and access tokens server-side only, encrypted with per-household KEK (ADR-0004).
- **Webhook-driven ingestion** — Server receives aggregator webhooks, writes to staging table. PowerSync syncs to clients.
- **Regional providers** — Plaid (North America), GoCardless/TrueLayer (Europe PSD2).

### 2. AI Feature Architecture

- **On-device inference** — Platform-native runtimes: TFLite (Android), CoreML (iOS), ONNX (Windows), WASM (Web).
- **Model registry** — CDN-hosted versioned artifacts with background download and SHA-256 integrity.
- **Rule-based fallback** — Every ML feature degrades gracefully to keyword/merchant rules when models are unavailable.
- **Privacy guarantee** — Transaction data never leaves the device for inference. Models download; data stays local.

| Feature                    | Tier                        | Model Size |
| -------------------------- | --------------------------- | ---------- |
| Auto-categorization        | Free (basic) / Premium (ML) | ~15 MB     |
| Spending anomaly detection | Premium                     | ~5 MB      |
| Natural-language search    | Premium                     | ~30 MB     |
| Financial health score     | Free                        | No model   |
| Predictive budgeting       | Premium                     | ~10 MB     |
| Receipt OCR                | Premium                     | ~20 MB     |

### 3. Multi-Currency Architecture

- **Rate table in sync scope** — `exchange_rates` synced via new `global_data` PowerSync bucket. Offline conversion uses last-synced rates.
- **Historical rates** — Preserved for accurate historical reporting (rate on transaction date).
- **Display currency** — Per-user preference; all aggregation views convert to it.
- **Multi-currency accounts** — Accounts have `currency_code`. Cross-currency transfers generate linked transactions.

### V2 Server Expansion

```
V1 Server (thin sync):
├── Supabase Auth + PostgreSQL + RLS + PowerSync

V2 additions (compartmentalized):
├── Banking Edge Functions (link-token, webhook, staging)
├── Rate Worker (ECB cron every 4h)
├── Model CDN (static ML artifacts)
└── New sync bucket: global_data (exchange rates)

Cost impact: ~$2–5/mo additional on self-hosted VPS
```

## Alternatives Considered

### Alternative 1: Full Server-Side AI (Cloud ML)

- **Pros:** Large models; centralized updates.
- **Cons:** Breaks privacy-first; cannot work offline; API costs scale unpredictably.

### Alternative 2: Direct Bank API Integration (No Aggregator)

- **Pros:** No aggregator fees.
- **Cons:** PSD2 AISP registration (€20K+); each bank different API; multi-year effort.

### Alternative 3: Server-Side Currency Conversion

- **Pros:** Always latest rates.
- **Cons:** Every conversion requires network; breaks offline-first.

## Consequences

### Positive

- Privacy preserved — AI on-device, bank credentials server-only, rates are public data
- Offline-first intact — V2 degrades gracefully; V1 features unchanged
- Modular — Each capability independent with clear boundaries
- Cost-controlled — ~$2–5/mo additional

### Negative

- Server complexity increases (no longer pure sync layer)
- Four platform-specific model formats per model version
- Aggregator dependency for bank connections

### Risks

| Risk                   | Likelihood | Impact | Mitigation                                    |
| ---------------------- | ---------- | ------ | --------------------------------------------- |
| Plaid pricing changes  | Medium     | Medium | Aggregator abstraction; evaluate alternatives |
| Model too large        | Medium     | Low    | Size budgets; quantization; rule fallback     |
| Rate provider downtime | Low        | Low    | Multiple providers; cached rates              |
| V2 load exceeds VPS    | Low        | Medium | Async webhooks; vertical scaling              |

## Implementation Notes

### New Database Tables

```sql
CREATE TABLE bank_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id),
    provider TEXT NOT NULL, provider_item_id TEXT NOT NULL,
    institution_name TEXT, status TEXT NOT NULL DEFAULT 'active',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);

CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id),
    bank_connection_id UUID NOT NULL REFERENCES bank_connections(id),
    account_id UUID REFERENCES accounts(id),
    amount_cents BIGINT NOT NULL, currency_code TEXT NOT NULL,
    description TEXT, merchant_name TEXT, date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    matched_transaction_id UUID REFERENCES transactions(id),
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);

CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency TEXT NOT NULL, target_currency TEXT NOT NULL,
    rate DECIMAL(20, 10) NOT NULL, effective_date DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'ecb',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (base_currency, target_currency, effective_date, source)
);
```

### New KMP Modules

- `packages/core/banking/` — BankingProvider, TransactionMatcher, DeduplicationEngine
- `packages/core/ai/` — ModelRuntime (expect/actual), ModelRegistry, Categorizer
- `packages/core/currency/` (enhanced) — ExchangeRateCache, MultiCurrencyAggregator

## References

- [ADR-0002: Backend & Sync Architecture](./0002-backend-sync-architecture.md)
- [ADR-0004: Auth & Security Architecture](./0004-auth-security-architecture.md)
- [ADR-0007: Hosting Strategy](./0007-hosting-strategy.md)
- [ADR-0009: Legal & Monetization Analysis](./0009-legal-monetization-analysis.md)
- [Plaid API](https://plaid.com/docs/), [GoCardless](https://gocardless.com/bank-account-data/), [ECB Rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/)
- [TFLite](https://www.tensorflow.org/lite), [Core ML](https://developer.apple.com/documentation/coreml), [ONNX](https://onnxruntime.ai/)
