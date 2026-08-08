---
name: i18n-localization
description: >
  Internationalization and localization guidance. Use for topics related to
  i18n, localization, translations, locale packs, string keys, date/time/number
  formatting, pluralization, text expansion, right-to-left readiness, or
  locale-sensitive terminology.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# i18n Localization Skill

**Trigger:** new visible copy, translation review, locale-aware formatting, pluralization, text expansion, RTL readiness.
**Inputs:** target surfaces, platforms in scope, supported locales, source strings, screenshots or flows.
**Related:** `accessibility-testing` (localized labels/large text), `design-tokens` (typography/layout),
`ux-testing` (localized flow QA), `go-to-market` (store/launch copy).

## Out of scope

- Domain-specific calculations or storage semantics → use the relevant domain skill.
- Visual-token authoring and layout system changes → use `design-tokens`.
- Accessibility validation of localized UI → use `accessibility-testing`.
- Marketing positioning and app-store strategy → use `go-to-market`.

## Method

1. **Inventory strings** — identify all user-visible copy, notifications, validation errors, empty states, and legal/privacy text.
2. **Use semantic keys** — name by meaning (`settings.privacy.export`) rather than placement or style.
3. **Keep messages whole** — avoid concatenated fragments; use complete sentences with named placeholders.
4. **Preserve arguments** — document placeholder meaning, order, units, and formatting responsibility.
5. **Format by locale** — use locale-aware date, time, number, percentage, list, and measurement formatting.
6. **Stress layout** — test long translations, large text, bidirectional text, and narrow screens.
7. **Review tone** — keep recovery guidance clear and culturally neutral; avoid idioms where literal translation fails.

## Review checklist

| Area | Check |
| --- | --- |
| Coverage | Every visible string has a localization key or platform resource entry |
| Placeholders | Names and values are preserved in every locale |
| Formatting | Dates, times, numbers, percentages, and units use locale-aware utilities |
| Plurals | Counts use locale plural rules, not English-only branching |
| Layout | Long translations and large text do not hide critical values or actions |
| RTL | Mirroring, icons, ordering, and punctuation remain readable where applicable |
| Legal/privacy | Consent, export, deletion, and policy copy stays consistent across locales |

## Key rules

- Keep product names, feature names, and legally approved terms consistent.
- Do not localize stable machine-readable schemas unless the surface is explicitly display-only.
- Do not assume English word order, ASCII punctuation, USD, `MM/DD/YYYY`, 12-hour time, or left-to-right layout.
- File issues when source copy is ambiguous; poor source text creates poor translations.

## Safety

Do not invent regulated, legal, medical, or compliance wording for a locale. Flag it for qualified review and keep screenshots/data free of secrets or personal data.

## Output

A localization review or implementation plan with affected keys/resources, formatting notes, locale risks, and follow-up issues.