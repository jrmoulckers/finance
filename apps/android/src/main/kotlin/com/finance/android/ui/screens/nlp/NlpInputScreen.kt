// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.nlp

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.nlp.ParseConfidence
import com.finance.models.TransactionType
import org.koin.compose.viewmodel.koinViewModel

/**
 * Enhanced Natural Language Transaction Input screen (#1141).
 *
 * Provides a text field with real-time parse preview, per-field confidence
 * indicators, quick-fix tap-to-correct, merchant suggestion chips from
 * history, multi-language locale-aware parsing, and recent NLP inputs
 * history. TalkBack accessible with WCAG 2.2 AA compliance.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NlpInputScreen(
    onBack: () -> Unit = {},
    onSaved: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: NlpInputViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isSaved) {
        onSaved()
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Quick Add",
                        modifier = Modifier.semantics {
                            contentDescription = "Quick add transaction with natural language"
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
            )
        },
        modifier = modifier,
    ) { padding ->
        NlpInputContent(
            state = state,
            onInputChanged = viewModel::onInputChanged,
            onSuggestionSelected = viewModel::onSuggestionSelected,
            onDismissSuggestions = viewModel::dismissSuggestions,
            onMerchantChipSelected = viewModel::onMerchantChipSelected,
            onRecentInputSelected = viewModel::onRecentInputSelected,
            onFieldTapped = viewModel::startFieldEdit,
            onFieldEditValueChanged = viewModel::onFieldEditValueChanged,
            onFieldEditApply = viewModel::applyFieldEdit,
            onFieldEditCancel = viewModel::cancelFieldEdit,
            onSave = viewModel::saveTransaction,
            onReset = viewModel::reset,
            modifier = Modifier.padding(padding),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun NlpInputContent(
    state: NlpInputUiState,
    onInputChanged: (String) -> Unit,
    onSuggestionSelected: (String) -> Unit,
    onDismissSuggestions: () -> Unit,
    onMerchantChipSelected: (String) -> Unit,
    onRecentInputSelected: (RecentNlpEntry) -> Unit,
    onFieldTapped: (NlpFieldType) -> Unit,
    onFieldEditValueChanged: (String) -> Unit,
    onFieldEditApply: () -> Unit,
    onFieldEditCancel: () -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Input hint card
        item(key = "hint") {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Type something like Coffee at Starbucks 4 dollars 50 cents"
                    },
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ),
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Psychology,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.size(24.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Describe your transaction",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                        Text(
                            "Try: \"Coffee at Starbucks \$4.50\" or \"Salary received \$3000\"",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f),
                        )
                    }
                    // Locale indicator (#1141)
                    if (state.currentLocaleLabel.isNotBlank()) {
                        Icon(
                            Icons.Filled.Language,
                            contentDescription = "Current language: ${state.currentLocaleLabel}",
                            tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.6f),
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }

        // Merchant suggestion chips (#1141)
        if (state.merchantChips.isNotEmpty() && state.parsedAmount == null) {
            item(key = "merchant-chips") {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Store,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Frequent merchants",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics {
                                heading()
                                contentDescription = "Frequent merchant suggestions"
                            },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        state.merchantChips.forEach { merchant ->
                            AssistChip(
                                onClick = { onMerchantChipSelected(merchant) },
                                label = { Text(merchant) },
                                modifier = Modifier.semantics {
                                    contentDescription = "Add merchant: $merchant"
                                },
                            )
                        }
                    }
                }
            }
        }

        // Text input
        item(key = "input") {
            Column {
                OutlinedTextField(
                    value = state.inputText,
                    onValueChange = onInputChanged,
                    label = { Text("Describe your transaction") },
                    placeholder = { Text("Coffee at Starbucks \$4.50 yesterday") },
                    singleLine = false,
                    maxLines = 3,
                    isError = state.errorMessage != null,
                    supportingText = state.errorMessage?.let { { Text(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Transaction description input" },
                )

                // Autocomplete suggestions
                AnimatedVisibility(
                    visible = state.showSuggestions,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Autocomplete suggestions" },
                    ) {
                        Column {
                            state.suggestions.forEach { suggestion ->
                                Text(
                                    text = suggestion,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onSuggestionSelected(suggestion) }
                                        .padding(12.dp)
                                        .semantics {
                                            contentDescription = "Suggestion: $suggestion"
                                        },
                                )
                            }
                        }
                    }
                }
            }
        }

        // Parsing indicator
        if (state.isParsingActive) {
            item(key = "parsing") {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Parsing your input" },
                )
            }
        }

        // Parse preview with per-field confidence and quick-fix (#1141)
        if (state.parsedFields.isNotEmpty()) {
            item(key = "preview-header") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Parsed Result",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Parsed transaction preview"
                        },
                    )
                    Spacer(Modifier.width(8.dp))
                    state.confidence?.let { ConfidenceBadge(it) }
                    Spacer(Modifier.weight(1f))
                    Text(
                        "Tap to correct",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.semantics {
                            contentDescription = "Tap any field below to correct it"
                        },
                    )
                }
            }

            item(key = "preview") {
                EnhancedParsePreviewCard(
                    fields = state.parsedFields,
                    editingField = state.editingField,
                    editingFieldValue = state.editingFieldValue,
                    onFieldTapped = onFieldTapped,
                    onFieldEditValueChanged = onFieldEditValueChanged,
                    onFieldEditApply = onFieldEditApply,
                    onFieldEditCancel = onFieldEditCancel,
                )
            }

            item(key = "save") {
                FilledTonalButton(
                    onClick = onSave,
                    enabled = !state.isSaving,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Save this transaction" },
                ) {
                    if (state.isSaving) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Saving…")
                    } else {
                        Icon(Icons.Filled.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Save Transaction")
                    }
                }
            }
        }

        // Recent NLP inputs history (#1141)
        if (state.showRecentInputs && state.recentInputs.isNotEmpty() && state.parsedFields.isEmpty()) {
            item(key = "recent-header") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.History,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Recent Inputs",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Recent natural language inputs"
                        },
                    )
                }
            }

            items(state.recentInputs, key = { it.timestamp }) { entry ->
                RecentInputCard(
                    entry = entry,
                    onClick = { onRecentInputSelected(entry) },
                )
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

/**
 * Enhanced parse preview card with per-field confidence indicators
 * and quick-fix tap-to-correct functionality (#1141).
 *
 * Each field shows its individual confidence level and can be tapped
 * to open an inline editor for correction.
 */
