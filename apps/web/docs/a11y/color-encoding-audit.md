# Color-only encoding audit (WCAG SC 1.4.1 Use of Color)

Scope: shared money/value components and chart legends where financial sign
(income vs. expense, gains vs. losses) or series identity could be conveyed by
colour alone. Tracks issue #3623.

SC 1.4.1 (Level A) requires that colour is never the **only** visual means of
conveying information. For every place we add red/green or a category palette,
there must be a redundant non-colour cue (text, sign, icon, or pattern).

## Amounts

| Surface / component                                        | Colour cue                                                    | Non-colour cue present? | Notes                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CurrencyDisplay` (default format)                         | `amount--positive` / `amount--negative` classes + user colour | ✅                      | Negative amounts render a leading `-`; positive amounts have no minus. The presence/absence of the minus sign distinguishes sign without colour.                                                |
| `CurrencyDisplay` (`negativeFormat: 'parentheses'`)        | red                                                           | ✅                      | Negative amounts are wrapped in `( … )`.                                                                                                                                                        |
| `CurrencyDisplay` (`negativeFormat: 'color-only'`, legacy) | red                                                           | ✅                      | Rendered with an explicit "Negative …" text prefix (`currency.display.negativeCue`) so colour is never the sole cue.                                                                            |
| `CurrencyDisplay` (`showSign`)                             | red/green                                                     | ✅                      | Signed deltas (net worth change, income-vs-expense net, transaction summary net) pass `showSign`, forcing an explicit `+`/`-`.                                                                  |
| `CurrencyDisplay` accessible label                         | —                                                             | ✅                      | `formatCurrencyForScreenReader` always announces "negative" for negatives regardless of the visible format.                                                                                     |
| `AmountDisplay`                                            | optional `amount--positive/negative`                          | ✅                      | Decorative visual layer (`aria-hidden`); the signed numeric string it renders already carries the `-`/`+` produced by the caller, and the accessible name is provided by the labelled ancestor. |

**Conclusion:** amounts already satisfy SC 1.4.1. The leading minus (or
parentheses / "Negative" text) is the redundant sign cue; `showSign` is used at
delta call sites where an explicit `+` improves clarity. No colour-only sign
encoding remains.

## Chart legends & series

| Chart                                   | Colour cue                  | Non-colour cue present? | Notes                                                                                                                                            |
| --------------------------------------- | --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CategoryPieChart`                      | slice fill / legend swatch  | ✅                      | Legend pairs each `aria-hidden` swatch with a visible category **name** and **value**; slices expose `aria-label`s and an accessible data table. |
| `BudgetDonutChart`                      | slice fill                  | ✅                      | Focusable slices expose `name: value (percent)` labels plus a data-table fallback; centre label is text.                                         |
| `SpendingBarChart`                      | bar fill (CVD-safe palette) | ✅                      | Category **name** labels + accessible data table; palette chosen for colour-vision deficiency.                                                   |
| Status badges (`Badge`, toast variants) | variant colour              | ✅                      | Variants render text/icon content; colour is decorative reinforcement.                                                                           |

**Conclusion:** every audited chart pairs its colour with a text label and an
accessible data-table / `aria-label` fallback. No legend relies on colour alone.

## Follow-ups (tracked separately)

- Manual colour-vision-deficiency (CVD) pass with a simulator across dark / OLED
  / high-contrast themes to confirm palette distinctness (visual-only, no code
  change expected).
- If future category palettes exceed ~8 series, add pattern fills in addition to
  colour + text for extra redundancy.
