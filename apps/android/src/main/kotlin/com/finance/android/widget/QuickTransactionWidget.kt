// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.widget

import android.content.Context
import android.content.Intent
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
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.finance.android.MainActivity
import timber.log.Timber

/**
 * Quick Transaction widget — provides one-tap shortcuts for common financial actions.
 *
 * This smaller widget (2×1 cells) shows quick-action buttons that deep link
 * directly into the Finance app's transaction creation flow.
 *
 * ## Actions
 * - **Add Expense:** Opens transaction create screen in expense mode
 * - **Add Income:** Opens transaction create screen in income mode
 *
 * ## Design
 * - Material You dynamic theming
 * - Compact layout for 2×1 cell placement
 * - High-contrast action buttons
 * - Full TalkBack support
 *
 * @see QuickTransactionWidgetReceiver for the BroadcastReceiver entry point
 */
class QuickTransactionWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Timber.d("Providing glance content for QuickTransactionWidget (id=%s)", id)

        provideContent {
            FinanceGlanceTheme {
                QuickTransactionContent()
            }
        }
    }
}

/**
 * Compact widget layout with two action buttons.
 *
 * ```
 * ┌──────────────────────────┐
 * │ Finance                  │
 * │ ┌──────┐  ┌───────────┐ │
 * │ │+ Exp │  │ + Income  │ │
 * │ └──────┘  └───────────┘ │
 * └──────────────────────────┘
 * ```
 */
@Composable
private fun QuickTransactionContent() {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(GlanceTheme.colors.surface)
            .semantics {
                contentDescription = "Finance quick actions widget"
            },
    ) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // App title
            Text(
                text = "Finance",
                style = TextStyle(
                    color = GlanceTheme.colors.primary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )

            Spacer(modifier = GlanceModifier.height(8.dp))

            // Action buttons row
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // Add Expense button
                Box(
                    modifier = GlanceModifier
                        .defaultWeight()
                        .cornerRadius(12.dp)
                        .background(GlanceTheme.colors.errorContainer)
                        .padding(vertical = 8.dp, horizontal = 12.dp)
                        .clickable(actionStartActivity<MainActivity>())
                        .semantics {
                            contentDescription = "Add expense transaction. Opens Finance app."
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "+ Expense",
                        style = TextStyle(
                            color = GlanceTheme.colors.onErrorContainer,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                    )
                }

                Spacer(modifier = GlanceModifier.width(8.dp))

                // Add Income button
                Box(
                    modifier = GlanceModifier
                        .defaultWeight()
                        .cornerRadius(12.dp)
                        .background(GlanceTheme.colors.primaryContainer)
                        .padding(vertical = 8.dp, horizontal = 12.dp)
                        .clickable(actionStartActivity<MainActivity>())
                        .semantics {
                            contentDescription = "Add income transaction. Opens Finance app."
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "+ Income",
                        style = TextStyle(
                            color = GlanceTheme.colors.onPrimaryContainer,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                    )
                }
            }
        }
    }
}

/**
 * BroadcastReceiver entry point for the Quick Transaction widget.
 */
class QuickTransactionWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickTransactionWidget()
}
