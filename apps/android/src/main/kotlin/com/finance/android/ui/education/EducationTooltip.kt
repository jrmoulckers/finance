// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.education

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme

/**
 * Info icon button that shows a financial concept tooltip when tapped (#378).
 *
 * Place this next to any financial term or metric in the UI. When the user
 * taps the icon, the tooltip expands inline with a short explanation and
 * an optional "Learn More" expansion.
 *
 * ## Accessibility
 * - Icon has a descriptive contentDescription for TalkBack
 * - Tooltip text is announced when expanded
 * - "Learn More" is a TextButton for keyboard/switch navigation
 *
 * @param concept The [FinancialConcept] to explain.
 * @param modifier Modifier for the icon button.
 */
@Composable
fun InfoTooltipIcon(
    concept: FinancialConcept,
    modifier: Modifier = Modifier,
) {
    val info = remember(concept) { FinancialConceptContent.infoFor(concept) }
    var showTooltip by rememberSaveable { mutableStateOf(false) }

    Column(modifier = modifier) {
        IconButton(
            onClick = { showTooltip = !showTooltip },
            modifier = Modifier.semantics {
                contentDescription = "Learn about ${info.title}. Tap to ${if (showTooltip) "hide" else "show"} explanation."
            },
        ) {
            Icon(
                Icons.Filled.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }

        AnimatedVisibility(
            visible = showTooltip,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            EducationTooltipCard(info = info, onDismiss = { showTooltip = false })
        }
    }
}

/**
 * Inline info label that displays a financial concept name with a tap-to-learn
 * interaction (#378).
 *
 * Shows the concept title as a clickable text label. Tapping reveals the
 * tooltip card below.
 *
 * @param concept The [FinancialConcept] to explain.
 * @param modifier Modifier applied to the entire column.
 */
@Composable
fun InfoTooltipLabel(
    concept: FinancialConcept,
    modifier: Modifier = Modifier,
) {
    val info = remember(concept) { FinancialConceptContent.infoFor(concept) }
    var showTooltip by rememberSaveable { mutableStateOf(false) }

    Column(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable { showTooltip = !showTooltip }
                .semantics {
                    contentDescription = "${info.title}. Tap to learn more about this concept."
                },
        ) {
            Text(
                text = info.title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(4.dp))
            Icon(
                Icons.Filled.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(14.dp),
            )
        }

        AnimatedVisibility(
            visible = showTooltip,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            EducationTooltipCard(
                info = info,
                onDismiss = { showTooltip = false },
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/**
 * Education tooltip card that displays concept information (#378).
 *
 * Shows a short description with an expandable "Learn More" section.
 * Designed to be used within [InfoTooltipIcon] or [InfoTooltipLabel].
 *
 * @param info The [ConceptInfo] to display.
 * @param onDismiss Callback when the user dismisses the tooltip.
 * @param modifier Modifier for the card.
 */
@Composable
fun EducationTooltipCard(
    info: ConceptInfo,
    onDismiss: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var showLearnMore by rememberSaveable { mutableStateOf(false) }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${info.title}: ${info.shortDescription}"
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.MenuBook,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = info.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = info.shortDescription,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier.semantics {
                    contentDescription = info.shortDescription
                },
            )

            AnimatedVisibility(
                visible = showLearnMore,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Text(
                    text = info.learnMoreText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.8f),
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .semantics {
                            contentDescription = info.learnMoreText
                        },
                )
            }

            Row {
                TextButton(
                    onClick = { showLearnMore = !showLearnMore },
                    modifier = Modifier.semantics {
                        contentDescription = if (showLearnMore) "Show less about ${info.title}" else "Learn more about ${info.title}"
                    },
                ) {
                    Text(if (showLearnMore) "Show Less" else "Learn More")
                }
                Spacer(Modifier.weight(1f))
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.semantics {
                        contentDescription = "Dismiss ${info.title} tooltip"
                    },
                ) {
                    Text("Dismiss")
                }
            }
        }
    }
}

// ── Previews ────────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "InfoTooltipIcon - Light")
@Composable
private fun InfoTooltipIconPreview() {
    FinanceTheme(dynamicColor = false) {
        InfoTooltipIcon(
            concept = FinancialConcept.NET_WORTH,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "InfoTooltipLabel - Light")
@Composable
private fun InfoTooltipLabelPreview() {
    FinanceTheme(dynamicColor = false) {
        InfoTooltipLabel(
            concept = FinancialConcept.BUDGET_UTILIZATION,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "EducationTooltipCard - Light")
@Composable
private fun EducationTooltipCardPreview() {
    FinanceTheme(dynamicColor = false) {
        EducationTooltipCard(
            info = FinancialConceptContent.infoFor(FinancialConcept.COMPOUND_INTEREST),
            modifier = Modifier.padding(16.dp),
        )
    }
}
