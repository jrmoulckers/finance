# 300% / 400% large-text layout QA

Follow-up to #2274 (issue #2487). Responsive QA at 300% and 400% browser zoom
plus in-app large/huge text for navigation, modals, forms, the command palette,
chart summaries, bottom navigation, and focus indicators.

The matrix is executable in `src/lib/a11y/large-text-reflow.ts`
(`buildLargeTextSurfaceQaMatrix`) and asserted in
`src/lib/a11y/__tests__/large-text-reflow.test.ts`.

## Surfaces and expected reflow

At both 300% and 400% (viewport 1280px, effective scale ≥ 3) surfaces reflow as
follows. Dense surfaces switch to a card alternative with single-axis scroll;
the rest stack.

| Surface           | Expected mode    | Key checks                                                                   |
| ----------------- | ---------------- | ---------------------------------------------------------------------------- |
| Navigation        | stacked          | Collapses to single-column menu; labels not clipped; all targets reachable   |
| Modal             | stacked          | Stays in viewport; single-axis scroll; title/body/actions visible            |
| Form              | stacked          | Labels stay associated and above fields; nothing truncated or overlapped     |
| Command palette   | card-alternative | Result rows wrap to cards; active highlight + shortcut hints legible         |
| Chart summary     | card-alternative | Plain-language summary before chart; data-table alternative scrolls one axis |
| Bottom navigation | stacked          | Does not overlap content/keyboard; 44px minimum tap targets                  |
| Focus indicator   | stacked          | Focus ring fully visible/unclipped after reflow; focus order matches visuals |

## Results

- 14 cases (7 surfaces × {300%, 400%}) generated; dense surfaces (command
  palette, chart summary) resolve to `card-alternative`, all others to
  `stacked`, with effective scale ≥ 3 (green in CI).

## Intentional gaps / next steps

- The matrix asserts the shared reflow decision, not pixel-level rendering. A
  manual browser pass at 300%/400% zoom and in-app large/huge text should
  confirm no clipping/overlap on each surface and record browser/pass/fail here
  and in PR notes.
