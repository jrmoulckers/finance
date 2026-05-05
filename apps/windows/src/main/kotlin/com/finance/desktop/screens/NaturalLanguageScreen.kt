// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.EditingField
import com.finance.desktop.viewmodel.FieldConfidence
import com.finance.desktop.viewmodel.NaturalLanguageUiState
import com.finance.desktop.viewmodel.NaturalLanguageViewModel
import com.finance.desktop.viewmodel.NlSuggestion
import com.finance.desktop.viewmodel.ParsedTransaction
import com.finance.desktop.viewmodel.RecentNlpInput
import com.finance.models.TransactionType

// =============================================================================
// Natural Language Input Screen — Sprint 21 (#237) + Enhancement (#1143)
// =============================================================================

/**
 * Natural Language Transaction Input screen.
 *
 * A smart text field that parses free-form input like
 * "Spent $42.50 at Whole Foods on groceries yesterday" into structured
 * transaction data. Features:
 * - Inline parsing preview with per-field confidence indicators
 * - Merchant suggestion chips from transaction history
 * - Multi-language / locale-aware amount and date parsing
 * - Quick-fix UI — click any parsed field to correct it
 * - Recent NLP inputs history for quick reuse
 *
 * Narrator reads input field, parsed fields, suggestions, confidence, and
 * quick-fix editing state. All interactive elements have contentDescription.
 */
