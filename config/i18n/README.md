# `config/i18n/` — Locale catalog source of truth

This directory holds the canonical, platform-agnostic localization sources that
feed the per-platform resource files. Localization Engineer owns these files;
platform agents integrate them into native localization systems.

## Files

| File            | Purpose                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `glossary.json` | Financial-terminology glossary. Reviewed translations for money-critical terms.        |
| `locales.json`  | Supported locales, fallback chain, and CLDR-aligned number/currency/date expectations. |

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
