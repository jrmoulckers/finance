// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.bills

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import kotlinx.datetime.LocalDate
import org.koin.compose.viewmodel.koinViewModel

/**
 * Bill Reminders screen (#1125).
 *
 * Shows detected recurring bills, upcoming/overdue status, bill calendar
 * view, and mark-as-paid functionality. TalkBack accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillRemindersScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: BillRemindersViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Bill Reminders",
                        modifier = Modifier.semantics {
                            contentDescription = "Bill Reminders"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    IconButton(
                        onClick = viewModel::toggleCalendar,
                        modifier = Modifier.semantics {
                            contentDescription = if (state.showCalendar) "Hide calendar" else "Show calendar"
                        },
                    ) {
                        Icon(Icons.Filled.CalendarMonth, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .semantics { contentDescription = "Loading bill reminders" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading" },
                )
            }
            return@Scaffold
        }

        BillRemindersContent(
            state = state,
            onToggleCalendar = viewModel::toggleCalendar,
            onMarkPaid = viewModel::markBillPaid,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
internal fun BillRemindersContent(
    state: BillRemindersUiState,
    onToggleCalendar: () -> Unit,
    onMarkPaid: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Summary card
        item(key = "summary") {
            BillSummaryCard(
                upcomingCount = state.upcomingBills.size,
                overdueCount = state.overdueCount,
                totalUpcoming = state.totalUpcomingFormatted,
            )
        }

        // Calendar view (togglable)
        item(key = "calendar") {
            AnimatedVisibility(
                visible = state.showCalendar,
                enter = expandVertically(),
                exit = shrinkVertically(),
            ) {
                BillCalendar(
                    days = state.calendarDays,
                    monthLabel = state.currentMonth,
                )
            }
        }

        // Overdue bills section
        if (state.overdueBills.isNotEmpty()) {
            item(key = "overdue-header") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Warning,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Overdue (${state.overdueBills.size})",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "${state.overdueBills.size} overdue bills"
                        },
                    )
                }
            }

            items(state.overdueBills, key = { it.id }) { bill ->
                BillCard(bill = bill, onMarkPaid = { onMarkPaid(bill.id) })
            }
        }

        // Upcoming bills section
        if (state.upcomingBills.isNotEmpty()) {
            item(key = "upcoming-header") {
                Text(
                    "Upcoming (${state.upcomingBills.size})",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "${state.upcomingBills.size} upcoming bills"
                    },
                )
            }

            items(state.upcomingBills, key = { it.id }) { bill ->
                BillCard(bill = bill, onMarkPaid = { onMarkPaid(bill.id) })
            }
        }

        // Empty state
        if (state.upcomingBills.isEmpty() && state.overdueBills.isEmpty()) {
            item(key = "empty") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp)
                        .semantics { contentDescription = "No bills detected yet. Add transactions to detect recurring bills." },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Filled.Receipt,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "No bills detected",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        "Bills are automatically detected from your recurring transactions",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun BillSummaryCard(
    upcomingCount: Int,
    overdueCount: Int,
    totalUpcoming: String,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$upcomingCount upcoming bills, $overdueCount overdue"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = if (overdueCount > 0) MaterialTheme.colorScheme.errorContainer
            else MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Notifications,
                    contentDescription = null,
                    tint = if (overdueCount > 0) MaterialTheme.colorScheme.onErrorContainer
                    else MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        "Bill Reminders",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (overdueCount > 0) MaterialTheme.colorScheme.onErrorContainer
                        else MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        "$upcomingCount upcoming · $overdueCount overdue",
                        style = MaterialTheme.typography.bodySmall,
                        color = (if (overdueCount > 0) MaterialTheme.colorScheme.onErrorContainer
                        else MaterialTheme.colorScheme.onPrimaryContainer).copy(alpha = 0.7f),
                    )
                }
            }
        }
    }
}

@Composable
private fun BillCard(
    bill: BillUi,
    onMarkPaid: () -> Unit,
) {
    val statusColor = when {
        bill.isOverdue -> MaterialTheme.colorScheme.error
        bill.daysUntilDue <= 3 -> Color(0xFFFF9800)
        else -> MaterialTheme.colorScheme.primary
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${bill.name}: ${bill.amountFormatted}, " +
                    "${bill.frequency}, ${bill.nextDueLabel}"
            },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Status indicator
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(statusColor),
            )
            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    bill.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row {
                    Text(
                        bill.frequency,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        bill.nextDueLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Text(
                bill.amountFormatted,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )

            Spacer(Modifier.width(8.dp))

            IconButton(
                onClick = onMarkPaid,
                modifier = Modifier
                    .size(32.dp)
                    .semantics { contentDescription = "Mark ${bill.name} as paid" },
            ) {
                Icon(
                    Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun BillCalendar(
    days: List<CalendarDay>,
    monthLabel: String,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Bill calendar for $monthLabel" },
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                monthLabel,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp),
            )

            // Day headers
            Row(Modifier.fillMaxWidth()) {
                listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun").forEach { day ->
                    Text(
                        day,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Spacer(Modifier.height(4.dp))

            // Calendar grid
            val rows = days.chunked(7)
            rows.forEach { week ->
                Row(Modifier.fillMaxWidth()) {
                    week.forEach { day ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .padding(2.dp)
                                .then(
                                    if (day.isToday) Modifier.border(
                                        1.dp,
                                        MaterialTheme.colorScheme.primary,
                                        CircleShape,
                                    ) else Modifier,
                                )
                                .then(
                                    if (day.bills.isNotEmpty()) Modifier.background(
                                        MaterialTheme.colorScheme.primaryContainer,
                                        CircleShape,
                                    ) else Modifier,
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                day.date.dayOfMonth.toString(),
                                style = MaterialTheme.typography.labelSmall,
                                color = when {
                                    !day.isCurrentMonth -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                    day.bills.any { it.isOverdue } -> MaterialTheme.colorScheme.error
                                    day.bills.isNotEmpty() -> MaterialTheme.colorScheme.onPrimaryContainer
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                                fontWeight = if (day.bills.isNotEmpty()) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "Bill Reminders - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Bill Reminders - Dark")
@Composable
private fun BillRemindersPreview() {
    FinanceTheme(dynamicColor = false) {
        BillRemindersContent(
            state = BillRemindersUiState(
                isLoading = false,
                upcomingBills = listOf(
                    BillUi("1", "Netflix", "$15.99", "Monthly", LocalDate(2025, 2, 15), "Due in 5 days", 5, false),
                    BillUi("2", "Electric Co.", "$89.00", "Monthly", LocalDate(2025, 2, 20), "Due in 10 days", 10, false),
                    BillUi("3", "Internet", "$65.00", "Monthly", LocalDate(2025, 2, 25), "Due in 15 days", 15, false),
                ),
                overdueBills = listOf(
                    BillUi("4", "Gym Membership", "$49.99", "Monthly", LocalDate(2025, 2, 1), "9 days overdue", -9, true),
                ),
                overdueCount = 1,
                totalUpcomingFormatted = "$169.99",
                currentMonth = "February 2025",
                showCalendar = false,
            ),
            onToggleCalendar = {},
            onMarkPaid = {},
        )
    }
}

@Preview(showBackground = true, name = "Bill Reminders - Empty - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Bill Reminders - Empty - Dark")
@Composable
private fun BillRemindersEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        BillRemindersContent(
            state = BillRemindersUiState(isLoading = false),
            onToggleCalendar = {},
            onMarkPaid = {},
        )
    }
}