@Composable
fun NaturalLanguageScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<NaturalLanguageViewModel>()
    val state by viewModel.uiState.collectAsState()

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Natural Language Input screen" },
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        // Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Quick Add Transaction",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Quick Add Transaction heading"
                        },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                    Text(
                        text = "Describe a transaction in plain English (or your language)",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                // Recent history toggle
                if (state.recentInputs.isNotEmpty()) {
                    IconButton(
                        onClick = { viewModel.toggleRecentInputs() },
                        modifier = Modifier.semantics {
                            contentDescription = if (state.showRecentInputs) "Hide recent inputs"
                            else "Show recent inputs history"
                            role = Role.Button
                        },
                    ) {
                        Icon(
                            Icons.Filled.History,
                            contentDescription = null,
                            tint = if (state.showRecentInputs) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // Input field with suggestions
        item {
            NlInputField(
                text = state.inputText,
                onTextChange = viewModel::updateInput,
                onClear = viewModel::clearInput,
                suggestions = state.suggestions,
                showSuggestions = state.showSuggestions,
                onSuggestionClick = viewModel::applySuggestion,
                onDismissSuggestions = viewModel::dismissSuggestions,
            )
        }

        // Merchant suggestion chips
        if (state.inputText.isNotBlank() && state.recentPayees.isNotEmpty()) {
            item {
                MerchantSuggestionChips(
                    payees = state.recentPayees.take(6),
                    onChipClick = { payee ->
                        val text = state.inputText
                        val updated = if (text.contains("at ", ignoreCase = true)) text
                        else "$text at $payee"
                        viewModel.updateInput(updated)
                    },
                )
            }
        }

        // Status messages
        item {
            AnimatedVisibility(
                visible = state.successMessage != null,
                enter = fadeIn() + slideInVertically(),
                exit = fadeOut() + slideOutVertically(),
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFF2E7D32).copy(alpha = 0.12f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = state.successMessage ?: "" },
                ) {
                    Row(
                        modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Check, contentDescription = null, tint = Color(0xFF2E7D32))
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = state.successMessage ?: "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF2E7D32),
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = state.errorMessage != null,
                enter = fadeIn() + slideInVertically(),
                exit = fadeOut() + slideOutVertically(),
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.errorContainer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = state.errorMessage ?: "" },
                ) {
                    Row(
                        modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Filled.Error,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = state.errorMessage ?: "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }
        }

        // Parsed preview with per-field confidence and quick-fix
        state.parsedTransaction?.let { parsed ->
            item {
                ParsedPreviewCard(
                    parsed = parsed,
                    isProcessing = state.isProcessing,
                    editingField = state.editingField,
                    editFieldValue = state.editFieldValue,
                    onConfirm = viewModel::createTransaction,
                    onFieldClick = viewModel::startEditingField,
                    onEditValueChange = viewModel::updateEditFieldValue,
                    onEditConfirm = viewModel::confirmFieldEdit,
                    onEditCancel = viewModel::cancelFieldEdit,
                )
            }
        }

        // Recent NLP inputs history
        if (state.showRecentInputs && state.recentInputs.isNotEmpty()) {
            item {
                RecentInputsPanel(
                    recentInputs = state.recentInputs,
                    onReuse = viewModel::reuseRecentInput,
                )
            }
        }

        // Hint examples
        item {
            ExampleHints()
        }
    }
}

// ─── Merchant suggestion chips ───────────────────────────────────────────────

/**
 * Row of suggestion chips showing recent merchants for quick auto-complete.
 * Narrator reads each chip as "Suggest merchant: {name}".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MerchantSuggestionChips(
    payees: List<String>,
    onChipClick: (String) -> Unit,
) {
    Column {
        Text(
            text = "Suggested Merchants",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
        ) {
            payees.forEach { payee ->
                AssistChip(
                    onClick = { onChipClick(payee) },
                    label = { Text(payee) },
                    leadingIcon = {
                        Icon(
                            Icons.Filled.Store,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Suggest merchant: $payee"
                        role = Role.Button
                    },
                )
            }
        }
    }
}

// ─── Input field with suggestions ────────────────────────────────────────────

@Composable
private fun NlInputField(
    text: String,
    onTextChange: (String) -> Unit,
    onClear: () -> Unit,
    suggestions: List<NlSuggestion>,
    showSuggestions: Boolean,
    onSuggestionClick: (NlSuggestion) -> Unit,
    onDismissSuggestions: () -> Unit,
) {
    Column {
        OutlinedTextField(
            value = text,
            onValueChange = onTextChange,
            label = { Text("Type a transaction…") },
            placeholder = { Text("e.g. Spent \$42.50 at Whole Foods on groceries yesterday") },
            leadingIcon = {
                Icon(
                    Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            },
            trailingIcon = {
                if (text.isNotEmpty()) {
                    IconButton(
                        onClick = onClear,
                        modifier = Modifier.semantics {
                            contentDescription = "Clear input"
                            role = Role.Button
                        },
                    ) {
                        Icon(Icons.Filled.Clear, contentDescription = null)
                    }
                }
            },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Natural language transaction input" },
        )

        // Autocomplete suggestions dropdown
        AnimatedVisibility(visible = showSuggestions && suggestions.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
            ) {
                Column {
                    suggestions.forEach { suggestion ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSuggestionClick(suggestion) }
                                .padding(
                                    horizontal = FinanceDesktopTheme.spacing.lg,
                                    vertical = FinanceDesktopTheme.spacing.md,
                                )
                                .semantics {
                                    contentDescription = "${suggestion.type}: ${suggestion.text}"
                                    role = Role.Button
                                },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val icon = when (suggestion.type) {
                                "payee" -> Icons.Filled.Store
                                "category" -> Icons.Filled.Category
                                else -> Icons.Filled.AutoAwesome
                            }
                            Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                            Column {
                                Text(
                                    text = suggestion.text,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    text = suggestion.type.replaceFirstChar { it.uppercase() },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (suggestion != suggestions.last()) {
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = FinanceDesktopTheme.spacing.lg),
                                color = MaterialTheme.colorScheme.outlineVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── Parsed preview card with per-field confidence + quick-fix ───────────────

/**
 * Enhanced parsed preview card showing:
 * - Overall confidence bar
 * - Per-field confidence indicators (colored dots)
 * - Click-to-edit (quick-fix) on any parsed field
 * - Inline edit mode with confirm/cancel
 *
 * Narrator reads the full preview, per-field confidence, and edit state.
 */
@Composable
private fun ParsedPreviewCard(
    parsed: ParsedTransaction,
    isProcessing: Boolean,
    editingField: EditingField,
    editFieldValue: String,
    onConfirm: () -> Unit,
    onFieldClick: (EditingField) -> Unit,
    onEditValueChange: (String) -> Unit,
    onEditConfirm: () -> Unit,
    onEditCancel: () -> Unit,
) {
    val confidenceColor = when {
        parsed.confidence >= 0.7f -> Color(0xFF2E7D32)
        parsed.confidence >= 0.4f -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.error
    }
    val confidenceLabel = when {
        parsed.confidence >= 0.7f -> "High"
        parsed.confidence >= 0.4f -> "Medium"
        else -> "Low"
    }
    val pct = (parsed.confidence * 100).toInt()

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Parsed transaction preview. ")
                    append("Overall confidence: $pct percent. ")
                    parsed.amount?.let { append("Amount: ${it.amount / 100.0}. ") }
                    parsed.payee?.let { append("Payee: $it. ") }
                    parsed.category?.let { append("Category: $it. ") }
                    parsed.date?.let { append("Date: $it. ") }
                    append("Type: ${parsed.type.name}. ")
                    append("Click any field to correct it.")
                }
            },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
            // Title + overall confidence
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Parsed Transaction",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "$confidenceLabel ($pct%)",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = confidenceColor,
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    LinearProgressIndicator(
                        progress = { parsed.confidence },
                        modifier = Modifier
                            .width(80.dp)
                            .height(4.dp),
                        color = confidenceColor,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                        strokeCap = StrokeCap.Round,
                    )
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Click any field to correct it",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Parsed fields grid with per-field confidence and quick-fix
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
            ) {
                EditableParsedField(
                    icon = Icons.Filled.Payment,
                    label = "Amount",
                    value = parsed.amount?.let {
                        "$${String.format("%.2f", it.amount / 100.0)}"
                    } ?: "—",
                    isPresent = parsed.amount != null,
                    fieldConfidence = parsed.amountConfidence,
                    isEditing = editingField == EditingField.AMOUNT,
                    editValue = editFieldValue,
                    onFieldClick = { onFieldClick(EditingField.AMOUNT) },
                    onEditValueChange = onEditValueChange,
                    onEditConfirm = onEditConfirm,
                    onEditCancel = onEditCancel,
                    modifier = Modifier.weight(1f),
                )
                EditableParsedField(
                    icon = Icons.Filled.Store,
                    label = "Payee",
                    value = parsed.payee ?: "—",
                    isPresent = parsed.payee != null,
                    fieldConfidence = parsed.payeeConfidence,
                    isEditing = editingField == EditingField.PAYEE,
                    editValue = editFieldValue,
                    onFieldClick = { onFieldClick(EditingField.PAYEE) },
                    onEditValueChange = onEditValueChange,
                    onEditConfirm = onEditConfirm,
                    onEditCancel = onEditCancel,
                    modifier = Modifier.weight(1f),
                )
                EditableParsedField(
                    icon = Icons.Filled.Category,
                    label = "Category",
                    value = parsed.category ?: "—",
                    isPresent = parsed.category != null,
                    fieldConfidence = parsed.categoryConfidence,
                    isEditing = editingField == EditingField.CATEGORY,
                    editValue = editFieldValue,
                    onFieldClick = { onFieldClick(EditingField.CATEGORY) },
                    onEditValueChange = onEditValueChange,
                    onEditConfirm = onEditConfirm,
                    onEditCancel = onEditCancel,
                    modifier = Modifier.weight(1f),
                )
                EditableParsedField(
                    icon = Icons.Filled.CalendarToday,
                    label = "Date",
                    value = parsed.date?.toString() ?: "Today",
                    isPresent = parsed.date != null,
                    fieldConfidence = parsed.dateConfidence,
                    isEditing = editingField == EditingField.DATE,
                    editValue = editFieldValue,
                    onFieldClick = { onFieldClick(EditingField.DATE) },
                    onEditValueChange = onEditValueChange,
                    onEditConfirm = onEditConfirm,
                    onEditCancel = onEditCancel,
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

            // Type indicator + confirm button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (parsed.type == TransactionType.EXPENSE)
                            MaterialTheme.colorScheme.errorContainer
                        else Color(0xFF2E7D32).copy(alpha = 0.12f),
                        modifier = Modifier.clickable { onFieldClick(EditingField.TYPE) }
                            .semantics {
                                contentDescription = "Transaction type: ${parsed.type.name}. Click to change."
                                role = Role.Button
                            },
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = parsed.type.name.lowercase()
                                    .replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                                color = if (parsed.type == TransactionType.EXPENSE)
                                    MaterialTheme.colorScheme.onErrorContainer
                                else Color(0xFF2E7D32),
                            )
                            Spacer(Modifier.width(4.dp))
                            Icon(
                                Icons.Filled.SwapVert,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = if (parsed.type == TransactionType.EXPENSE)
                                    MaterialTheme.colorScheme.onErrorContainer
                                else Color(0xFF2E7D32),
                            )
                        }
                    }
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    ConfidenceDot(parsed.typeConfidence)
                }
                Button(
                    onClick = onConfirm,
                    enabled = parsed.amount != null && !isProcessing &&
                        editingField == EditingField.NONE,
                    modifier = Modifier.semantics {
                        contentDescription = "Create transaction"
                        role = Role.Button
                    },
                ) {
                    if (isProcessing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(Icons.Filled.Send, contentDescription = null)
                    }
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Create Transaction")
                }
            }
        }
    }
}