@Composable
private fun EnhancedParsePreviewCard(
    fields: List<ParsedFieldUi>,
    editingField: NlpFieldType?,
    editingFieldValue: String,
    onFieldTapped: (NlpFieldType) -> Unit,
    onFieldEditValueChanged: (String) -> Unit,
    onFieldEditApply: () -> Unit,
    onFieldEditCancel: () -> Unit,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Parsed transaction with ${fields.size} fields. ")
                    fields.forEach { field ->
                        append("${field.label}: ${field.value}, confidence ${field.confidence.name}. ")
                    }
                }
            },
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            fields.forEach { field ->
                if (editingField == field.fieldType) {
                    // Inline quick-fix editor (#1141)
                    QuickFixEditor(
                        label = field.label,
                        value = editingFieldValue,
                        onValueChanged = onFieldEditValueChanged,
                        onApply = onFieldEditApply,
                        onCancel = onFieldEditCancel,
                    )
                } else {
                    // Display field with confidence and tap-to-correct
                    ParsedFieldWithConfidence(
                        field = field,
                        onTap = { onFieldTapped(field.fieldType) },
                    )
                }
            }
        }
    }
}

/**
 * A single parsed field row with confidence indicator and tap-to-correct (#1141).
 */
@Composable
private fun ParsedFieldWithConfidence(
    field: ParsedFieldUi,
    onTap: () -> Unit,
) {
    val icon = when (field.fieldType) {
        NlpFieldType.AMOUNT -> Icons.Filled.AttachMoney
        NlpFieldType.PAYEE -> Icons.Filled.Person
        NlpFieldType.CATEGORY -> Icons.Filled.Category
        NlpFieldType.DATE -> Icons.Filled.CalendarToday
        NlpFieldType.TYPE -> Icons.Filled.Check
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                onClickLabel = "Edit ${field.label}",
                onClick = onTap,
            )
            .padding(vertical = 4.dp)
            .semantics {
                contentDescription = "${field.label}: ${field.value}, confidence ${field.confidence.name}. Tap to correct."
            },
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                field.label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                field.value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        FieldConfidenceBadge(field.confidence)
        Spacer(Modifier.width(4.dp))
        Icon(
            Icons.Filled.Edit,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier.size(16.dp),
        )
    }
}

