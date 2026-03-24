// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalGroceryStore
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Subscriptions
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.data.SampleData
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.TransactionDetailUiState
import com.finance.android.ui.viewmodel.TransactionDetailViewModel
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.SyncId
import org.koin.compose.viewmodel.koinViewModel

/**
 * Transaction Detail screen (#530).
 *
 * Displays all fields for a single transaction in a Material 3 card layout with a
 * prominent amount header, a details card (date, category, account, note), and an
 * optional tags section.
 *
 * The transaction ID is resolved by [TransactionDetailViewModel] from the navigation
 * [SavedStateHandle][androidx.lifecycle.SavedStateHandle]; callers do not need to pass it.
 *
 * Accessibility: all interactive and informational Composables carry a `contentDescription`
 * for full TalkBack / Switch Access compatibility.
 *
 * @param onBack Called when the user taps the back arrow or after a successful deletion.
 * @param onEdit Called with the transaction's [SyncId] when the user taps the Edit action.
 * @param modifier Modifier applied to the root [Scaffold].
 * @param viewModel Koin-injected [TransactionDetailViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionDetailScreen(
    onBack: () -> Unit,
    onEdit: (SyncId) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: TransactionDetailViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }

    // Pop back stack once the repository confirms deletion.
    LaunchedEffect(state) {
        if (state is TransactionDetailUiState.Deleted) onBack()
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Transaction Details",
                        modifier = Modifier.semantics {
                            contentDescription = "Transaction Details screen"
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
                    val s = state as? TransactionDetailUiState.Success
                    if (s != null) {
                        IconButton(
                            onClick = { onEdit(s.transactionId) },
                            modifier = Modifier.semantics { contentDescription = "Edit transaction" },
                        ) {
                            Icon(Icons.Filled.Edit, contentDescription = null)
                        }
                        IconButton(
                            onClick = { showDeleteDialog = true },
                            enabled = !s.isDeleting,
                            modifier = Modifier.semantics {
                                contentDescription =
                                    if (s.isDeleting) "Deleting transaction" else "Delete transaction"
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Delete,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (val s = state) {
                is TransactionDetailUiState.Loading,
                is TransactionDetailUiState.Deleted,
                -> DetailLoadingState()

                is TransactionDetailUiState.NotFound -> DetailNotFoundState(onBack)
                is TransactionDetailUiState.Success -> TransactionDetailContent(state = s)
            }
        }
    }

    if (showDeleteDialog) {
        DeleteConfirmationDialog(
            onConfirm = {
                showDeleteDialog = false
                viewModel.deleteTransaction()
            },
            onDismiss = { showDeleteDialog = false },
        )
    }
}

// ── Content ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TransactionDetailContent(state: TransactionDetailUiState.Success) {
    val amountColor = when (state.type) {
        TransactionType.EXPENSE -> MaterialTheme.colorScheme.error
        TransactionType.INCOME -> Color(0xFF2E7D32)
        TransactionType.TRANSFER -> MaterialTheme.colorScheme.tertiary
    }
    val typeIcon: ImageVector = when (state.type) {
        TransactionType.EXPENSE -> Icons.Filled.TrendingDown
        TransactionType.INCOME -> Icons.Filled.TrendingUp
        TransactionType.TRANSFER -> Icons.Filled.SwapHoriz
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .semantics {
                contentDescription = "${state.typeLabel} of ${state.formattedAmount} by ${state.payee}"
            },
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Prominent amount / payee header ───────────────────────────
        item(key = "amount-card") {
            ElevatedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            "${state.typeLabel} of ${state.formattedAmount} by ${state.payee} on ${state.formattedDate}"
                    },
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = state.formattedAmount,
                        style = MaterialTheme.typography.displayMedium,
                        fontWeight = FontWeight.Bold,
                        color = amountColor,
                        modifier = Modifier.semantics {
                            contentDescription = "Amount: ${state.formattedAmount}"
                        },
                    )
                    Text(
                        text = state.payee,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            contentDescription = "Payee: ${state.payee}"
                        },
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SuggestionChip(
                            onClick = {},
                            label = { Text(state.typeLabel) },
                            icon = {
                                Icon(
                                    imageVector = typeIcon,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = amountColor,
                                )
                            },
                            modifier = Modifier.semantics {
                                contentDescription = "Transaction type: ${state.typeLabel}"
                            },
                        )
                        SuggestionChip(
                            onClick = {},
                            label = { Text(state.statusLabel) },
                            modifier = Modifier.semantics {
                                contentDescription = "Status: ${state.statusLabel}"
                            },
                        )
                    }
                }
            }
        }

        // ── Detail rows ───────────────────────────────────────────────
        item(key = "details-card") {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Transaction details" },
            ) {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    DetailRow(
                        label = "Date",
                        value = state.formattedDate,
                        icon = Icons.Filled.CalendarMonth,
                    )
                    if (state.categoryName != null) {
                        HorizontalDivider()
                        DetailRow(
                            label = "Category",
                            value = state.categoryName,
                            icon = detailCatIcon(state.categoryIcon),
                        )
                    }
                    HorizontalDivider()
                    DetailRow(
                        label = "Account",
                        value = state.accountName,
                        icon = Icons.Filled.AccountBalance,
                    )
                    if (!state.note.isNullOrBlank()) {
                        HorizontalDivider()
                        DetailRow(
                            label = "Note",
                            value = state.note,
                            icon = Icons.AutoMirrored.Filled.Notes,
                        )
                    }
                }
            }
        }

        // ── Tags ──────────────────────────────────────────────────────
        if (state.tags.isNotEmpty()) {
            item(key = "tags") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Tags: ${state.tags.joinToString(", ")}"
                        },
                ) {
                    Text(
                        text = "Tags",
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier
                            .padding(bottom = 8.dp)
                            .semantics { heading() },
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.tags.forEach { tag ->
                            SuggestionChip(
                                onClick = {},
                                label = { Text(tag) },
                                modifier = Modifier.semantics {
                                    contentDescription = "Tag: $tag"
                                },
                            )
                        }
                    }
                }
            }
        }

        item(key = "bottom-spacer") { Spacer(Modifier.height(24.dp)) }
    }
}

// ── Shared row component ──────────────────────────────────────────────────────

@Composable
private fun DetailRow(label: String, value: String, icon: ImageVector) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp)
            .semantics { contentDescription = "$label: $value" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

// ── Loading / error states ────────────────────────────────────────────────────

@Composable
private fun DetailLoadingState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Loading transaction details" },
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.semantics { contentDescription = "Loading indicator" },
        )
    }
}

@Composable
private fun DetailNotFoundState(onBack: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Transaction not found" },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(24.dp),
        ) {
            Text(
                text = "Transaction not found",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "This transaction may have been deleted.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            TextButton(
                onClick = onBack,
                modifier = Modifier.semantics {
                    contentDescription = "Go back to transaction list"
                },
            ) {
                Text("Go back")
            }
        }
    }
}

// ── Delete confirmation dialog ────────────────────────────────────────────────

@Composable
private fun DeleteConfirmationDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.semantics {
            contentDescription = "Delete transaction confirmation dialog"
        },
        title = {
            Text(
                text = "Delete Transaction?",
                modifier = Modifier.semantics {
                    contentDescription = "Delete transaction confirmation heading"
                },
            )
        },
        text = {
            Text(
                text = "This transaction will be permanently removed. This action cannot be undone.",
                modifier = Modifier.semantics {
                    contentDescription = "Delete transaction warning message"
                },
            )
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                modifier = Modifier.semantics {
                    contentDescription = "Confirm delete transaction"
                },
            ) {
                Text("Delete", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Cancel delete" },
            ) {
                Text("Cancel")
            }
        },
    )
}

// ── Icon mapping ─────────────────────────────────────────────────────────────

/**
 * Maps a [com.finance.models.Category.icon] slug to a Material icon vector.
 * Mirrors the mapping in `TransactionCreateScreen` — update both when adding icons.
 */
