// SPDX-License-Identifier: BUSL-1.1

@file:Suppress("MatchingDeclarationName") // File contains RecurringPreviewItem + RecurringPreviewPanel composable

package com.finance.desktop.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme
import kotlinx.datetime.*

/** Upcoming recurring transaction for preview display. */
data class RecurringPreviewItem(
    val id: String, val name: String, val amountFormatted: String,
    val nextDate: LocalDate, val frequency: String, val isExpense: Boolean,
    val notifyDaysBefore: Int = 3,
)

/**
 * Panel showing upcoming recurring transactions with a calendar view.
 *
 * Displays a list of scheduled transactions and a mini calendar highlighting
 * dates with upcoming bills. Users can edit recurring rules and set notification
 * preferences for upcoming bills.
 *
 * ## Accessibility
 * - Calendar days with scheduled transactions announced to Narrator
 * - Each recurring item reads name, amount, next date, and frequency
 */
@Composable
fun RecurringPreviewPanel(
    items: List<RecurringPreviewItem>,
    selectedMonth: LocalDate,
    onMonthChange: (LocalDate) -> Unit,
    onEditRule: (String) -> Unit,
    onToggleNotification: (String, Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl)) {
        // Left: Upcoming list
        Column(modifier = Modifier.weight(1f)) {
            Text("Upcoming Bills", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading(); contentDescription = "Upcoming recurring transactions" })
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            if (items.isEmpty()) {
                Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    Text("No upcoming recurring transactions", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm)) {
                    items(items, key = { it.id }) { item ->
                        RecurringItemCard(item, onEditRule, onToggleNotification)
                    }
                }
            }
        }

        // Right: Calendar view
        RecurringCalendarView(items = items, currentMonth = selectedMonth, onMonthChange = onMonthChange, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun RecurringItemCard(
    item: RecurringPreviewItem,
    onEdit: (String) -> Unit,
    onToggleNotify: (String, Boolean) -> Unit,
) {
    val amountColor = if (item.isExpense) MaterialTheme.colorScheme.error else Color(0xFF2E7D32)
    var notifyEnabled by remember { mutableStateOf(item.notifyDaysBefore > 0) }

    Card(modifier = Modifier.fillMaxWidth().semantics { contentDescription = "${item.name}, ${item.amountFormatted}, next on ${item.nextDate}, ${item.frequency}" }) {
        Row(Modifier.fillMaxWidth().padding(FinanceDesktopTheme.spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Repeat, contentDescription = null, tint = amountColor, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                Text("Next: ${item.nextDate} - ${item.frequency}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(item.amountFormatted, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = amountColor)
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
            IconButton(onClick = { notifyEnabled = !notifyEnabled; onToggleNotify(item.id, notifyEnabled) },
                modifier = Modifier.semantics { contentDescription = "Notification ${if (notifyEnabled) "enabled" else "disabled"} for ${item.name}" }) {
                Icon(Icons.Filled.Notifications, null, tint = if (notifyEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = { onEdit(item.id) }, modifier = Modifier.semantics { contentDescription = "Edit ${item.name} recurring rule" }) {
                Icon(Icons.Filled.Edit, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/**
 * Calendar grid showing days with scheduled recurring transactions highlighted.
 */
@Composable
fun RecurringCalendarView(
    items: List<RecurringPreviewItem>,
    currentMonth: LocalDate,
    onMonthChange: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheduledDates = items.map { it.nextDate.dayOfMonth }.toSet()
    val daysInMonth = when (currentMonth.month) {
        Month.FEBRUARY -> if (currentMonth.year % 4 == 0) 29 else 28
        Month.APRIL, Month.JUNE, Month.SEPTEMBER, Month.NOVEMBER -> 30
        else -> 31
    }
    val firstDayOfWeek = LocalDate(currentMonth.year, currentMonth.month, 1).dayOfWeek.ordinal

    Column(modifier = modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { val prev = LocalDate(currentMonth.year, currentMonth.monthNumber - if (currentMonth.monthNumber > 1) 1 else 0, 1); if (currentMonth.monthNumber > 1) onMonthChange(prev) }) { Text("<") }
            Text("${currentMonth.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${currentMonth.year}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading(); contentDescription = "Calendar for ${currentMonth.month.name} ${currentMonth.year}" })
            TextButton(onClick = { val next = LocalDate(currentMonth.year, (currentMonth.monthNumber % 12) + 1, 1); onMonthChange(next) }) { Text(">") }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf("Mon","Tue","Wed","Thu","Fri","Sat","Sun").forEach { day ->
                Text(day, style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(36.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
        LazyVerticalGrid(columns = GridCells.Fixed(7), modifier = Modifier.fillMaxWidth().height(240.dp)) {
            items((1..firstDayOfWeek).toList()) { Box(Modifier.size(36.dp)) }
            items((1..daysInMonth).toList()) { day ->
                val hasScheduled = day in scheduledDates
                Box(
                    Modifier.size(36.dp)
                        .clip(CircleShape)
                        .then(if (hasScheduled) Modifier.background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
                              else Modifier)
                        .semantics { contentDescription = "Day ${day}${if (hasScheduled) ", has scheduled transaction" else ""}" },
                    contentAlignment = Alignment.Center
                ) {
                    Text("${day}", style = MaterialTheme.typography.bodySmall,
                        fontWeight = if (hasScheduled) FontWeight.Bold else FontWeight.Normal,
                        color = if (hasScheduled) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}