// ─── Editable parsed field with confidence dot ───────────────────────────────

/**
 * A parsed field that shows a confidence indicator dot and supports
 * click-to-edit (quick-fix). When clicked, an inline text field appears
 * for the user to correct the value.
 *
 * Narrator reads field label, value, confidence level, and edit state.
 */
@Composable
private fun EditableParsedField(
    icon: ImageVector,
    label: String,
    value: String,
    isPresent: Boolean,
    fieldConfidence: FieldConfidence,
    isEditing: Boolean,
    editValue: String,
    onFieldClick: () -> Unit,
    onEditValueChange: (String) -> Unit,
    onEditConfirm: () -> Unit,
    onEditCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentColor = if (isPresent)
        MaterialTheme.colorScheme.onSurface
    else
        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)

    val confidenceText = when (fieldConfidence) {
        FieldConfidence.HIGH -> "high confidence"
        FieldConfidence.MEDIUM -> "medium confidence"
        FieldConfidence.LOW -> "low confidence"
        FieldConfidence.NONE -> "not detected"
    }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = !isEditing) { onFieldClick() }
            .background(
                if (isEditing) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                else Color.Transparent,
            )
            .padding(FinanceDesktopTheme.spacing.sm)
            .semantics {
                contentDescription = "$label: $value, $confidenceText. Click to edit."
                role = Role.Button
            },
    ) {
        // Label row with confidence dot
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isPresent) MaterialTheme.colorScheme.primary else contentColor,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
            ConfidenceDot(fieldConfidence)
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))

        if (isEditing) {
            // Inline edit mode
            OutlinedTextField(
                value = editValue,
                onValueChange = onEditValueChange,
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Edit $label value" },
                textStyle = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(
                    onClick = onEditConfirm,
                    modifier = Modifier
                        .size(28.dp)
                        .semantics {
                            contentDescription = "Confirm $label edit"
                            role = Role.Button
                        },
                ) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = Color(0xFF2E7D32),
                    )
                }
                IconButton(
                    onClick = onEditCancel,
                    modifier = Modifier
                        .size(28.dp)
                        .semantics {
                            contentDescription = "Cancel $label edit"
                            role = Role.Button
                        },
                ) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
        } else {
            // Display mode with edit hint
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isPresent) FontWeight.SemiBold else FontWeight.Normal,
                    color = contentColor,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Icon(
                    Icons.Filled.Edit,
                    contentDescription = null,
                    modifier = Modifier.size(12.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                )
            }
        }
    }
}

