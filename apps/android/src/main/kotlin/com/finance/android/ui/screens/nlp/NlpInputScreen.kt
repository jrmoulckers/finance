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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Save
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.nlp.ParseConfidence
import com.finance.models.TransactionType
import org.koin.compose.viewmodel.koinViewModel

/**
 * Natural Language Transaction Input screen (#1118).
 *
 * Provides a text field with real-time parse preview, autocomplete dropdown,
 * and confidence indicator. Supports "Coffee at Starbucks $4.50" → structured
 * transaction creation. TalkBack accessible.
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
            onSave = viewModel::saveTransaction,
            onReset = viewModel::reset,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
internal fun NlpInputContent(
    state: NlpInputUiState,
    onInputChanged: (String) -> Unit,
    onSuggestionSelected: (String) -> Unit,
    onDismissSuggestions: () -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
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
                    Column {
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

        // Parse preview
        if (state.parsedAmount != null) {
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
                }
            }

            item(key = "preview") {
                ParsePreviewCard(
                    amount = state.parsedAmount,
                    payee = state.parsedPayee,
                    category = state.parsedCategory,
                    date = state.parsedDate,
                    type = state.parsedType,
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

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun ParsePreviewCard(
    amount: String?,
    payee: String?,
    category: String?,
    date: String?,
    type: TransactionType?,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Parsed transaction: ")
                    amount?.let { append("Amount $it. ") }
                    payee?.let { append("Payee $it. ") }
                    category?.let { append("Category $it. ") }
                    date?.let { append("Date $it. ") }
                    type?.let { append("Type ${it.name}. ") }
                }
            },
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            amount?.let {
                ParsedField(Icons.Filled.AttachMoney, "Amount", it)
            }
            payee?.let {
                ParsedField(Icons.Filled.Person, "Payee", it)
            }
            category?.let {
                ParsedField(Icons.Filled.Category, "Category", it)
            }
            date?.let {
                ParsedField(Icons.Filled.CalendarToday, "Date", it)
            }
            type?.let {
                val typeLabel = it.name.lowercase().replaceFirstChar { c -> c.uppercaseChar() }
                ParsedField(Icons.Filled.Check, "Type", typeLabel)
            }
        }
    }
}

@Composable
private fun ParsedField(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        }
    }
}

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

@Preview(showBackground = true, name = "NLP Input - Active - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "NLP Input - Active - Dark")
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
            ),
            onInputChanged = {},
            onSuggestionSelected = {},
            onDismissSuggestions = {},
            onSave = {},
            onReset = {},
        )
    }
}

@Preview(showBackground = true, name = "NLP Input - Empty - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "NLP Input - Empty - Dark")
@Composable
private fun NlpInputEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        NlpInputContent(
            state = NlpInputUiState(),
            onInputChanged = {},
            onSuggestionSelected = {},
            onDismissSuggestions = {},
            onSave = {},
            onReset = {},
        )
    }
}
