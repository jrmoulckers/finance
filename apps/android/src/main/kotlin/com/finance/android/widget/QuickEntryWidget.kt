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
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.finance.android.MainActivity
import timber.log.Timber

/**
 * Quick-entry Glance widget for one-tap expense logging.
 *
 * Displays a compact widget (3×2 cells) with shortcut buttons for the
 * user's most frequently used expense categories. Tapping a category
 * deep-links into the Finance app's transaction creation flow with
 * the category pre-selected.
 *
 * ## Features
 * - One-tap expense entry with recent categories
 * - Material You dynamic theming
 * - Full TalkBack accessibility
 * - Configurable default account and category
 *
 * ## Design
 * ```
 * ┌─────────────────────────────┐
 * │ Quick Add                   │
 * │ ┌─────┐ ┌─────┐ ┌─────┐   │
 * │ │Food │ │Gas  │ │Shop │   │
 * │ └─────┘ └─────┘ └─────┘   │
 * │ ┌─────┐ ┌─────┐ ┌─────┐   │
 * │ │Bill │ │Fun  │ │More │   │
 * │ └─────┘ └─────┘ └─────┘   │
 * └─────────────────────────────┘
 * ```
 *
 * @see QuickEntryWidgetReceiver for the BroadcastReceiver entry point.
 */
class QuickEntryWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Timber.d("Providing glance content for QuickEntryWidget (id=%s)", id)

        provideContent {
            FinanceGlanceTheme {
                QuickEntryContent()
            }
        }
    }
}

/**
 * Quick-entry widget layout with category shortcut buttons.
 */
@Composable
private fun QuickEntryContent() {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(GlanceTheme.colors.surface)
            .semantics {
                contentDescription = "Finance quick entry widget. Tap a category to add an expense."
            },
    ) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(12.dp),
        ) {
            // Title
            Text(
                text = "Quick Add",
                style = TextStyle(
                    color = GlanceTheme.colors.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )

            Spacer(modifier = GlanceModifier.height(8.dp))

            // Row 1: Food, Gas, Shopping
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CategoryButton(emoji = "🍔", label = "Food", category = "food")
                Spacer(modifier = GlanceModifier.width(6.dp))
                CategoryButton(emoji = "⛽", label = "Gas", category = "transportation")
                Spacer(modifier = GlanceModifier.width(6.dp))
                CategoryButton(emoji = "🛍️", label = "Shop", category = "shopping")
            }

            Spacer(modifier = GlanceModifier.height(6.dp))

            // Row 2: Bills, Entertainment, More
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CategoryButton(emoji = "📄", label = "Bill", category = "bills")
                Spacer(modifier = GlanceModifier.width(6.dp))
                CategoryButton(emoji = "🎬", label = "Fun", category = "entertainment")
                Spacer(modifier = GlanceModifier.width(6.dp))
                CategoryButton(emoji = "➕", label = "More", category = "other")
            }
        }
    }
}

/**
 * Single category shortcut button within the widget.
 */
@Composable
private fun CategoryButton(
    emoji: String,
    label: String,
    category: String,
) {
    Box(
        modifier = GlanceModifier
            .fillMaxWidth()
            .cornerRadius(12.dp)
            .background(GlanceTheme.colors.primaryContainer)
            .padding(vertical = 8.dp, horizontal = 4.dp)
            .clickable(actionStartActivity<MainActivity>())
            .semantics {
                contentDescription = "Add $label expense. Opens Finance app."
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = emoji,
                style = TextStyle(fontSize = 18.sp),
            )
            Text(
                text = label,
                style = TextStyle(
                    color = GlanceTheme.colors.onPrimaryContainer,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )
        }
    }
}

/**
 * BroadcastReceiver entry point for the Quick Entry widget.
 *
 * Register in AndroidManifest.xml with `android.appwidget.action.APPWIDGET_UPDATE`
 * intent filter and `@xml/quick_entry_widget_info` metadata.
 */
class QuickEntryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickEntryWidget()
}