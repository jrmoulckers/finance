// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.widgets.AiSpendWidgetDisplay
import com.finance.desktop.widgets.AiWidgetAction
import com.finance.desktop.widgets.WidgetFreshness

/**
 * Glanceable AI "Today & Forecast" widget card for Compose Desktop.
 *
 * Renders the pre-formatted [AiSpendWidgetDisplay] — it performs no currency,
 * privacy, or freshness logic of its own. Sensitive amounts arrive already
 * masked when the app is locked.
 *
 * ## Accessibility
 *
 * - The whole card exposes a single merged Narrator description
 *   ([AiSpendWidgetDisplay.narratorSummary]) so Narrator reads a coherent
 *   sentence instead of fragmented labels.
 * - The status line is a [LiveRegionMode.Polite] live region so stale/offline
 *   transitions are announced.
 * - Deep-link controls expose [Role.Button] with action labels.
 *
 * @param display Formatted, privacy-aware widget content.
 * @param onAction Invoked with the chosen [AiWidgetAction] when a deep-link
 *   control is activated. The host resolves the `finance://` route.
 * @param onRefresh Invoked when the user requests a manual refresh.
 */
@Composable
fun AiSpendWidgetCard(
    display: AiSpendWidgetDisplay,
    onAction: (AiWidgetAction) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("ai-spend-widget-card")
            .semantics(mergeDescendants = true) {
                contentDescription = display.narratorSummary
            },
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = display.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                MetricColumn(
                    label = display.todaySpendLabel,
                    value = display.todaySpendValue,
                    actionLabel = display.todaySpendAction.label,
                    onClick = { onAction(display.todaySpendAction) },
                    testTag = "ai-widget-today-spend",
                )
                Spacer(Modifier.width(16.dp))
                MetricColumn(
                    label = display.predictedBalanceLabel,
                    value = display.predictedBalanceValue,
                    actionLabel = display.predictedBalanceAction.label,
                    onClick = { onAction(display.predictedBalanceAction) },
                    emphasizeRisk = display.isAtRisk && !display.isPrivacyHidden,
                    testTag = "ai-widget-predicted-balance",
                )
            }

            Spacer(Modifier.height(8.dp))
            Text(
                text = display.horizonCaption + " · " + display.confidenceCaption,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            display.statusMessage?.let { message ->
                Spacer(Modifier.height(8.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor(display.freshness, display.isAtRisk),
                    modifier = Modifier
                        .testTag("ai-widget-status")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = display.lastUpdatedCaption,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("ai-widget-last-updated"),
                )
                TextButton(
                    onClick = onRefresh,
                    modifier = Modifier
                        .testTag("ai-widget-refresh")
                        .semantics { role = Role.Button; contentDescription = "Refresh forecast" },
                ) {
                    Text("Refresh")
                }
            }

            if (display.isAtRisk) {
                Spacer(Modifier.height(4.dp))
                OutlinedButton(
                    onClick = { onAction(AiWidgetAction.REVIEW_BUDGETS) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("ai-widget-primary-action")
                        .semantics {
                            role = Role.Button
                            contentDescription = AiWidgetAction.REVIEW_BUDGETS.label
                        },
                ) {
                    Text(AiWidgetAction.REVIEW_BUDGETS.label)
                }
            }
        }
    }
}

@Composable
private fun MetricColumn(
    label: String,
    value: String,
    actionLabel: String,
    onClick: () -> Unit,
    testTag: String,
    emphasizeRisk: Boolean = false,
) {
    Column(modifier = Modifier.testTag(testTag)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(
            onClick = onClick,
            contentPadding = PaddingValues(0.dp),
            modifier = Modifier.semantics {
                role = Role.Button
                contentDescription = actionLabel
            },
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = if (emphasizeRisk) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
        }
    }
}

@Composable
private fun statusColor(freshness: WidgetFreshness, atRisk: Boolean) = when {
    atRisk -> MaterialTheme.colorScheme.error
    freshness == WidgetFreshness.STALE -> MaterialTheme.colorScheme.tertiary
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}