private fun detailCatIcon(name: String?): ImageVector = when (name) {
    "shopping_cart" -> Icons.Filled.LocalGroceryStore
    "restaurant" -> Icons.Filled.Fastfood
    "directions_car" -> Icons.Filled.DirectionsCar
    "movie" -> Icons.Filled.Movie
    "bolt" -> Icons.Outlined.Bolt
    "home" -> Icons.Filled.Home
    "local_hospital" -> Icons.Filled.LocalHospital
    "shopping_bag" -> Icons.Filled.ShoppingBag
    "subscriptions" -> Icons.Filled.Subscriptions
    "payments" -> Icons.Filled.Payments
    "work" -> Icons.Filled.Work
    "trending_up" -> Icons.Filled.TrendingUp
    "swap_horiz" -> Icons.Filled.SwapHoriz
    "credit_card" -> Icons.Filled.CreditCard
    else -> Icons.Filled.Category
}

// ── Previews ──────────────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Detail - Expense Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Detail - Expense Dark",
)
@Composable
private fun TransactionDetailExpensePreview() {
    FinanceTheme(dynamicColor = false) {
        TransactionDetailContent(
            state = TransactionDetailUiState.Success(
                transactionId = SyncId("txn-1"),
                accountId = SyncId("acc-checking"),
                payee = "Whole Foods Market",
                formattedAmount = "-\$87.43",
                formattedDate = "Today",
                type = TransactionType.EXPENSE,
                typeLabel = "Expense",
                statusLabel = "Cleared",
                categoryName = "Groceries",
                categoryIcon = "shopping_cart",
                accountName = "Main Checking",
                note = "Weekly grocery run",
                tags = listOf("household", "recurring"),
            ),
        )
    }
}

@Preview(showBackground = true, showSystemUi = true, name = "Detail - Income Light")
@Composable
private fun TransactionDetailIncomePreview() {
    FinanceTheme(dynamicColor = false) {
        TransactionDetailContent(
            state = TransactionDetailUiState.Success(
                transactionId = SyncId("txn-9"),
                accountId = SyncId("acc-checking"),
                payee = "Acme Corp",
                formattedAmount = "+\$3,250.00",
                formattedDate = "Mar 4, 2025",
                type = TransactionType.INCOME,
                typeLabel = "Income",
                statusLabel = "Cleared",
                categoryName = "Salary",
                categoryIcon = "payments",
                accountName = "Main Checking",
                note = null,
                tags = emptyList(),
            ),
        )
    }
}

@Preview(showBackground = true, name = "Detail - Loading")
@Composable
private fun TransactionDetailLoadingPreview() {
    FinanceTheme(dynamicColor = false) { DetailLoadingState() }
}

@Preview(showBackground = true, name = "Detail - Not Found")
@Composable
private fun TransactionDetailNotFoundPreview() {
    FinanceTheme(dynamicColor = false) { DetailNotFoundState(onBack = {}) }
}

@Preview(showBackground = true, name = "Delete Dialog")
@Composable
private fun DeleteDialogPreview() {
    FinanceTheme(dynamicColor = false) {
        DeleteConfirmationDialog(onConfirm = {}, onDismiss = {})
    }
}
