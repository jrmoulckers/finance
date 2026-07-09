# Spanish (es) localization — Android

Tracking issue: [#2166](https://github.com/jrmoulckers/finance/issues/2166) —
_"As a Spanish-preferred Android user, I need the full app localized instead of
falling back to English."_

## What this change delivers

- **Complete `es` string catalog.** `apps/android/src/main/res/values-es/strings.xml`
  now covers **all 361 keys** in the default catalog (was 312 → 49 keys were
  falling back to English). 0 missing, 0 extra, 0 duplicate keys.
- **Financial-terminology glossary** (`config/i18n/glossary.json`) as the reviewed
  source of truth for money-critical terms (Saldo, Presupuesto, Abono/Cargo, …).
- **Locale metadata** (`config/i18n/locales.json`) capturing the fallback chain and
  CLDR number/currency/date expectations per locale.
- **Coverage validator** (`scripts/i18n/validate-locale-catalogs.js`) that flags any
  missing `es` key, extra/duplicate keys, and placeholder mismatches. `es` is an
  `enforced` locale, so regressions fail the check.

## Newly translated key groups (the 49 previously English-only)

| Group                    | Keys                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Widgets / tiles          | `widget_balance_summary_*`, `widget_quick_transaction_*`, `widget_budget_summary_*`, `widget_goal_progress_*`, `tile_quick_transaction_label`, `widget_quick_entry_*`, `a11y_quick_entry_widget` |
| Data import / export     | `import_*`, `export_*`, `a11y_import_screen`                                                                                                                                                     |
| Sync conflict resolution | `conflicts_*`, `a11y_conflict_screen`                                                                                                                                                            |
| Cognitive accessibility  | `accessibility_*`, `a11y_accessibility_prefs`                                                                                                                                                    |
| Theme / appearance       | `theme_*`, `a11y_theme_prefs`                                                                                                                                                                    |
| Platform parity          | `parity_*`                                                                                                                                                                                       |

Terminology was kept consistent with the existing `es` catalog and the glossary:
`Saldo` (balance), `Presupuesto` (budget), `Transacción`, `Gasto`/`Ingreso`,
`Patrimonio neto` (net worth), `Sincronización`.

## Formatting expectations (CLDR)

`es` users get locale-aware number/currency/date formatting driven by the account's
ISO 4217 currency code (never a hardcoded symbol). See `config/i18n/locales.json`.
Note `es-US`/`es-MX` users typically transact in USD with regional separators —
always format with locale **+** currency code, not a fixed pattern.

## Formatting contract (`config/i18n/locales.json`)

Each locale carries a full, CLDR-aligned formatting contract. **Consumers must read
these from the active locale — never hardcode a symbol, separator, sign, or pattern
at the call site.**

### Currency resolution (locale ≠ currency)

The displayed currency is **always** driven by the account/transaction ISO 4217 code,
never by the language. The locale only chooses separators, symbol position, grouping,
and negative style. So:

- `es` + `USD` → `$1,234.56` (Spanish text, USD)
- `es-ES` + `EUR` → `1.234,56 €`

The `iso4217Example` fields are illustrative defaults only. This resolves the old
`es-ES` (EUR) vs `es-US`/`es-MX` (USD) ambiguity: pick separators from the region,
currency from the account. Regional Spanish is captured under `plannedLocales`
(`es-419`, `es-MX`).

### `conventionId` → formatting convention

Every locale has a stable `formatting.conventionId` that consumers switch on instead
of passing a convention manually (which previously let `es-ES` be formatted as
`$1,234.56`). Enumerated in the top-level `conventions` map:

| conventionId  | Example        | Notes                                         |
| ------------- | -------------- | --------------------------------------------- |
| `us_uk`       | `$1,234.56`    | symbol before, `.` decimal, `,` grouping      |
| `european`    | `1.234,56 €`   | symbol after, `,` decimal, `.` grouping       |
| `french`      | `1 234,56 €`   | symbol after, `,` decimal, **space** grouping |
| `swiss`       | `CHF 1'234.56` | code before, `.` decimal, `'` grouping        |
| `south_asian` | `₹1,23,456.78` | `.` decimal, `3;2` lakh/crore grouping        |

> `french` is deliberately distinct from `european` because French groups with a
> narrow no-break space, not `.`. The `LocaleCurrencyFormatter.EUROPEAN` enum in
> `packages/core` does **not** capture this — platform agents should resolve the
> convention from `conventionId`, not the four-value Kotlin enum.

### Negative & accounting amounts

`formatting.currency.negative` describes how negatives render per locale:
`defaultStyle` + `accountingStyle` ∈ `minusPrefix | parentheses | minusAfterSymbol |
trailingMinus`, with an `example` / `accountingExample`. US accounting uses
parentheses: `($1,234.56)`.

> **Accessibility:** negativity must never be signalled by colour alone (WCAG). The
> sign/parentheses are the primary signal; red/green is secondary.

### Number grouping (incl. South-Asian lakh)

`formatting.number.groupingPattern` uses CLDR primary/secondary notation: `"3"` for
Western (groups of three) and `"3;2"` for the South-Asian lakh/crore system
(`₹1,23,456.78`). A fixed mod-3 grouping mis-renders every large INR amount — see the
`LocaleCurrencyFormatter.INDIAN` gap (comment: "lakh grouping not implemented").

### Percent

`formatting.percent` = `decimalSeparator` + `spaceBeforeSymbol` + `symbolPosition` +
`example`. English is `75.5%`; French is `75,5 %` (comma decimal, narrow space before
`%`). `NumberFormatting.formatPercent` in `packages/core` currently hardcodes `.` and
no space — fix the consumer to read this block.

### Date & time

`formatting.date` now carries `shortPattern`, `mediumPattern`, `longPattern`,
`timePattern`, `hour12`, and `firstDayOfWeek`. Use these for statement ranges,
timestamps, due dates, and recurring-rule descriptions. e.g. a statement range:

- en-US: `Jul 1 – 31, 2026`, times `3:45 PM` (12h)
- fr-FR: `1 – 31 juil. 2026`, times `15:45` (24h)

## Pluralization (`config/i18n/plurals.json`)

The stack has **no runtime plural handling** today: `StringProvider.get(key, args)`
does naive `{0}` substitution and there are **zero `<plurals>`** in the Android
catalogs. `plurals.json` is the contract:

- `localeCategories` — the CLDR plural categories each locale MUST supply
  (`en`: one/other; `fr`/`es`: one/many/other; `ar`: zero/one/two/few/many/other;
  `ja`/`zh`: other).
- `concepts` — the count-bearing messages (`transactions_count`, `days_ago`, …) with
  their source (`en-US`) category strings.

Platform projection: Android `<plurals>`, iOS `.stringsdict`, ICU MessageFormat
`{count, plural, one {…} other {…}}` for web/KMP. **Never** build a count by
concatenating a number with a string.

## RTL & bidirectional text

The catalog now includes an RTL scaffold (`ar`, `"rtl": true`). RTL is a correctness
concern for money UI, not cosmetics:

- **Bidi isolation is mandatory.** Wrap every amount, account number, and LTR run in
  Unicode isolates `FSI` (U+2068) … `PDI` (U+2069) so the sign/parentheses/currency
  symbol render on the correct side inside RTL text. Without this, `-$1,234.56` in an
  Arabic sentence mis-places the minus.
- **Layout uses `start`/`end`, never `left`/`right`.** Mirror directional icons
  (back/forward, progress, trends). Charts and number axes need explicit direction.
- Western vs Arabic-Indic digits is a per-region display choice; currency is still
  resolved from ISO 4217.

`ar` ships as non-enforced (no `values-ar/strings.xml` yet) so the validator warns
rather than fails; add the catalog + native review before flipping `enforced: true`.

## Text expansion & length budgeting (`config/i18n/length-budgets.json`)

Translations expand vs. English (German/French up to ~35%). `length-budgets.json`
defines:

- `expansionFactors` — design-headroom multipliers by source length (short labels
  expand most — up to 2×).
- `constrainedKeyPrefixes` — Android key prefixes on space-limited surfaces
  (`widget_`, `tile_`, `notification_`, `parity_`, `a11y_`).
- `maxLengthHints` — soft caps (in en-US chars) for specific constrained keys.

Design widget/tile/notification surfaces against the localized worst case
(`source_length × factor`), prefer flexible/wrapping layouts, and request a shorter
**source** string rather than truncating a translation.

## Glossary invariants (`config/i18n/glossary.json`)

A mistranslated financial term is a correctness bug, so the glossary has enforceable
invariants (a future `scripts/i18n/` hook can gate these in CI):

1. Every `concept` supplies **all** locales listed in `locales`.
2. No blank/whitespace-only values.
3. A chosen term MUST NOT appear in that locale's `doNotUse` (false-friend guard).
4. `concept` values are unique.

Add money-critical terms here before they ship on any surface (Transfer, Fee,
Statement, Overdraft, Exchange rate, …). `ar` translations are a staged follow-up
pending native review.

## Adding a new locale (scaffolding checklist)

The `Locale.kt` constants (`de`, `pt-BR`, `ja`, `zh-CN`, `en-GB`, `es-MX`, `fr-CA`)
are **not** all backed by catalogs. `plannedLocales` in `locales.json` reconciles this
explicitly (what's real vs planned). To promote a planned locale to real:

1. **`config/i18n/locales.json`** — add a full entry to `locales[]`: `id`,
   `androidQualifier`, `fallback`, `enforced` (start `false`), `rtl`, and the complete
   `formatting` block (`conventionId`, currency + `negative`, number +
   `groupingPattern`, `percent`, `date`).
2. **`config/i18n/plurals.json`** — add the locale's CLDR categories to
   `localeCategories`.
3. **`config/i18n/glossary.json`** — add the locale to `locales` and translate every
   `concept` (respect `doNotUse`).
4. **Android** — create `apps/android/src/main/res/values-<qualifier>/strings.xml`
   with 100% key coverage of the default catalog.
5. **Validate** — `node scripts/i18n/validate-locale-catalogs.js`. Flip
   `enforced: true` only once coverage is 100% and a native review is done.

> Ownership: the canonical catalog lives here (`@localization-engineer`). The KMP
> `Strings` expect/actual mechanism in `packages/core/.../i18n/` is
> `@kmp-engineer` — coordinate there; don't edit it from `config/i18n`.

## Scope boundary

This PR is **i18n-only**: locale catalogs, glossary, docs, and the validator. The
remaining work in #2166 — replacing hardcoded Kotlin strings with
`stringResource(...)` in Compose screens — is owned by the Android platform agent.
The complete `es` catalog and `a11y_*` labels here are the inputs that wiring
depends on.

## Needs Human Action

- [ ] **Native-speaker review (es-MX/LatAm).** The 49 new translations target a
      neutral Spanish. A native reviewer should confirm tone and regional fit for
      the Mexican-immigrant persona in #2166. Items needing review are tagged
      `// TODO(human)` inline where nuance is debatable.
- [ ] **French (`fr`) parity.** `fr` is the same 49 keys behind and is currently a
      non-enforced (warning-only) locale in the validator. Translate and flip
      `enforced: true` in `config/i18n/locales.json` in a follow-up.
