# Chart Narration — Narrator & Accessibility Insights Validation Checklist

Manual validation steps for the deterministic chart-narration slice (issue
[#2707], part of [#2394]). These checks run on a **Windows build** of the
desktop app and require a human with Narrator and
[Accessibility Insights for Windows][aiwin]. They complement the automated JVM
tests (`TemplateNarrationGeneratorTest`, `ChartNarratorTest`, `NarrationTextTest`)
that already pin the narration **content** in CI with no model present.

> Scope: this checklist validates the **template (deterministic)** narration and
> its UI Automation surfacing. The optional ML/abstractive narration and its
> on-hardware validation are tracked separately (see _Out of scope_).

## Surfaces under test

| Panel             | UIA test tag                | Source                                  |
| ----------------- | --------------------------- | --------------------------------------- |
| Performance chart | `cockpit.panel.performance` | `InvestmentScreen.PerformanceChartCard` |
| Allocation donut  | `cockpit.panel.allocation`  | `InvestmentScreen.AllocationChartCard`  |

Both panels render a Canvas chart wrapped in `NarratedChart`, which exposes a
single merged summary node, a polite live region, an `Alt+R` replay shortcut, and
a **View as table** toggle.

## 1. Narrator — start here

1. Start Narrator with **`Win` + `Ctrl` + `Enter`**.
2. Open the app and navigate to the **Investments** screen.
3. Tab to the **Performance** chart panel.

- [ ] Narrator announces the chart **summary** (e.g. _"Performance, one month.
      Portfolio rose from forty thousand dollars to forty-two thousand dollars,
      up 5.0 percent."_) rather than reading the raw Canvas or nothing.
- [ ] Money is spoken as **words** ("forty thousand dollars"), percentages keep
      digits and speak **"percent"** ("5.0 percent").
- [ ] The **Allocation** panel announces each slice with a spoken percentage
      ("US Stocks 56 percent, …").
- [ ] No alarmist or shaming words are spoken (never "overspent", "behind",
      "danger", "warning"; a maxed budget is "fully used").

## 2. Heading navigation

1. With Narrator on, press **`H`** / **`Shift` + `H`** to move between headings.

- [ ] Each chart panel's summary is reachable as a **heading (level 2)**. The
      heading is now projected from the narration's `A11yMetadata.headingLevel`
      via `Narration.toSemanticsDescriptor()` → `Modifier.narrationSemantics`, so
      a panel is a heading **only** when its narration says so.
- [ ] Heading order is logical top-to-bottom (Performance before Allocation,
      matching the visual order).

## 3. Keyboard replay (`Alt` + `R`)

1. Move keyboard focus onto a chart panel (Tab until it is focused).
2. Press **`Alt` + `R`**.

- [ ] The summary is **re-announced** by Narrator without moving focus.
- [ ] Repeated `Alt` + `R` presses re-announce each time (the zero-width replay
      nonce forces the live region to re-fire).
- [ ] `Alt` + `R` does **not** trigger any other action or collide with Narrator
      scan-mode quick keys.
- [ ] The on-screen hint "Alt+R replays narration" is present and is itself
      announced ("Press Alt plus R to replay the chart narration").

## 4. Live region on data change

1. Change the Performance **range** (e.g. 1W → 1M → 1Y) using the range chips.

- [ ] Narrator **politely** announces the updated summary after each change
      (it waits for a pause; it never interrupts mid-sentence).
- [ ] The announcement is never **assertive** for routine state.

## 5. "View as table" text alternative

1. Activate the **View as table** toggle on a chart panel.

- [ ] The toggle exposes a button **name** ("View as table" / "View as chart")
      and a **state** of "chart" / "table" to UI Automation.
- [ ] When toggled to a table, each row is keyboard-focusable and Narrator reads
      label + value (e.g. "Day 4, $42,000" / "US Stocks, 56 percent").
- [ ] Toggling back restores the chart and its merged summary node.

## 6. Accessibility Insights for Windows

1. Open **Accessibility Insights for Windows** and hover/inspect each panel.
2. Run **Live Inspect** and the **automated FastPass** checks.

- [ ] Each chart panel reports a **Name** equal to the narration summary.
- [ ] The summary node has the expected **ControlType / role** (status/heading)
      and **LiveSetting = Polite** on the live region.
- [ ] The **View as table** button reports `Name`, `ControlType = Button`, and a
      `LegacyIAccessible`/state description.
- [ ] FastPass reports **no errors** for the chart panels (no missing names, no
      keyboard traps).
- [ ] Tab order through the panel (chart → View-as-table → next panel) is logical
      and has no focus traps.

## 7. High contrast & scaling

1. Toggle a **High Contrast** theme (`Left Alt` + `Left Shift` + `Print Screen`).
2. Increase **text scaling** in Windows display settings (e.g. 150%, 200%).

- [ ] Narration text, the replay hint, and the toggle remain legible and are not
      clipped at high contrast.
- [ ] At larger scale factors the panels reflow without overlapping or losing the
      narration/toggle affordances.

## Needs Human Action

The narration → semantics mapping (labels, descriptions, **headings**, and
**live regions**) is now pinned by automated JVM tests
(`NarrationSemanticsTest`), but those tests cannot drive a real screen reader.
A human with a **Windows build** must still perform the device pass below and
tick the boxes in sections 1–7. This is the `// TODO(human)` referenced in
`apps/windows/.../accessibility/NarrationSemantics.kt`.

- [ ] Run sections **1–7** on a Windows build with Narrator + Accessibility
      Insights and confirm every box.
- [ ] Confirm the heading projected from `headingLevel = 2` is announced as a
      level-2 heading by Narrator (`H` / `Shift` + `H`).
- [ ] Confirm `Alt` + `R` re-announces the polite live region without moving
      focus and without double-speaking on a data change.
- [ ] Record the result (date, build, Windows/Narrator version) below.

> Device validation result: _pending_.

## Out of scope (tracked elsewhere)

- ML / abstractive narration (ONNX Runtime + DirectML) and its determinism /
  privacy validation — see `docs/windows/ml-narration-pipeline-design.md` §11.
- Recording on-hardware Narrator transcripts (`ml-transcripts/*`) once a
  license-cleared model and a Windows CI runner exist.
- Moving the narration contract types into shared `packages/core` commonMain
  (owned by @kmp-engineer).

[#2707]: https://github.com/jrmoulckers/finance/issues/2707
[#2394]: https://github.com/jrmoulckers/finance/issues/2394
[aiwin]: https://accessibilityinsights.io/docs/windows/overview/
