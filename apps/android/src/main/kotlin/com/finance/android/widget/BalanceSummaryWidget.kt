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
 * Account Balance Summary widget — Glance API home screen widget (#381).
 *
 * Displays the user's net worth, account count, and today's spending at a
 * glance. Tapping the widget launches the Finance app to the Dashboard.
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
 * Widget reads from the shared repository layer via Koin DI. Data is
 * refreshed on widget update intervals and when the app triggers a sync.
 *
 * @see BalanceSummaryWidgetReceiver for the BroadcastReceiver entry point
 */
class BalanceSummaryWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Timber.d("Providing glance content for BalanceSummaryWidget (id=%s)", id)

        // TODO: Read real data from repository once SQLDelight is wired.
        // For now, use placeholder data to validate the widget layout.
        val widgetData = WidgetBalanceData(
            netWorth = "$0.00",
            todaySpending = "$0.00",
            accountCount = 0,
            lastUpdated = "Just now",
        )

        provideContent {
            FinanceGlanceTheme {
                BalanceSummaryContent(data = widgetData)
            }
        }
    }
}

/**
 * Data class holding pre-formatted widget display values.
 *
 * All amounts are pre-formatted strings to avoid financial data processing
 * in the widget layer. Formatting is handled by [CurrencyFormatter] in the
 * repository/ViewModel layer.
 *
 * @property netWorth Formatted net worth string (e.g., "$12,345.67").
 * @property todaySpending Formatted today's spending (e.g., "$45.23").
 * @property accountCount Number of active accounts.
 * @property lastUpdated Human-readable last-update timestamp.
 */
data class WidgetBalanceData(
    val netWorth: String,
    val todaySpending: String,
    val accountCount: Int,
    val lastUpdated: String,
)

/**
 * Widget content layout following Material 3 widget design guidelines.
 *
 * Structure:
 * ```
 * ┌─────────────────────────────┐
 * │ Finance                     │
 * │                             │
 * │ Net Worth                   │
 * │ $12,345.67        (large)   │
 * │                             │
 * │ Today  -$45.23              │
 * │ 3 accounts                  │
 * │                             │
 * │ Updated: Just now           │
 * └─────────────────────────────┘
 * ```
 */
@Composable
private fun BalanceSummaryContent(data: WidgetBalanceData) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(GlanceTheme.colors.surface)
            .clickable(actionStartActivity<MainActivity>())
            .semantics {
                contentDescription = "Finance widget. Net worth: ${data.netWorth}. " +
                    "Today's spending: ${data.todaySpending}. " +
                    "${data.accountCount} accounts. Tap to open Finance."
            },
    ) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(16.dp),
        ) {
            // App title
            Text(
                text = "Finance",
                style = TextStyle(
                    color = GlanceTheme.colors.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )

            Spacer(modifier = GlanceModifier.height(12.dp))

            // Net Worth label
            Text(
                text = "Net Worth",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Normal,
                ),
            )

            Spacer(modifier = GlanceModifier.height(4.dp))

            // Net Worth amount (hero number)
            Text(
                text = data.netWorth,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )

            Spacer(modifier = GlanceModifier.height(12.dp))

            // Today's spending row
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Today",
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 12.sp,
                    ),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                Text(
                    text = data.todaySpending,
                    style = TextStyle(
                        color = GlanceTheme.colors.error,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                )
            }

            Spacer(modifier = GlanceModifier.height(4.dp))

            // Account count
            Text(
                text = "${data.accountCount} account${if (data.accountCount != 1) "s" else ""}",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 12.sp,
                ),
            )

            Spacer(modifier = GlanceModifier.defaultWeight())

            // Last updated timestamp
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
 * BroadcastReceiver entry point for the Balance Summary widget.
 *
 * Registered in AndroidManifest.xml with the `android.appwidget.action.APPWIDGET_UPDATE`
 * intent filter and the `balance_summary_widget_info.xml` metadata.
 */
class BalanceSummaryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BalanceSummaryWidget()
}