/**
 * Inline quick-fix editor for correcting a misparsed field (#1141).
 */
@Composable
private fun QuickFixEditor(
    label: String,
    value: String,
    onValueChanged: (String) -> Unit,
    onApply: () -> Unit,
    onCancel: () -> Unit,
) {
    val focusManager = LocalFocusManager.current

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Editing $label field. Type the correct value."
            },
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChanged,
            label = { Text("Correct $label") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    onApply()
                },
            ),
            modifier = Modifier
                .weight(1f)
                .semantics { contentDescription = "Enter correct $label value" },
        )
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = {
                focusManager.clearFocus()
                onApply()
            },
            modifier = Modifier.semantics { contentDescription = "Apply correction" },
        ) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        IconButton(
            onClick = {
                focusManager.clearFocus()
                onCancel()
            },
            modifier = Modifier.semantics { contentDescription = "Cancel correction" },
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
            )
        }
    }
}

/**
 * Per-field confidence badge with color coding (#1141).
 *
 * Shows HIGH (green), MEDIUM (amber), LOW (red) badges
 * to help the user identify which fields may need correction.
 */
@Composable
private fun FieldConfidenceBadge(confidence: FieldConfidence) {
    val (label, color) = when (confidence) {
        FieldConfidence.HIGH -> "✓" to Color(0xFF2E7D32)
        FieldConfidence.MEDIUM -> "~" to Color(0xFFFF9800)
        FieldConfidence.LOW -> "?" to MaterialTheme.colorScheme.error
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)),
        modifier = Modifier.semantics {
            contentDescription = "Confidence: ${confidence.name.lowercase()}"
        },
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

/**
 * Card displaying a recent NLP input for re-use (#1141).
 */
