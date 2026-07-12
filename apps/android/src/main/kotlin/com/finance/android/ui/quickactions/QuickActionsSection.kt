// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.BusinessCenter
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Celebration
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.EventNote
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Predictive quick-actions section for the app home (#2396).
 *
 * Surfaces the user's most likely finance tasks as a horizontally scrolling row
 * of one-tap cards. This is **additive** — it never replaces or gates the
 * bottom-bar / drawer navigation, so manual navigation is fully preserved.
 *
 * Each card exposes an overflow menu to pin, dismiss, or disable the action,
 * satisfying the user-control acceptance criterion. Every interactive element
 * carries a [contentDescription] for TalkBack.
 *
 * @param onNavigate Invoked with a `FinanceNavHost` route when a card is tapped.
 */
@Composable
fun QuickActionsSection(
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: QuickActionsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isLoading || state.actions.isEmpty()) return

    QuickActionsContent(
        actions = state.actions,
        onActivate = { action, position ->
            viewModel.onActivated(action, position)
            onNavigate(action.type.route)
        },
        onPinToggle = { action -> viewModel.setPinned(action.type, !action.pinned) },
        onDismiss = { action -> viewModel.dismiss(action.type) },
        onDisable = { action -> viewModel.disable(action.type) },
        modifier = modifier,
    )
}

@Composable
internal fun QuickActionsContent(
    actions: List<RankedQuickAction>,
    onActivate: (RankedQuickAction, Int) -> Unit,
    onPinToggle: (RankedQuickAction) -> Unit,
    onDismiss: (RankedQuickAction) -> Unit,
    onDisable: (RankedQuickAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Quick actions",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Predictive quick actions section"
            },
        )
        Spacer(Modifier.size(8.dp))
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 2.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(actions, key = { it.type.id }) { action ->
                val position = actions.indexOf(action)
                QuickActionCard(
                    action = action,
                    onActivate = { onActivate(action, position) },
                    onPinToggle = { onPinToggle(action) },
                    onDismiss = { onDismiss(action) },
                    onDisable = { onDisable(action) },
                )
            }
        }
    }
}

@Composable
private fun QuickActionCard(
    action: RankedQuickAction,
    onActivate: () -> Unit,
    onPinToggle: () -> Unit,
    onDismiss: () -> Unit,
    onDisable: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    val pinnedSuffix = if (action.pinned) ", pinned" else ""

    ElevatedCard(
        onClick = onActivate,
        modifier = Modifier
            .width(150.dp)
            .semantics { contentDescription = action.type.contentDescription + pinnedSuffix },
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 12.dp, top = 8.dp, end = 4.dp),
        ) {
            Icon(
                imageVector = iconFor(action.type),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.weight(1f))
            Box {
                IconButton(
                    onClick = { menuExpanded = true },
                    modifier = Modifier.semantics {
                        contentDescription = "More options for ${action.type.label}"
                    },
                ) {
                    Icon(Icons.Filled.MoreVert, contentDescription = null)
                }
                QuickActionMenu(
                    expanded = menuExpanded,
                    pinned = action.pinned,
                    onDismissMenu = { menuExpanded = false },
                    onPinToggle = { menuExpanded = false; onPinToggle() },
                    onDismiss = { menuExpanded = false; onDismiss() },
                    onDisable = { menuExpanded = false; onDisable() },
                )
            }
        }
        Text(
            text = action.type.label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
        )
    }
}

@Composable
private fun QuickActionMenu(
    expanded: Boolean,
    pinned: Boolean,
    onDismissMenu: () -> Unit,
    onPinToggle: () -> Unit,
    onDismiss: () -> Unit,
    onDisable: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismissMenu) {
        DropdownMenuItem(
            text = { Text(if (pinned) "Unpin" else "Pin") },
            onClick = onPinToggle,
            leadingIcon = {
                Icon(
                    Icons.Filled.PushPin,
                    contentDescription = if (pinned) "Unpin action" else "Pin action",
                )
            },
        )
        DropdownMenuItem(
            text = { Text("Dismiss") },
            onClick = onDismiss,
            leadingIcon = {
                Icon(Icons.Filled.Close, contentDescription = "Dismiss action for now")
            },
        )
        DropdownMenuItem(
            text = { Text("Don't suggest") },
            onClick = onDisable,
            leadingIcon = {
                Icon(Icons.Filled.VisibilityOff, contentDescription = "Stop suggesting this action")
            },
        )
    }
}

/** Resolves the Material icon for a [QuickActionType]. */
private fun iconFor(type: QuickActionType): ImageVector = when (type) {
    QuickActionType.ADD_EXPENSE -> Icons.Filled.Add
    QuickActionType.REVIEW_IMPORTS -> Icons.Filled.Inbox
    QuickActionType.CHECK_BILLS -> Icons.Filled.EventNote
    QuickActionType.ADD_INCOME -> Icons.Filled.AttachMoney
    QuickActionType.VIEW_BUDGETS -> Icons.Filled.PieChart
    QuickActionType.VIEW_INSIGHTS -> Icons.Filled.Insights
    QuickActionType.GIG_TOOLS -> Icons.Filled.DirectionsCar
    QuickActionType.COUPLE_SPACE -> Icons.Filled.Favorite
    QuickActionType.ACHIEVEMENTS -> Icons.Filled.EmojiEvents
    QuickActionType.QUICK_EXPENSE -> Icons.Filled.Bolt
    QuickActionType.SCAN_RECEIPT -> Icons.Filled.ReceiptLong
    QuickActionType.BUSINESS_MONEY -> Icons.Filled.BusinessCenter
    QuickActionType.CASH_FORECAST -> Icons.Filled.CalendarMonth
    QuickActionType.FOOD_TRUCK_PNL -> Icons.Filled.Assessment
    QuickActionType.SHARE_WIN -> Icons.Filled.Celebration
}

@Preview(showBackground = true)
@Composable
private fun QuickActionsPreview() {
    FinanceTheme {
        QuickActionsContent(
            actions = listOf(
                RankedQuickAction(QuickActionType.ADD_EXPENSE, 1.4, pinned = true, RankReason.PINNED),
                RankedQuickAction(QuickActionType.REVIEW_IMPORTS, 1.2, false, RankReason.PENDING_IMPORTS),
                RankedQuickAction(QuickActionType.CHECK_BILLS, 0.9, false, RankReason.UPCOMING_BILLS),
            ),
            onActivate = { _, _ -> },
            onPinToggle = {},
            onDismiss = {},
            onDisable = {},
            modifier = Modifier.padding(16.dp),
        )
    }
}
