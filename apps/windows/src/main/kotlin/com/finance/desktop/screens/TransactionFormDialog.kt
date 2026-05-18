// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.components.AmountTextField
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType

/**
 * Form state for creating or editing a transaction.
 *
 * @param payee The payee/merchant name.
 * @param amountDigits Raw digit string for the amount (Venmo-style input).
 * @param type Transaction type (expense, income, transfer).
 * @param status Transaction status (pending, cleared, reconciled).
 * @param tags List of user-defined tags.
 * @param note Optional note/memo.
 */
data class TransactionFormState(
    val payee: String = "",
    val amountDigits: String = "",
    val type: TransactionType = TransactionType.EXPENSE,
    val status: TransactionStatus = TransactionStatus.PENDING,
    val tags: List<String> = emptyList(),
    val note: String = "",
)

/**
 * Transaction create/edit form dialog.
 *
 * Includes all fields: type toggle, payee, amount (Venmo-style), status
 * dropdown, tags chip input, and note. Status defaults to "Pending" for
 * new transactions.
 *
 * Narrator: All fields have content descriptions; chips announce removal action;
 * status dropdown announces current selection.
 *
 * @param initialState Pre-populated form state (empty for new transactions).
 * @param isEdit Whether this is editing an existing transaction.
 * @param onDismiss Callback when the dialog is dismissed without saving.
 * @param onSave Callback with the completed form state when user saves.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
@Suppress("LongMethod") // Transaction form dialog with multiple fields
fun TransactionFormDialog(
    initialState: TransactionFormState = TransactionFormState(),
    isEdit: Boolean = false,
    onDismiss: () -> Unit,
    onSave: (TransactionFormState) -> Unit,
) {
    var formState by remember { mutableStateOf(initialState) }
    var tagInput by remember { mutableStateOf("") }
    var statusExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = if (isEdit) "Edit Transaction" else "New Transaction",
                fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = if (isEdit) "Edit transaction form"
                        else "New transaction form"
                    },
            ) {
                // ── Type toggle ──
                Row(
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    FilterChip(
                        selected = formState.type == TransactionType.EXPENSE,
                        onClick = { formState = formState.copy(type = TransactionType.EXPENSE) },
                        label = { Text("Expense") },
                        leadingIcon = {
                            Icon(
                                Icons.AutoMirrored.Filled.TrendingDown,
                                contentDescription = null,
                                tint = if (formState.type == TransactionType.EXPENSE)
                                    MaterialTheme.colorScheme.error else Color.Unspecified,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Expense type" +
                                if (formState.type == TransactionType.EXPENSE) ", selected" else ""
                        },
                    )
                    FilterChip(
                        selected = formState.type == TransactionType.INCOME,
                        onClick = { formState = formState.copy(type = TransactionType.INCOME) },
                        label = { Text("Income") },
                        leadingIcon = {
                            Icon(
                                Icons.AutoMirrored.Filled.TrendingUp,
                                contentDescription = null,
                                tint = if (formState.type == TransactionType.INCOME)
                                    Color(0xFF2E7D32) else Color.Unspecified,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Income type" +
                                if (formState.type == TransactionType.INCOME) ", selected" else ""
                        },
                    )
                    FilterChip(
                        selected = formState.type == TransactionType.TRANSFER,
                        onClick = { formState = formState.copy(type = TransactionType.TRANSFER) },
                        label = { Text("Transfer") },
                        leadingIcon = {
                            Icon(
                                Icons.Filled.SwapHoriz,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Transfer type" +
                                if (formState.type == TransactionType.TRANSFER) ", selected" else ""
                        },
                    )
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // ── Payee field ──
                OutlinedTextField(
                    value = formState.payee,
                    onValueChange = { formState = formState.copy(payee = it) },
                    label = { Text("Payee") },
                    placeholder = { Text("e.g. Grocery store") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Payee name" },
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // ── Amount field (Venmo-style) ──
                AmountTextField(
                    rawDigits = formState.amountDigits,
                    onRawDigitsChange = { formState = formState.copy(amountDigits = it) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Amount") },
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // ── Status dropdown ──
                ExposedDropdownMenuBox(
                    expanded = statusExpanded,
                    onExpandedChange = { statusExpanded = it },
                    modifier = Modifier.semantics {
                        contentDescription = "Transaction status: ${formState.status.name.lowercase()}"
                    },
                ) {
                    OutlinedTextField(
                        value = formState.status.name.lowercase()
                            .replaceFirstChar { it.uppercase() },
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Status") },
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = statusExpanded)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable),
                    )
                    ExposedDropdownMenu(
                        expanded = statusExpanded,
                        onDismissRequest = { statusExpanded = false },
                    ) {
                        listOf(
                            TransactionStatus.PENDING,
                            TransactionStatus.CLEARED,
                            TransactionStatus.RECONCILED,
                        ).forEach { status ->
                            DropdownMenuItem(
                                text = {
                                    Text(status.name.lowercase().replaceFirstChar { it.uppercase() })
                                },
                                onClick = {
                                    formState = formState.copy(status = status)
                                    statusExpanded = false
                                },
                                modifier = Modifier.semantics {
                                    contentDescription = "Set status to ${status.name.lowercase()}"
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // ── Tags chip input ──
                OutlinedTextField(
                    value = tagInput,
                    onValueChange = { newVal ->
                        // Add tag on comma
                        if (newVal.endsWith(",")) {
                            val tag = newVal.dropLast(1).trim()
                            if (tag.isNotEmpty() && tag !in formState.tags) {
                                formState = formState.copy(tags = formState.tags + tag)
                            }
                            tagInput = ""
                        } else {
                            tagInput = newVal
                        }
                    },
                    label = { Text("Tags") },
                    placeholder = { Text("Type tag, press Enter or comma to add") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .onPreviewKeyEvent { event ->
                            if (event.key == Key.Enter && tagInput.trim().isNotEmpty()) {
                                val tag = tagInput.trim()
                                if (tag !in formState.tags) {
                                    formState = formState.copy(tags = formState.tags + tag)
                                }
                                tagInput = ""
                                true
                            } else {
                                false
                            }
                        }
                        .semantics {
                            contentDescription = "Tags input. " +
                                "Type a tag and press Enter or comma to add. " +
                                "Current tags: ${formState.tags.joinToString(", ").ifEmpty { "none" }}"
                        },
                )

                // Display tag chips
                if (formState.tags.isNotEmpty()) {
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
                        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
                    ) {
                        formState.tags.forEach { tag ->
                            AssistChip(
                                onClick = { /* no-op, use trailing icon to remove */ },
                                label = { Text(tag) },
                                trailingIcon = {
                                    IconButton(
                                        onClick = {
                                            formState = formState.copy(
                                                tags = formState.tags - tag,
                                            )
                                        },
                                        modifier = Modifier
                                            .size(18.dp)
                                            .semantics {
                                                contentDescription = "Remove tag $tag"
                                            },
                                    ) {
                                        Icon(
                                            Icons.Filled.Close,
                                            contentDescription = null,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                },
                                modifier = Modifier.semantics {
                                    contentDescription = "Tag: $tag"
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // ── Note field ──
                OutlinedTextField(
                    value = formState.note,
                    onValueChange = { formState = formState.copy(note = it) },
                    label = { Text("Note (optional)") },
                    placeholder = { Text("Add a note…") },
                    maxLines = 3,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Transaction note" },
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(formState) },
                enabled = formState.payee.isNotBlank() && formState.amountDigits.isNotEmpty(),
            ) {
                Text(if (isEdit) "Save" else "Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
        modifier = Modifier
            .width(480.dp)
            .semantics {
                contentDescription = if (isEdit)
                    "Edit transaction dialog. Fill in details and save."
                else
                    "New transaction dialog. Fill in details and create."
            },
    )
}
