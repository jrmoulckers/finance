// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.tips

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.tips.FinancialTip
import com.finance.core.tips.TipCategory
import com.finance.core.tips.TipPriority
import org.koin.compose.viewmodel.koinViewModel

/**
 * Dashboard tips section showing contextual financial tips (#320).
 *
 * Displays a horizontally scrolling row of tip cards. High-priority
 * tips are emphasized with accent colors. Each card is dismissible.
 *
 * Fully accessible: TalkBack announces tip content, dismiss button
 * has clear content description.
 */
@Composable
fun TipsSection(
    modifier: Modifier = Modifier,
    viewModel: TipsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    TipsSectionContent(
        tips = state.visibleTips,
        isLoading = state.isLoading,
        onDismiss = viewModel::dismissTip,
        modifier = modifier,
    )
}

@Composable
internal fun TipsSectionContent(
    tips: List<FinancialTip>,
    isLoading: Boolean,
    onDismiss: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (isLoading || tips.isEmpty()) return

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Financial Tips",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Financial Tips section"
            },
        )
        Spacer(Modifier.height(8.dp))
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 4.dp),
        ) {
            items(tips, key = { it.id }) { tip ->
                AnimatedVisibility(
                    visible = true,
                    enter = fadeIn() + slideInVertically(),
                    exit = fadeOut() + slideOutVertically(),
                ) {
                    TipCard(
                        tip = tip,
                        onDismiss = { onDismiss(tip.id) },
                    )
                }
            }
        }
    }
}

/**
 * Individual tip card displaying a financial insight.
 *
 * High-priority tips use error container colors to draw attention.
 * Medium-priority tips use tertiary container. Low-priority tips
 * use the default surface variant.
 */
@Composable
internal fun TipCard(
    tip: FinancialTip,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val containerColor = when (tip.priority) {
        TipPriority.HIGH -> MaterialTheme.colorScheme.errorContainer
        TipPriority.MEDIUM -> MaterialTheme.colorScheme.tertiaryContainer
        TipPriority.LOW -> MaterialTheme.colorScheme.surfaceVariant
    }
    val contentColor = when (tip.priority) {
        TipPriority.HIGH -> MaterialTheme.colorScheme.onErrorContainer
        TipPriority.MEDIUM -> MaterialTheme.colorScheme.onTertiaryContainer
        TipPriority.LOW -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val icon = tipCategoryIcon(tip.category)
    val priorityLabel = when (tip.priority) {
        TipPriority.HIGH -> "High priority"
        TipPriority.MEDIUM -> "Medium priority"
        TipPriority.LOW -> "Tip"
    }

    ElevatedCard(
        modifier = modifier
            .width(280.dp)
            .semantics {
                contentDescription = "$priorityLabel: ${tip.title}. ${tip.description}"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = containerColor,
        ),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = contentColor,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = tip.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = contentColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .size(32.dp)
                        .semantics {
                            contentDescription = "Dismiss tip: ${tip.title}"
                        },
                ) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = null,
                        tint = contentColor.copy(alpha = 0.6f),
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = tip.description,
                style = MaterialTheme.typography.bodySmall,
                color = contentColor.copy(alpha = 0.85f),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = tipCategoryLabel(tip.category),
                style = MaterialTheme.typography.labelSmall,
                color = contentColor.copy(alpha = 0.5f),
            )
        }
    }
}

/** Map tip categories to Material Icons. */
private fun tipCategoryIcon(category: TipCategory): ImageVector = when (category) {
    TipCategory.BUDGET -> Icons.Filled.PieChart
    TipCategory.SPENDING -> Icons.Filled.ShoppingCart
    TipCategory.SAVINGS -> Icons.Filled.Savings
    TipCategory.INCOME -> Icons.Filled.TrendingUp
    TipCategory.GENERAL -> Icons.Filled.Lightbulb
}

/** Human-readable labels for tip categories. */
private fun tipCategoryLabel(category: TipCategory): String = when (category) {
    TipCategory.BUDGET -> "Budget"
    TipCategory.SPENDING -> "Spending"
    TipCategory.SAVINGS -> "Savings"
    TipCategory.INCOME -> "Income"
    TipCategory.GENERAL -> "General"
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "Tips Section - Light")
@Preview(
    showBackground = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Tips Section - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun TipsSectionPreview() {
    FinanceTheme(dynamicColor = false) {
        TipsSectionContent(
            tips = listOf(
                FinancialTip(
                    id = "budget-over-1",
                    title = "Budget exceeded: Dining",
                    description = "You've spent \$380 of your \$300 Dining budget. Consider adjusting spending.",
                    category = TipCategory.BUDGET,
                    priority = TipPriority.HIGH,
                    actionHint = "navigate:budgets",
                ),
                FinancialTip(
                    id = "goal-almost-1",
                    title = "Almost there: Vacation",
                    description = "You're 92% toward your Vacation goal! Just \$160 to go.",
                    category = TipCategory.SAVINGS,
                    priority = TipPriority.MEDIUM,
                    actionHint = "navigate:goals",
                ),
                FinancialTip(
                    id = "savings-streak-3",
                    title = "Great savings streak!",
                    description = "You've had positive cash flow for 3 consecutive months.",
                    category = TipCategory.SAVINGS,
                    priority = TipPriority.LOW,
                ),
            ),
            isLoading = false,
            onDismiss = {},
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Tip Card - High Priority")
@Composable
private fun TipCardHighPreview() {
    FinanceTheme(dynamicColor = false) {
        TipCard(
            tip = FinancialTip(
                id = "low-savings-rate",
                title = "Savings rate needs attention",
                description = "Your savings rate this month is 3%. Experts recommend 10-20%.",
                category = TipCategory.SAVINGS,
                priority = TipPriority.HIGH,
            ),
            onDismiss = {},
            modifier = Modifier.padding(16.dp),
        )
    }
}
