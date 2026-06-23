// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

// =============================================================================
// DashboardNarrator — the complete on-device dashboard narration for #2394
// =============================================================================
//
// A Windows screen-reader user opening the dashboard should hear ONE coherent
// announcement that covers the three things #2394 calls out: states, trends, and
// anomalies. This narrator composes the two deterministic template layers into
// that single [Narration]:
//
//   * [TemplateNarrationGenerator] — steady-state facts (#2707): the headline,
//     budgets needing attention, the net-worth trend, and goals.
//   * [AnomalyNarrator] — notable deltas (signals) the template layer ignores.
//
// Composition is pure and reproducible (no model, no network, no I/O). The
// ordering keeps every material fact first and every confidence/uncertainty note
// last, so Narrator reads "here's what's true, here's what's worth a look, and
// here's how sure we are" in that order:
//
//   headline
//   → steady-state material (budgets, trend, goals)
//   → anomaly material (most-material first)
//   → steady-state uncertainty (e.g. a short-window net-worth trend)
//   → anomaly uncertainty (low-confidence signals)
//
// The result is the shared [Narration] model, so the UI Automation projection
// (#2707) consumes it exactly as it already consumes a template narration — this
// class adds segments, never a new output shape.
class DashboardNarrator(
    private val stateGenerator: TemplateNarrationGenerator = TemplateNarrationGenerator(),
    private val anomalyNarrator: AnomalyNarrator = AnomalyNarrator(),
) {

    // TODO(human): Validate the composed Narration on Windows hardware with
    //  Narrator running (Win+Ctrl+Enter) and the keyboard-only flow. The text
    //  and a11y metadata are unit-tested, but real spoken output + UI Automation
    //  exposure can only be confirmed on-device (see apps/windows/README.md →
    //  "AI accessibility narration of finances (#2394) → Needs Human Action").

    /** Builds the full dashboard [Narration] for [snapshot] in the given [mode]. */
    fun generate(
        snapshot: FinancialStateSnapshot,
        mode: NarrationMode,
    ): Narration {
        val base = stateGenerator.generate(snapshot, mode)
        val (baseMaterial, baseUncertainty) =
            base.segments.partition { it.kind != SegmentKind.UNCERTAINTY }

        val anomalyMaterial = anomalyNarrator.materialSegments(snapshot.signals, mode)
        val anomalyUncertainty =
            if (mode == NarrationMode.DETAILED) {
                anomalyNarrator.uncertaintySegments(snapshot.signals, anomalyMaterial)
            } else {
                emptyList()
            }

        val segments =
            baseMaterial + anomalyMaterial + baseUncertainty + anomalyUncertainty

        return base.copy(segments = segments)
    }
}
