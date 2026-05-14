// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.tray.FinanceSystemTray
import com.finance.desktop.tray.QuickAddTransactionManager
import kotlinx.coroutines.launch

/**
 * Quick-add transaction dialog shown from the system tray.
 *
 * Minimal form with payee, amount, and expense/income toggle.
 * Saves through the repository layer and shows a tray notification
 * on success.
 *
 * Narrator: all fields have labels, chips announce selection state,
 * error messages are announced, save/cancel buttons are labeled.
 */
@Composable
@Suppress("LongMethod") // Transaction form dialog composable
fun QuickAddTransactionDialog(
    quickAddManager: QuickAddTransactionManager,
    systemTray: FinanceSystemTray,
) {
    val state by quickAddManager.state.collectAsState()
    val scope = rememberCoroutineScope()

    if (!state.isVisible) return

    AlertDialog(
        onDismissRequest = { quickAddManager.hide() },
        title = {
            Text(
                text = "Quick Add Transaction",
                fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Quick add transaction form"
                    },
            ) {
                // Type toggle
                Row(
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    FilterChip(
                        selected = state.isExpense,
                        onClick = { if (!state.isExpense) quickAddManager.toggleType() },
                        label = { Text("Expense") },
                        leadingIcon = {
                            Icon(
                                Icons.AutoMirrored.Filled.TrendingDown,
                                contentDescription = null,
                                tint = if (state.isExpense) MaterialTheme.colorScheme.error else Color.Unspecified,
                            )
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Expense type${if (state.isExpense) ", selected" else ""}"
                        },
                    )
                    FilterChip(
                        selected = !state.isExpense,
                        onClick = { if (state.isExpense) quickAddManager.toggleType() },
                        label = { Text("Income") },
                        leadingIcon = {
                            Icon(
                                Icons.AutoMirrored.Filled.TrendingUp,
                                contentDescription = null,
                                tint = if (!state.isExpense) Color(0xFF22C55E) else Color.Unspecified,
                            )
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Income type${if (!state.isExpense) ", selected" else ""}"
                        },
                    )
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Payee field
                OutlinedTextField(
                    value = state.payee,
                    onValueChange = { quickAddManager.updatePayee(it) },
                    label = { Text("Payee") },
                    placeholder = { Text("e.g. Grocery store") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Payee name"
                        },
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // Amount field
                OutlinedTextField(
                    value = state.amount,
                    onValueChange = { quickAddManager.updateAmount(it) },
                    label = { Text("Amount (\$)") },
                    placeholder = { Text("0.00") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Transaction amount in dollars"
                        },
                )

                // Error message
                if (state.errorMessage != null) {
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = state.errorMessage!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics {
                            contentDescription = "Error: ${state.errorMessage}"
                        },
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        val result = quickAddManager.save()
                        if (result != null) {
                            systemTray.showQuickAddConfirmation(result.first, result.second)
                        }
                    }
                },
                enabled = !state.isSaving,
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .padding(end = 8.dp)
                            .then(Modifier.height(16.dp).width(16.dp)),
                        strokeWidth = 2.dp,
                    )
                }
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(
                onClick = { quickAddManager.hide() },
                enabled = !state.isSaving,
            ) {
                Text("Cancel")
            }
        },
        modifier = Modifier.semantics {
            contentDescription = "Quick add transaction dialog. " +
                "Enter payee and amount to quickly log a transaction."
        },
    )
}
