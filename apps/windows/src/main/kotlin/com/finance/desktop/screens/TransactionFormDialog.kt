// SPDX-License-Identifier: BUSL-1.1

// Multiple public declarations: TransactionFormState data class + TransactionFormDialog composable
@file:Suppress("MatchingDeclarationName")

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
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.Alignment
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
    val isBnplLiability: Boolean = tags.contains(BNPL_TAG),
    val bnplInstallmentCount: String = tags.firstOrNull { it.startsWith(BNPL_INSTALLMENTS_PREFIX) }
        ?.removePrefix(BNPL_INSTALLMENTS_PREFIX) ?: "4",
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
                TransactionTypeToggle(
                    selectedType = formState.type,
                    onTypeSelected = { formState = formState.copy(type = it) },
                )

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
                TransactionStatusDropdown(
                    status = formState.status,
                    expanded = statusExpanded,
                    onExpandedChange = { statusExpanded = it },
                    onStatusSelected = {
                        formState = formState.copy(status = it)
                        statusExpanded = false
                    },
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = formState.isBnplLiability,
                        onCheckedChange = { checked -> formState = formState.copy(isBnplLiability = checked) },
                    )
                    Text("Track as BNPL liability")
                }
                if (formState.isBnplLiability) {
                    OutlinedTextField(
                        value = formState.bnplInstallmentCount,
                        onValueChange = { formState = formState.copy(bnplInstallmentCount = it.filter(Char::isDigit).take(2)) },
                        label = { Text("Installments") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "BNPL installment count" },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                }

                // ── Tags chip input ──
                TransactionTagInput(
                    tags = formState.tags,
                    tagInput = tagInput,
                    onTagInputChange = { tagInput = it },
                    onTagAdded = { tag ->
                        if (tag !in formState.tags) {
                            formState = formState.copy(tags = formState.tags + tag)
                        }
                        tagInput = ""
                    },
                    onTagRemoved = { tag ->
                        formState = formState.copy(tags = formState.tags - tag)
                    },
                )

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
                onClick = { onSave(formState.withBnplTags()) },
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

private const val BNPL_TAG = "bnpl"
private const val BNPL_INSTALLMENTS_PREFIX = "bnpl-installments:"

private fun TransactionFormState.withBnplTags(): TransactionFormState {
    val cleanTags = tags.filterNot { it == BNPL_TAG || it.startsWith(BNPL_INSTALLMENTS_PREFIX) }
    val liabilityTags = if (isBnplLiability) listOf(BNPL_TAG, "$BNPL_INSTALLMENTS_PREFIX$bnplInstallmentCount") else emptyList()
    return copy(tags = cleanTags + liabilityTags)
}

/**
 * Transaction type toggle (Expense / Income / Transfer).
 */
@Composable
private fun TransactionTypeToggle(
    selectedType: TransactionType,
    onTypeSelected: (TransactionType) -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
    ) {
        FilterChip(
            selected = selectedType == TransactionType.EXPENSE,
            onClick = { onTypeSelected(TransactionType.EXPENSE) },
            label = { Text("Expense") },
            leadingIcon = {
                Icon(
                    Icons.AutoMirrored.Filled.TrendingDown,
                    contentDescription = null,
                    tint = if (selectedType == TransactionType.EXPENSE)
                        MaterialTheme.colorScheme.error else Color.Unspecified,
                    modifier = Modifier.size(16.dp),
                )
            },
            modifier = Modifier.semantics {
                contentDescription = "Expense type" +
                    if (selectedType == TransactionType.EXPENSE) ", selected" else ""
            },
        )
        FilterChip(
            selected = selectedType == TransactionType.INCOME,
            onClick = { onTypeSelected(TransactionType.INCOME) },
            label = { Text("Income") },
            leadingIcon = {
                Icon(
                    Icons.AutoMirrored.Filled.TrendingUp,
                    contentDescription = null,
                    tint = if (selectedType == TransactionType.INCOME)
                        Color(0xFF2E7D32) else Color.Unspecified,
                    modifier = Modifier.size(16.dp),
                )
            },
            modifier = Modifier.semantics {
                contentDescription = "Income type" +
                    if (selectedType == TransactionType.INCOME) ", selected" else ""
            },
        )
        FilterChip(
            selected = selectedType == TransactionType.TRANSFER,
            onClick = { onTypeSelected(TransactionType.TRANSFER) },
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
                    if (selectedType == TransactionType.TRANSFER) ", selected" else ""
            },
        )
    }
}

/**
 * Transaction status dropdown selector.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransactionStatusDropdown(
    status: TransactionStatus,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onStatusSelected: (TransactionStatus) -> Unit,
) {
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = onExpandedChange,
        modifier = Modifier.semantics {
            contentDescription = "Transaction status: ${status.name.lowercase()}"
        },
    ) {
        OutlinedTextField(
            value = status.name.lowercase().replaceFirstChar { it.uppercase() },
            onValueChange = {},
            readOnly = true,
            label = { Text("Status") },
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { onExpandedChange(false) },
        ) {
            listOf(
                TransactionStatus.PENDING,
                TransactionStatus.CLEARED,
                TransactionStatus.RECONCILED,
            ).forEach { s ->
                DropdownMenuItem(
                    text = {
                        Text(s.name.lowercase().replaceFirstChar { it.uppercase() })
                    },
                    onClick = { onStatusSelected(s) },
                    modifier = Modifier.semantics {
                        contentDescription = "Set status to ${s.name.lowercase()}"
                    },
                )
            }
        }
    }
}

/**
 * Tag input field with chip display for the transaction form.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TransactionTagInput(
    tags: List<String>,
    tagInput: String,
    onTagInputChange: (String) -> Unit,
    onTagAdded: (String) -> Unit,
    onTagRemoved: (String) -> Unit,
) {
    OutlinedTextField(
        value = tagInput,
        onValueChange = { newVal ->
            if (newVal.endsWith(",")) {
                val tag = newVal.dropLast(1).trim()
                if (tag.isNotEmpty()) onTagAdded(tag)
            } else {
                onTagInputChange(newVal)
            }
        },
        label = { Text("Tags") },
        placeholder = { Text("Type tag, press Enter or comma to add") },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .onPreviewKeyEvent { event ->
                if (event.key == Key.Enter && tagInput.trim().isNotEmpty()) {
                    onTagAdded(tagInput.trim())
                    true
                } else {
                    false
                }
            }
            .semantics {
                contentDescription = "Tags input. " +
                    "Type a tag and press Enter or comma to add. " +
                    "Current tags: ${tags.joinToString(", ").ifEmpty { "none" }}"
            },
    )

    if (tags.isNotEmpty()) {
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
        ) {
            tags.forEach { tag ->
                AssistChip(
                    onClick = { /* no-op, use trailing icon to remove */ },
                    label = { Text(tag) },
                    trailingIcon = {
                        IconButton(
                            onClick = { onTagRemoved(tag) },
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
}
