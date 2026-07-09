# `config/i18n/` — Locale catalog source of truth

This directory holds the canonical, platform-agnostic localization sources that
feed the per-platform resource files. Localization Engineer owns these files;
platform agents integrate them into native localization systems.

## Files

| File                  | Purpose                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `glossary.json`       | Financial-terminology glossary. Reviewed translations for money-critical terms.        |
| `locales.json`        | Supported locales, fallback chain, and CLDR-aligned number/currency/date expectations. |
| `plurals.json`        | CLDR plural-category contract per locale + count-bearing message concepts.             |
| `length-budgets.json` | Text-expansion factors + max-length hints for space-constrained surfaces.              |

## How this feeds platform resources

The Android app projects these locales as string resources:

```
apps/android/src/main/res/values/strings.xml       # en-US (default / source)
apps/android/src/main/res/values-es/strings.xml     # es
apps/android/src/main/res/values-fr/strings.xml     # fr
```

`values/strings.xml` is the **source catalog**. Each localized
`values-<locale>/strings.xml` must reach 100% key coverage against it for any
locale marked `enforced: true` in `locales.json`. The shared KMP fallback strings
live in `packages/core/src/commonMain/kotlin/com/finance/core/i18n/` and are owned
by @kmp-engineer — coordinate there for the `Strings` expect/actual mechanism; do
not edit it from here.

> Ownership boundary: Localization Engineer provides the canonical catalog and the
> Spanish translations. Platform agents wire `stringResource(...)` into Compose and
> remove hardcoded Kotlin strings (see issue #2166).

## Validation

```powershell
node scripts/i18n/validate-locale-catalogs.js            # all locales
node scripts/i18n/validate-locale-catalogs.js --locale es
```

The validator checks coverage, extra/duplicate keys, and placeholder integrity
(`%1$s`, `%d`, …) per key. Enforced locales failing any check exit non-zero;
non-enforced locales are reported as warnings only.

## Terminology rules

- Financial terms MUST match `glossary.json` across every locale.
- `doNotUse` lists capture false-friend traps (e.g. es "Balance" → use **Saldo**,
  not "Equilibrio").
- Currency/number/date formatting follows CLDR via the account's ISO 4217 code —
  never hardcode symbols or separators.

## Glossary invariants

`glossary.json` is machine-checkable (a future `scripts/i18n/` hook can gate CI):

1. Every `concept` supplies all locales listed in `locales`.
2. No blank/whitespace-only values.
3. A chosen term MUST NOT appear in that locale's `doNotUse`.
4. `concept` values are unique.

## Formatting & plural contract

- `locales.json` per-locale `formatting` carries `conventionId`, currency `negative`
  (incl. accounting style), number `groupingPattern` (`3` or South-Asian `3;2`),
  `percent`, and full `date`/time patterns. Consumers resolve these from the active
  locale — never hardcode. Currency is resolved from the ISO 4217 code, not the
  language (`currencyResolution`).
- `plurals.json` declares the CLDR plural categories each locale must supply and the
  count-bearing message concepts. There is no runtime plural handling yet — do not
  build counts by string concatenation.
- `plannedLocales` in `locales.json` reconciles the `Locale.kt` constants that are not
  yet backed by catalogs. See `docs/i18n/localization-guide.md` for the full contract
  and the "Adding a new locale" checklist.
