// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.finance.android.MainActivity
import timber.log.Timber

/**
 * Budget Summary widget — Glance API home screen widget (#381).
 *
 * Displays a compact budget health overview showing how many budgets
 * are on track, approaching limits, and over budget.
 *
 * ## Features
 * - Material You dynamic theming on Android 12+ (falls back to Finance palette)
 * - Adapts to light/dark system theme
 * - Accessible with contentDescription for TalkBack
 * - Rounded corners following Material 3 widget guidelines
 *
 * ## Size
 * Minimum: 2×2 cells (110×110 dp)
 * Recommended: 3×2 cells for best readability
 *
 * ## Data Flow
 * Widget reads from the shared repository layer. Data is refreshed
 * on widget update intervals and when the app triggers a sync.
 *
 * @see BudgetSummaryWidgetReceiver for the BroadcastReceiver entry point
 */
class BudgetSummaryWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Timber.d("Providing glance content for BudgetSummaryWidget (id=%s)", id)

        // TODO(#1296): Read real data from repository once wired.
        val widgetData = WidgetBudgetData(
            totalBudgets = 0,
            onTrack = 0,
            warning = 0,
            overBudget = 0,
            totalSpentFormatted = "$0.00",
            totalBudgetedFormatted = "$0.00",
            lastUpdated = "Just now",
        )

        provideContent {
            FinanceGlanceTheme {
                BudgetSummaryContent(data = widgetData)
            }
        }
    }
}

/**
 * Data class holding pre-formatted budget widget display values.
 *
 * @property totalBudgets Total number of active budgets.
 * @property onTrack Number of budgets within healthy spending.
 * @property warning Number of budgets approaching their limit.
 * @property overBudget Number of budgets that have exceeded their limit.
 * @property totalSpentFormatted Formatted total spent across all budgets.
 * @property totalBudgetedFormatted Formatted total budgeted across all budgets.
 * @property lastUpdated Human-readable last-update timestamp.
 */
data class WidgetBudgetData(
    val totalBudgets: Int,
    val onTrack: Int,
    val warning: Int,
    val overBudget: Int,
    val totalSpentFormatted: String,
    val totalBudgetedFormatted: String,
    val lastUpdated: String,
)

/**
 * Budget widget content layout.
 *
 * ```
 * ┌─────────────────────────────┐
 * │ Budget Health               │
 * │                             │
 * │ ✓ 3 on track               │
 * │ ⚠ 1 warning                │
 * │ ✗ 0 over budget            │
 * │                             │
 * │ $1,200 / $2,500             │
 * │ Updated: Just now           │
 * └─────────────────────────────┘
 * ```
 */
@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun BudgetSummaryContent(data: WidgetBudgetData) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(GlanceTheme.colors.surface)
            .clickable(actionStartActivity<MainActivity>())
            .semantics {
                contentDescription = "Budget health widget. " +
                    "${data.onTrack} on track, ${data.warning} warning, " +
                    "${data.overBudget} over budget. " +
                    "Spent ${data.totalSpentFormatted} of ${data.totalBudgetedFormatted}. " +
                    "Tap to open Finance."
            },
    ) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(16.dp),
        ) {
            // Title
            Text(
                text = "Budget Health",
                style = TextStyle(
                    color = GlanceTheme.colors.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )

            Spacer(modifier = GlanceModifier.height(12.dp))

            // On track
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "✓",
                    style = TextStyle(
                        color = GlanceTheme.colors.primary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                Text(
                    text = "${data.onTrack} on track",
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurface,
                        fontSize = 13.sp,
                    ),
                )
            }

            Spacer(modifier = GlanceModifier.height(4.dp))

            // Warning
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "⚠",
                    style = TextStyle(
                        color = GlanceTheme.colors.error,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                Text(
                    text = "${data.warning} warning",
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurface,
                        fontSize = 13.sp,
                    ),
                )
            }

            Spacer(modifier = GlanceModifier.height(4.dp))

            // Over budget
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "✗",
                    style = TextStyle(
                        color = GlanceTheme.colors.error,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                Text(
                    text = "${data.overBudget} over budget",
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurface,
                        fontSize = 13.sp,
                    ),
                )
            }

            Spacer(modifier = GlanceModifier.height(12.dp))

            // Totals
            Text(
                text = "${data.totalSpentFormatted} / ${data.totalBudgetedFormatted}",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )

            Spacer(modifier = GlanceModifier.defaultWeight())

            // Last updated
            Text(
                text = "Updated: ${data.lastUpdated}",
                style = TextStyle(
                    color = GlanceTheme.colors.outline,
                    fontSize = 10.sp,
                ),
            )
        }
    }
}

/**
 * BroadcastReceiver entry point for the Budget Summary widget.
 */
class BudgetSummaryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BudgetSummaryWidget()
}
