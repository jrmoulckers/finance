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
 * Goal Progress widget — Glance API home screen widget (#381).
 *
 * Displays a compact view of the user's top savings goal with
 * progress percentage and remaining amount.
 *
 * ## Features
 * - Material You dynamic theming on Android 12+
 * - Adapts to light/dark system theme
 * - Accessible with contentDescription for TalkBack
 * - Rounded corners following Material 3 widget guidelines
 *
 * ## Size
 * Minimum: 2×2 cells (110×110 dp)
 * Recommended: 3×2 cells for best readability
 *
 * @see GoalProgressWidgetReceiver for the BroadcastReceiver entry point
 */
class GoalProgressWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Timber.d("Providing glance content for GoalProgressWidget (id=%s)", id)

        // TODO: Read real data from repository once wired.
        val widgetData = WidgetGoalData(
            goalName = "No goals yet",
            currentFormatted = "$0.00",
            targetFormatted = "$0.00",
            remainingFormatted = "$0.00",
            progressPercent = 0,
            totalGoals = 0,
            lastUpdated = "Just now",
        )

        provideContent {
            FinanceGlanceTheme {
                GoalProgressContent(data = widgetData)
            }
        }
    }
}

/**
 * Data class holding pre-formatted goal widget display values.
 *
 * @property goalName Name of the primary (most advanced) goal.
 * @property currentFormatted Formatted current savings amount.
 * @property targetFormatted Formatted target savings amount.
 * @property remainingFormatted Formatted remaining amount to goal.
 * @property progressPercent Progress percentage (0–100).
 * @property totalGoals Total number of active goals.
 * @property lastUpdated Human-readable last-update timestamp.
 */
data class WidgetGoalData(
    val goalName: String,
    val currentFormatted: String,
    val targetFormatted: String,
    val remainingFormatted: String,
    val progressPercent: Int,
    val totalGoals: Int,
    val lastUpdated: String,
)

/**
 * Goal progress widget content layout.
 *
 * ```
 * ┌─────────────────────────────┐
 * │ Savings Goals               │
 * │                             │
 * │ Vacation Fund               │
 * │ ████████░░░░  67%           │
 * │                             │
 * │ $6,700 of $10,000           │
 * │ $3,300 remaining            │
 * │                             │
 * │ 3 active goals              │
 * │ Updated: Just now           │
 * └─────────────────────────────┘
 * ```
 */
@Composable
private fun GoalProgressContent(data: WidgetGoalData) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(GlanceTheme.colors.surface)
            .clickable(actionStartActivity<MainActivity>())
            .semantics {
                contentDescription = "Savings goals widget. " +
                    "${data.goalName}: ${data.progressPercent}% complete. " +
                    "${data.currentFormatted} of ${data.targetFormatted}. " +
                    "${data.remainingFormatted} remaining. " +
                    "${data.totalGoals} active goals. Tap to open Finance."
            },
    ) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(16.dp),
        ) {
            // Title
            Text(
                text = "Savings Goals",
                style = TextStyle(
                    color = GlanceTheme.colors.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )

            Spacer(modifier = GlanceModifier.height(12.dp))

            // Goal name
            Text(
                text = data.goalName,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )

            Spacer(modifier = GlanceModifier.height(8.dp))

            // Progress bar (text-based for Glance compatibility)
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val filled = (data.progressPercent / 10).coerceIn(0, 10)
                val empty = 10 - filled
                Text(
                    text = "█".repeat(filled) + "░".repeat(empty),
                    style = TextStyle(
                        color = GlanceTheme.colors.primary,
                        fontSize = 14.sp,
                    ),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                Text(
                    text = "${data.progressPercent}%",
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurface,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }

            Spacer(modifier = GlanceModifier.height(8.dp))

            // Current / target
            Text(
                text = "${data.currentFormatted} of ${data.targetFormatted}",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 13.sp,
                ),
            )

            Spacer(modifier = GlanceModifier.height(4.dp))

            // Remaining
            Text(
                text = "${data.remainingFormatted} remaining",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 12.sp,
                ),
            )

            Spacer(modifier = GlanceModifier.defaultWeight())

            // Total goals and update
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
            ) {
                Text(
                    text = "${data.totalGoals} active goal${if (data.totalGoals != 1) "s" else ""}",
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 10.sp,
                    ),
                )
                Spacer(modifier = GlanceModifier.defaultWeight())
                Text(
                    text = data.lastUpdated,
                    style = TextStyle(
                        color = GlanceTheme.colors.outline,
                        fontSize = 10.sp,
                    ),
                )
            }
        }
    }
}

/**
 * BroadcastReceiver entry point for the Goal Progress widget.
 */
class GoalProgressWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GoalProgressWidget()
}