@Composable
private fun RecentInputCard(
    entry: RecentNlpEntry,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                onClickLabel = "Re-use this input",
                onClick = onClick,
            )
            .semantics {
                contentDescription = "Recent input: ${entry.parsedSummary}. Tap to re-use."
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
    ) {
        Row(
            Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.History,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    entry.inputText,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    entry.parsedSummary,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * Overall confidence badge for the parse result.
 */
@Composable
private fun ConfidenceBadge(confidence: ParseConfidence) {
    val (label, color) = when (confidence) {
        ParseConfidence.HIGH -> "High" to Color(0xFF2E7D32)
        ParseConfidence.MEDIUM -> "Medium" to Color(0xFFFF9800)
        ParseConfidence.LOW -> "Low" to MaterialTheme.colorScheme.error
        ParseConfidence.VERY_LOW -> "Very Low" to MaterialTheme.colorScheme.error
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
        modifier = Modifier.semantics { contentDescription = "Parse confidence: $label" },
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "NLP Enhanced - Active - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "NLP Enhanced - Active - Dark")
@Composable
private fun NlpInputActivePreview() {
    FinanceTheme(dynamicColor = false) {
        NlpInputContent(
            state = NlpInputUiState(
                inputText = "Coffee at Starbucks \$4.50",
                parsedAmount = "\$4.50",
                parsedPayee = "Starbucks",
                parsedCategory = "Food & Drink",
                parsedDate = "2025-01-15",
                parsedType = TransactionType.EXPENSE,
                confidence = ParseConfidence.HIGH,
                currentLocaleLabel = "English",
                merchantChips = listOf("Starbucks", "Walmart", "Amazon"),
                parsedFields = listOf(
                    ParsedFieldUi("Amount", "\$4.50", NlpFieldType.AMOUNT, FieldConfidence.HIGH),
                    ParsedFieldUi("Payee", "Starbucks", NlpFieldType.PAYEE, FieldConfidence.HIGH),
                    ParsedFieldUi("Category", "Food & Drink", NlpFieldType.CATEGORY, FieldConfidence.MEDIUM),
                    ParsedFieldUi("Date", "2025-01-15", NlpFieldType.DATE, FieldConfidence.LOW),
                    ParsedFieldUi("Type", "Expense", NlpFieldType.TYPE, FieldConfidence.HIGH),
                ),
            ),
            onInputChanged = {},
            onSuggestionSelected = {},
            onDismissSuggestions = {},
            onMerchantChipSelected = {},
            onRecentInputSelected = {},
            onFieldTapped = {},
            onFieldEditValueChanged = {},
            onFieldEditApply = {},
            onFieldEditCancel = {},
            onSave = {},
            onReset = {},
        )
    }
}

@Preview(showBackground = true, name = "NLP Enhanced - Empty - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "NLP Enhanced - Empty - Dark")
@Composable
private fun NlpInputEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        NlpInputContent(
            state = NlpInputUiState(
                merchantChips = listOf("Starbucks", "Walmart", "Amazon", "Target", "Uber"),
                currentLocaleLabel = "English",
                recentInputs = listOf(
                    RecentNlpEntry("Coffee at Starbucks \$4.50", "\$4.50 at Starbucks", 1L),
                    RecentNlpEntry("Lunch at Chipotle \$12", "\$12.00 at Chipotle", 2L),
                ),
                showRecentInputs = true,
            ),
            onInputChanged = {},
            onSuggestionSelected = {},
            onDismissSuggestions = {},
            onMerchantChipSelected = {},
            onRecentInputSelected = {},
            onFieldTapped = {},
            onFieldEditValueChanged = {},
            onFieldEditApply = {},
            onFieldEditCancel = {},
            onSave = {},
            onReset = {},
        )
    }
}

@Preview(showBackground = true, name = "NLP Enhanced - Quick Fix - Light")
@Composable
private fun NlpInputQuickFixPreview() {
    FinanceTheme(dynamicColor = false) {
        NlpInputContent(
            state = NlpInputUiState(
                inputText = "Coffee at Starbucks \$4.50",
                parsedAmount = "\$4.50",
                parsedPayee = "Starbucks",
                parsedCategory = "Food & Drink",
                parsedDate = "2025-01-15",
                parsedType = TransactionType.EXPENSE,
                confidence = ParseConfidence.HIGH,
                currentLocaleLabel = "English",
                editingField = NlpFieldType.PAYEE,
                editingFieldValue = "Starbucks Reserve",
                parsedFields = listOf(
                    ParsedFieldUi("Amount", "\$4.50", NlpFieldType.AMOUNT, FieldConfidence.HIGH),
                    ParsedFieldUi("Payee", "Starbucks", NlpFieldType.PAYEE, FieldConfidence.HIGH),
                    ParsedFieldUi("Category", "Food & Drink", NlpFieldType.CATEGORY, FieldConfidence.MEDIUM),
                    ParsedFieldUi("Date", "2025-01-15", NlpFieldType.DATE, FieldConfidence.LOW),
                    ParsedFieldUi("Type", "Expense", NlpFieldType.TYPE, FieldConfidence.HIGH),
                ),
            ),
            onInputChanged = {},
            onSuggestionSelected = {},
            onDismissSuggestions = {},
            onMerchantChipSelected = {},
            onRecentInputSelected = {},
            onFieldTapped = {},
            onFieldEditValueChanged = {},
            onFieldEditApply = {},
            onFieldEditCancel = {},
            onSave = {},
            onReset = {},
        )
    }
}
