<!-- SPDX-License-Identifier: BUSL-1.1 -->

# On-Device Transaction Categorization (#2382)

Privacy-first category suggestions for imported and manually-entered
transactions. **All inference runs on-device.** Merchant names, memos, and
amounts are never sent to a remote service.

## Pipeline

A single `TransactionCategorizer.categorize(_:)` call consults four sources in
strict priority order and always returns one suggestion:

| Priority | Source             | When it wins                                             | Confidence |
| -------- | ------------------ | -------------------------------------------------------- | ---------- |
| 1        | `.personalization` | A learned user correction exists for the token signature | 0.97       |
| 2        | `.coreML`          | A bundled Core ML model is available and classifies      | model      |
| 3        | `.rules`           | The deterministic keyword engine matches                 | ≤ 0.85     |
| 4        | `.fallback`        | Nothing matched — safe default category                  | 0.0        |

### Feature reduction

`CategorizationFeatureExtractor` reduces each transaction to non-reversible
features before any classification:

- **Text** → normalised, de-duplicated tokens via `MerchantTokenizer`
  (lowercased, punctuation stripped, store numbers / payment-network noise /
  stop words removed).
- **Amount** → a coarse magnitude _bucket_ (0–7); the exact amount is not used
  for classification beyond the bucket.
- **Date** → day-of-week, hour, and a weekend flag (calendar is injectable for
  deterministic tests).

The personalization key is an order-independent digest of the token _set_, so a
correction learned for `STARBUCKS #44` also applies to `Starbucks Store 91`.

## Core ML fallback behaviour

The Shared module is dependency-free and defines the `MLCategoryClassifier`
seam. The app target supplies the concrete adapter.

- **No model bundled / runtime unavailable** → `UnavailableMLClassifier` (the
  default) reports `isAvailable == false`; the categorizer transparently falls
  back to the rule engine, then to the safe default. The feature never fails
  closed and never blocks transaction entry.
- **Model present but abstains** (`classify` returns `nil`) → same rule-engine
  fallback.
- **Model load failure at runtime** → the app adapter catches the error, reports
  `isAvailable == false`, logs an aggregate (content-free) error, and the
  rule engine takes over.

The concrete Core ML adapter (`CoreMLCategoryClassifier` in
`apps/ios/Finance/Services`) is implemented against the seam; packaging the
compiled `.mlmodelc` and wiring `MLModel` loading is an Xcode/Core ML toolchain
step marked `TODO(human)`. Until then it ships in the unavailable state and the
rule engine drives every suggestion — fully functional and tested.

## Persistence of corrections

`UserDefaultsCategoryCorrectionStore` persists a `[signature: categoryId]`
dictionary in the app-group suite when native storage is available. If no
defaults are available it degrades to an empty, no-op store (categorization
still works, just without personalization).

## Telemetry (privacy-safe, aggregate only)

`AggregateCategorizationTelemetry` records **counts and enum tags only** —
`suggestionsShown`, `accepted`, `overridden`, `disabled`, `fallbackShown`, and
breakdowns by `source` / confidence `band`. It never records merchant names,
memos, amounts, category ids, or signatures. The snapshot supports a local
feature-health view and an acceptance-rate metric.

## Review surface

`CategorySuggestionViewModel` + `CategorySuggestionCard` present the suggestion
with its confidence and let the user **accept**, **override** (pick another
category), or **disable** suggestions entirely
(`CategorizationPreferences.setEnabled(false)`). Accept/override persist a
correction for future personalization; every action emits aggregate telemetry.