// ─── Confidence dot indicator ────────────────────────────────────────────────

/**
 * Small colored dot indicating the confidence level of a parsed field.
 * Green = high, yellow = medium, red = low, gray = not detected.
 */
@Composable
private fun ConfidenceDot(confidence: FieldConfidence) {
    val color = when (confidence) {
        FieldConfidence.HIGH -> Color(0xFF2E7D32)
        FieldConfidence.MEDIUM -> Color(0xFFF9A825)
        FieldConfidence.LOW -> MaterialTheme.colorScheme.error
        FieldConfidence.NONE -> MaterialTheme.colorScheme.outlineVariant
    }
    val label = when (confidence) {
        FieldConfidence.HIGH -> "High confidence"
        FieldConfidence.MEDIUM -> "Medium confidence"
        FieldConfidence.LOW -> "Low confidence"
        FieldConfidence.NONE -> "Not detected"
    }
    Box(
        modifier = Modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(color)
            .semantics { contentDescription = label },
    )
}

// ─── Recent NLP inputs history panel ─────────────────────────────────────────

/**
 * Expandable panel showing recently submitted NLP inputs.
 * The user can click any entry to reuse it in the input field.
 *
 * Narrator reads each entry as "Recent input: {text}, {amount}".
 */
@Composable
private fun RecentInputsPanel(
    recentInputs: List<RecentNlpInput>,
    onReuse: (RecentNlpInput) -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = "Recent Inputs",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Recent NLP inputs history"
                },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            recentInputs.forEachIndexed { index, input ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onReuse(input) }
                        .padding(
                            horizontal = FinanceDesktopTheme.spacing.md,
                            vertical = FinanceDesktopTheme.spacing.sm,
                        )
                        .semantics {
                            contentDescription = "Recent input: ${input.rawInput}, ${input.amount}. Click to reuse."
                            role = Role.Button
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = input.rawInput,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Row {
                            input.payee?.let {
                                Text(
                                    text = it,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                            }
                            Text(
                                text = input.amount,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Icon(
                        Icons.Filled.History,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (index < recentInputs.lastIndex) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = FinanceDesktopTheme.spacing.md),
                        color = MaterialTheme.colorScheme.outlineVariant,
                    )
                }
            }
        }
    }
}

// ─── Example hints ───────────────────────────────────────────────────────────

@Composable
private fun ExampleHints() {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = "Examples",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            val examples = listOf(
                "Spent \$42.50 at Whole Foods on groceries yesterday",
                "Paid \$1,200 to landlord for rent today",
                "Earned \$3,500 from salary",
                "Coffee at Starbucks \$5.75",
                "\$25 Amazon for books",
                "Gasté €15,50 en café ayer",
                "Payé 30€ à Carrefour pour courses",
            )
            examples.forEach { example ->
                Text(
                    text = "• $example",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(vertical = 2.dp)
                        .semantics { contentDescription = "Example: $example" },
                )
            }
        }
    }
}
