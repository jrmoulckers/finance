// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.wedding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.viewmodel.koinViewModel

/**
 * Shared wedding budget workspace (#2145).
 *
 * A dedicated space to track vendors, deposits, upcoming due dates, and
 * guest-count-sensitive estimates against a target budget.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeddingWorkspaceScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WeddingViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showAdd by remember { mutableStateOf(false) }
    var paymentVendorId by remember { mutableStateOf<String?>(null) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Wedding workspace") },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Go back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAdd = true },
                modifier = Modifier.semantics { contentDescription = "Add a vendor" },
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(4.dp)) }
            item { BudgetSummaryCard(state) }
            item { GuestAndTargetCard(state, viewModel) }
            if (state.upcomingDueDates.isNotEmpty()) {
                item {
                    Text(
                        "Upcoming due dates",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                items(state.upcomingDueDates, key = { it.vendorName + it.dueDateText }) { d ->
                    DueDateRow(d)
                }
            }
            item {
                Text(
                    "Vendors",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            if (state.vendors.isEmpty() && !state.isLoading) {
                item {
                    Text(
                        "Add your venue, catering, photographer, and more to track deposits " +
                            "and balances.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(state.vendors, key = { it.id }) { v ->
                VendorCard(
                    vendor = v,
                    onRecordPayment = { paymentVendorId = v.id },
                    onDelete = { viewModel.deleteVendor(v.id) },
                )
            }
            item { Spacer(Modifier.height(80.dp)) }
        }
    }

    if (showAdd) {
        AddVendorDialog(
            onDismiss = { showAdd = false },
            onAdd = { name, category, budget, perGuest, paid, dueInDays ->
                val dueEpoch = dueInDays?.let {
                    Clock.System.todayIn(TimeZone.currentSystemDefault()).toEpochDays().toLong() + it
                }
                viewModel.addVendor(name, category, budget, perGuest, paid, dueEpoch)
                showAdd = false
            },
        )
    }

    paymentVendorId?.let { id ->
        RecordPaymentDialog(
            onDismiss = { paymentVendorId = null },
            onRecord = { amount ->
                viewModel.recordPayment(id, amount)
                paymentVendorId = null
            },
        )
    }
}

@Composable
private fun BudgetSummaryCard(state: WeddingUiState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "Budget",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                "${state.totalBudgetedFormatted} planned of ${state.targetFormatted}",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            LinearProgressIndicator(
                progress = { state.budgetUsedFraction },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .semantics {
                        contentDescription =
                            "Planned budget ${(state.budgetUsedFraction * 100).toInt()} percent of target"
                    },
            )
            Text(
                state.overUnderText,
                style = MaterialTheme.typography.bodyMedium,
                color = if (state.isOverBudget) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {}, label = { Text("Paid ${state.totalPaidFormatted}") })
                AssistChip(onClick = {}, label = { Text("Left ${state.remainingToPayFormatted}") })
            }
            Text(
                "About ${state.perGuestFormatted} per guest",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun GuestAndTargetCard(state: WeddingUiState, viewModel: WeddingViewModel) {
    var targetText by remember(state.targetCents) {
        mutableStateOf((state.targetCents / 100.0).toString())
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Guest count", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                IconButton(
                    onClick = { viewModel.setGuestCount(state.guestCount - GUEST_STEP) },
                    modifier = Modifier.semantics { contentDescription = "Fewer guests" },
                ) { Icon(Icons.Filled.Remove, contentDescription = null) }
                Text(
                    "${state.guestCount}",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { contentDescription = "${state.guestCount} guests" },
                )
                IconButton(
                    onClick = { viewModel.setGuestCount(state.guestCount + GUEST_STEP) },
                    modifier = Modifier.semantics { contentDescription = "More guests" },
                ) { Icon(Icons.Filled.Add, contentDescription = null) }
            }
            OutlinedTextField(
                value = targetText,
                onValueChange = {
                    targetText = it
                    it.toDoubleOrNull()?.let { d -> viewModel.setTargetBudget(d) }
                },
                label = { Text("Target budget ($)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Target budget in dollars" },
            )
        }
    }
}

@Composable
private fun DueDateRow(d: DueDateUi) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(d.vendorName, style = MaterialTheme.typography.bodyLarge)
                Text(
                    "Due ${d.dueDateText}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(d.remainingFormatted, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun VendorCard(vendor: VendorRowUi, onRecordPayment: () -> Unit, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(vendor.name, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        vendor.category,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.semantics { contentDescription = "Delete ${vendor.name}" },
                ) { Icon(Icons.Filled.Delete, contentDescription = null) }
            }
            LinearProgressIndicator(
                progress = { vendor.paidFraction },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
            )
            Text(
                "${vendor.paidFormatted} paid of ${vendor.budgetedFormatted} · " +
                    "${vendor.remainingFormatted} left",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                vendor.perGuestBadge?.let { AssistChip(onClick = {}, label = { Text(it) }) }
                vendor.dueDateText?.let { AssistChip(onClick = {}, label = { Text("Due $it") }) }
            }
            OutlinedButton(
                onClick = onRecordPayment,
                modifier = Modifier.semantics { contentDescription = "Record payment for ${vendor.name}" },
            ) { Text("Record payment") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddVendorDialog(
    onDismiss: () -> Unit,
    onAdd: (String, WeddingCategory, Double, Boolean, Double, Long?) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(WeddingCategory.VENUE) }
    var budget by remember { mutableStateOf("") }
    var perGuest by remember { mutableStateOf(false) }
    var paid by remember { mutableStateOf("") }
    var dueDays by remember { mutableStateOf("") }
    var categoryMenu by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    onAdd(
                        name,
                        category,
                        budget.toDoubleOrNull() ?: 0.0,
                        perGuest,
                        paid.toDoubleOrNull() ?: 0.0,
                        dueDays.toLongOrNull(),
                    )
                },
                enabled = name.isNotBlank() && (budget.toDoubleOrNull() ?: 0.0) > 0,
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Add vendor") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Vendor name") },
                    singleLine = true,
                )
                Box {
                    OutlinedButton(onClick = { categoryMenu = true }) {
                        Text(category.displayName)
                    }
                    DropdownMenu(expanded = categoryMenu, onDismissRequest = { categoryMenu = false }) {
                        WeddingCategory.entries.forEach { c ->
                            DropdownMenuItem(
                                text = { Text(c.displayName) },
                                onClick = {
                                    category = c
                                    categoryMenu = false
                                },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = budget,
                    onValueChange = { budget = it },
                    label = { Text(if (perGuest) "Cost per guest ($)" else "Budget ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                FilterChip(
                    selected = perGuest,
                    onClick = { perGuest = !perGuest },
                    label = { Text("Scales with guest count") },
                )
                OutlinedTextField(
                    value = paid,
                    onValueChange = { paid = it },
                    label = { Text("Deposit paid so far ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = dueDays,
                    onValueChange = { dueDays = it },
                    label = { Text("Next payment due in (days, optional)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
            }
        },
    )
}

@Composable
private fun RecordPaymentDialog(onDismiss: () -> Unit, onRecord: (Double) -> Unit) {
    var amount by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { onRecord(amount.toDoubleOrNull() ?: 0.0) },
                enabled = (amount.toDoubleOrNull() ?: 0.0) > 0,
            ) { Text("Record") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Record payment") },
        text = {
            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it },
                label = { Text("Amount paid ($)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
            )
        },
    )
}

private const val GUEST_STEP = 5

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
@Suppress("UnusedPrivateMember")
private fun WeddingScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        // Live data comes from the ViewModel.
    }
}
