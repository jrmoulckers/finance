// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.models.Account

/**
 * Reorderable account list with drag and keyboard (Alt+Up/Down) support.
 * Narrator announces position and reorder instructions for accessibility.
 */
@Composable
fun DraggableAccountList(
    accounts: List<Account>,
    selectedId: String?,
    onSelect: (Account) -> Unit,
    onReorder: (List<Account>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val orderedAccounts = remember(accounts) { accounts.toMutableStateList() }
    var dragTargetIndex by remember { mutableStateOf<Int?>(null) }
    var focusedIndex by remember { mutableStateOf(0) }

    Column(modifier = modifier) {
        Text(
            text = "Accounts",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .padding(bottom = FinanceDesktopTheme.spacing.md)
                .semantics { contentDescription = "Accounts list, reorderable" },
        )

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            modifier = Modifier.onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || !event.isAltPressed) {
                    return@onPreviewKeyEvent false
                }
                when (event.key) {
                    Key.DirectionUp -> {
                        if (focusedIndex > 0) {
                            val item = orderedAccounts.removeAt(focusedIndex)
                            focusedIndex--
                            orderedAccounts.add(focusedIndex, item)
                            onReorder(orderedAccounts.toList())
                        }
                        true
                    }
                    Key.DirectionDown -> {
                        if (focusedIndex < orderedAccounts.size - 1) {
                            val item = orderedAccounts.removeAt(focusedIndex)
                            focusedIndex++
                            orderedAccounts.add(focusedIndex, item)
                            onReorder(orderedAccounts.toList())
                        }
                        true
                    }
                    else -> false
                }
            },
        ) {
            itemsIndexed(orderedAccounts, key = { _, a -> a.id.value }) { idx, acct ->
                DraggableAccountRow(acct, idx, orderedAccounts.size, acct.id.value == selectedId,
                    idx == dragTargetIndex, { focusedIndex = idx; onSelect(acct) },
                    { dragTargetIndex = idx },
                    { dy -> val t = (idx + (dy / 60).toInt()).coerceIn(0, orderedAccounts.size - 1)
                        if (t != idx) { val i = orderedAccounts.removeAt(idx); orderedAccounts.add(t, i); dragTargetIndex = t } },
                    { dragTargetIndex = null; onReorder(orderedAccounts.toList()) })
            }
        }
    }
}

/** Single account row with drag handle for reordering. */
@Composable
private fun DraggableAccountRow(
    account: Account, index: Int, totalCount: Int, isSelected: Boolean,
    isDragTarget: Boolean, onSelect: () -> Unit, onDragStarted: () -> Unit,
    onDragMoved: (Float) -> Unit, onDragEnded: () -> Unit,
) {
    val formattedBalance = CurrencyFormatter.format(account.currentBalance, account.currency)
    val containerColor = when {
        isDragTarget -> MaterialTheme.colorScheme.tertiaryContainer
        isSelected -> MaterialTheme.colorScheme.primaryContainer
        else -> MaterialTheme.colorScheme.surface
    }
    val elevation by animateDpAsState(
        targetValue = if (isDragTarget) 8.dp else 1.dp,
        animationSpec = tween(200), label = "drag-elevation",
    )
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onSelect)
            .semantics { contentDescription = "${account.name}, balance: ${formattedBalance}, position ${index + 1} of ${totalCount}. Use Alt+Up or Alt+Down to reorder."; role = Role.Button },
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = elevation),
        colors = CardDefaults.elevatedCardColors(containerColor = containerColor),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(FinanceDesktopTheme.spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(32.dp).pointerInput(Unit) {
                detectDragGestures(onDragStart = { onDragStarted() }, onDrag = { change, amt -> change.consume(); onDragMoved(amt.y) },
                    onDragEnd = { onDragEnded() }, onDragCancel = { onDragEnded() })
            }.semantics { contentDescription = "Drag handle, use Alt+Up or Alt+Down to reorder"; role = Role.Button },
                contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.DragHandle, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(account.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(account.type.name.lowercase().replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(formattedBalance, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}
