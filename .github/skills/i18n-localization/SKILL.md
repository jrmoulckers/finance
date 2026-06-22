---
name: i18n-localization
description: >
  Internationalization and localization guidance for the Finance app. Use for
  topics related to i18n, localization, translations, locale packs, string
  keys, currency/date/number formatting, pluralization, text expansion,
  right-to-left readiness, or financial terminology.
---

# i18n Localization Skill

## Purpose

This skill covers **internationalization and localization patterns** for Finance across shared KMP strings, platform resource files, web locale packs, and locale-aware financial formatting.

## Out of Scope

- Money arithmetic and cents parsing → use `financial-modeling`.
- Design-token typography/color choices → use `design-tokens`.
- Accessibility testing of translated UI → use `accessibility-testing`.
- Marketing copy and app-store localization strategy → use `go-to-market`.

## Related Skills

| Skill                   | Use For                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `financial-modeling`    | Currency-safe calculations and export amount semantics      |
| `accessibility-testing` | Screen-reader labels, text expansion, and large text checks |
| `design-tokens`         | Typography tokens and locale-safe visual systems            |
| `ux-testing`            | Manual QA of localized flows and copy clarity               |

## Repo-Specific Paths

| Path                                                         | Purpose                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `packages/core/src/commonMain/kotlin/com/finance/core/i18n/` | Shared `Strings`, `StringProvider`, locale and number formatting |
| `apps/web/src/lib/i18n.ts` and `apps/web/src/lib/i18n/`      | Web locale packs and authoring helpers                           |
| `apps/android/src/main/res/values*/strings.xml`              | Android localized resources                                      |
| `apps/ios/Finance/Resources/*.lproj/Localizable.strings`     | iOS localized resources                                          |

## String Key Rules

- Add shared keys to `Strings.kt` when the concept is cross-platform or shared domain terminology.
- Keep keys semantic (`transaction.status.cleared`), not layout-specific (`button.greenText`).
- Preserve placeholders across all locale packs; document argument order and meaning.
- Avoid concatenating translated fragments; use complete format strings for sentences.
- Financial terms must be consistent across import/export, sync errors, reports, and settings.

## Financial Formatting Rules

- Store money as cents and currency code; localize only at display/export boundaries.
- Use locale-aware decimal separators, grouping, currency placement, and negative amount patterns.
- Avoid assuming USD, `MM/DD/YYYY`, 12-hour time, or English plural forms.
- Test long currency names, narrow symbols, and right-to-left text direction where layout can wrap.

## Localization Review Checklist

1. Every visible string has a key or platform resource entry.
2. Validation and error messages include recovery guidance, not just generic failure text.
3. Dates, currencies, percentages, and account balances use locale-aware formatting utilities.
4. Text expansion does not hide critical financial digits, action buttons, or legal/privacy copy.
5. Exported data uses stable schemas and ISO dates; localized display strings are explicit where required.
