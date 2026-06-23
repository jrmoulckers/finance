// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components

import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import com.finance.desktop.accessibility.NarrationLiveRegion
import com.finance.desktop.accessibility.narrationLiveRegion
import com.finance.desktop.accessibility.narrationReplayShortcut
import com.finance.desktop.accessibility.narrationSemantics
import com.finance.desktop.accessibility.rememberNarrationAnnouncer
import com.finance.desktop.accessibility.toSemanticsDescriptor
import com.finance.desktop.narration.Narration
import com.finance.desktop.narration.screenReaderText
import com.finance.desktop.theme.FinanceDesktopTheme

// =============================================================================
// NarratedChart — chart surface scaffold with Narrator/UIA semantics
// =============================================================================
//
// Wraps a Canvas chart so it is exposed to Narrator and UI Automation as a
// single labelled summary node (from the deterministic [Narration]) plus:
//   * a polite live region that re-announces on data change and on replay,
//   * a keyboard "request / replay narration" path (Alt+R) on the focused panel,
//   * a "View as table" toggle that swaps the pixel chart for a focusable table
//     (the keyboard/Narrator path to per-point detail, WCAG 1.1.1).
//
// See `docs/windows/ultrawide-portfolio-cockpit-layout.md` §7 and the validation
// checklist `docs/windows/chart-narration-validation-checklist.md`.

/**
 * Renders [chart], exposing [narration] as a merged summary node, with a live
 * region, an Alt+R replay shortcut, and a "View as table" toggle that swaps in
 * [table].
 *
 * @param narration deterministic narration for this chart surface.
 * @param panelTestTag stable UI Automation test tag, e.g. "cockpit.panel.performance".
 * @param table the focusable data-table alternative (per-point detail).
 * @param chart the visual Canvas chart.
 */
@Composable
fun NarratedChart(
    narration: Narration,
    panelTestTag: String,
    modifier: Modifier = Modifier,
    table: @Composable () -> Unit,
    chart: @Composable () -> Unit,
) {
    var showTable by remember { mutableStateOf(false) }
    val announcer = rememberNarrationAnnouncer()
    val summary = narration.screenReaderText()

    // Announce when the narration changes (e.g. range chip / data refresh).
    LaunchedEffect(summary) { announcer.announce(summary) }

    Column(
        modifier = modifier
            .focusable()
            .narrationReplayShortcut { announcer.announce(summary) }
            .semantics { testTag = panelTestTag },
    ) {
        if (showTable) {
            table()
        } else {
            // Merged chart-summary node: spoken label + heading (level 2) from
            // the narration's a11y metadata. Live-region politeness is delegated
            // to the dedicated announcer node below so a data change announces
            // exactly once (never twice).
            Box(
                modifier = Modifier.narrationSemantics(
                    narration.toSemanticsDescriptor().copy(liveRegion = NarrationLiveRegion.OFF),
                ),
            ) {
                chart()
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

        Row(verticalAlignment = Alignment.CenterVertically) {
            ViewAsTableToggle(showTable = showTable, onToggle = { showTable = !showTable })
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Alt+R replays narration",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = "Press Alt plus R to replay the chart narration"
                },
            )
        }

        // Visually minimal polite live region driven by the announcer.
        Box(
            modifier = Modifier
                .size(1.dp)
                .narrationLiveRegion(announcer.announcement),
        )
    }
}

/**
 * Toggle button that swaps a chart between its visual and data-table forms.
 *
 * Exposes a [Role.Button] name plus a [stateDescription] of "chart" / "table"
 * for UI Automation (WCAG 4.1.2), matching the cockpit layout spec §7.3.
 */
@Composable
fun ViewAsTableToggle(
    showTable: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = if (showTable) "View as chart" else "View as table"
    val state = if (showTable) "table" else "chart"
    TextButton(
        onClick = onToggle,
        modifier = modifier.semantics {
            role = Role.Button
            stateDescription = state
            contentDescription = label
        },
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}
