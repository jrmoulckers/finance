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
