// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.nlp

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Natural language transaction input screen (#237).
 *
 * Allows users to type or speak transactions in plain language like
 * "Coffee at Starbucks $4.50 yesterday" and see parsed results in real time.
 *
 * @param onBack Navigation callback.
 * @param onTransactionConfirmed Callback when the user confirms a parsed transaction.
 * @param viewModel The [NlpTransactionViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NlpTransactionScreen(
    onBack: () -> Unit = {},
    onTransactionConfirmed: (ParsedTransaction) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: NlpTransactionViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isConfirmed && state.parsedTransaction != null) {
        onTransactionConfirmed(state.parsedTransaction!!)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Quick Add",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Quick Add transaction screen"
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
        NlpTransactionContent(
            state = state,
            examplePhrases = viewModel.examplePhrases,
            onInputChanged = viewModel::onInputChanged,
            onApplySuggestion = viewModel::applySuggestion,
            onConfirm = viewModel::confirmParsed,
            onReset = viewModel::reset,
            modifier = Modifier.padding(padding),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun NlpTransactionContent(
    state: NlpInputUiState,
    examplePhrases: List<String>,
    onInputChanged: (String) -> Unit,
    onApplySuggestion: (String) -> Unit,
    onConfirm: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Instruction text
        Text(
            text = "Type a transaction in your own words. We'll figure out the details.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "Type a transaction in your own words. We'll figure out the details."
            },
        )

        // Input field
        OutlinedTextField(
            value = state.inputText,
            onValueChange = onInputChanged,
            label = { Text("Describe your transaction") },
            placeholder = { Text("e.g., Coffee at Starbucks $4.50") },
            trailingIcon = {
                IconButton(
                    onClick = { /* TODO: Voice input via SpeechRecognizer */ },
                    modifier = Modifier.semantics {
                        contentDescription = "Voice input — coming soon"
                    },
                ) {
                    Icon(Icons.Filled.Mic, contentDescription = null)
                }
            },
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    if (state.parsedTransaction != null) onConfirm()
                },
            ),
            singleLine = false,
            maxLines = 3,
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Enter transaction description in natural language"
                },
        )

        // Example phrases as chips
        AnimatedVisibility(
            visible = state.inputText.isEmpty(),
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            Column {
                Text(
                    text = "Try saying:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Example phrases you can try"
                    },
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    examplePhrases.forEach { phrase ->
                        AssistChip(
                            onClick = { onApplySuggestion(phrase) },
                            label = { Text(phrase, style = MaterialTheme.typography.labelSmall) },
                            modifier = Modifier.semantics {
                                contentDescription = "Example: $phrase. Tap to use."
                            },
                        )
                    }
                }
            }
        }

        // Parsed result preview
        AnimatedVisibility(
            visible = state.parsedTransaction != null,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            state.parsedTransaction?.let { parsed ->
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Confidence indicator
                    ConfidenceIndicator(parsed.confidence)

                    // Parsed fields card
                    ParsedFieldsCard(parsed)

                    // Action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        FilledTonalButton(
                            onClick = {
                                focusManager.clearFocus()
                                onConfirm()
                            },
                            modifier = Modifier
                                .weight(1f)
                                .semantics {
                                    contentDescription = "Confirm and add this transaction"
                                },
                        ) {
                            Icon(Icons.Filled.Check, null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Add Transaction")
                        }
                        FilledTonalButton(
                            onClick = onReset,
                            modifier = Modifier.semantics {
                                contentDescription = "Clear and start over"
                            },
                        ) {
                            Icon(Icons.Filled.Refresh, null, Modifier.size(18.dp))
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun ConfidenceIndicator(confidence: Float) {
    val color = when {
        confidence >= 0.7f -> Color(0xFF2E7D32)
        confidence >= 0.4f -> Color(0xFFFF9800)
        else -> MaterialTheme.colorScheme.error
    }
    val label = when {
        confidence >= 0.7f -> "High confidence"
        confidence >= 0.4f -> "Medium confidence"
        else -> "Low confidence — please review"
    }

    Column(
        modifier = Modifier.semantics {
            contentDescription = "Parse confidence: ${(confidence * 100).toInt()} percent. $label"
        },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = color,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = "${(confidence * 100).toInt()}%",
                style = MaterialTheme.typography.labelSmall,
                color = color,
            )
        }
        Spacer(Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { confidence },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp),
            color = color,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
    }
}

@Composable
private fun ParsedFieldsCard(parsed: ParsedTransaction) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Parsed transaction: ")
                    parsed.amount?.let { append("Amount: dollar ${String.format("%.2f", it)}. ") }
                    parsed.payee?.let { append("Payee: $it. ") }
                    parsed.category?.let { append("Category: $it. ") }
                    parsed.date?.let { append("Date: $it. ") }
                    append("Type: ${parsed.type.name.lowercase()}.")
                }
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "We parsed:",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(12.dp))

            parsed.amount?.let { amount ->
                ParsedFieldRow(
                    icon = null,
                    label = "Amount",
                    value = "$${String.format("%.2f", amount)}",
                    valueColor = if (parsed.type == TransactionNlpType.INCOME) Color(0xFF2E7D32)
                    else MaterialTheme.colorScheme.error,
                )
            }
            parsed.payee?.let {
                ParsedFieldRow(icon = Icons.Filled.Person, label = "Payee", value = it)
            }
            parsed.category?.let {
                ParsedFieldRow(icon = Icons.Filled.Category, label = "Category", value = it)
            }
            parsed.date?.let {
                ParsedFieldRow(icon = Icons.Filled.CalendarToday, label = "Date", value = it.toString())
            }
            ParsedFieldRow(
                icon = null,
                label = "Type",
                value = parsed.type.name.lowercase().replaceFirstChar { it.uppercase() },
            )
        }
    }
}

@Composable
private fun ParsedFieldRow(
    icon: ImageVector?,
    label: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics { contentDescription = "$label: $value" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = "$label: ",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = valueColor,
        )
    }
}

// ── Previews ────────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "NLP Input - Empty")
@Composable
private fun NlpEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        NlpTransactionContent(
            state = NlpInputUiState(showSuggestions = true),
            examplePhrases = listOf("Coffee at Starbucks $4.50", "Lunch $12", "Uber $15 yesterday"),
            onInputChanged = {},
            onApplySuggestion = {},
            onConfirm = {},
            onReset = {},
        )
    }
}

@Preview(showBackground = true, showSystemUi = true, name = "NLP Input - Parsed")
@Composable
private fun NlpParsedPreview() {
    FinanceTheme(dynamicColor = false) {
        NlpTransactionContent(
            state = NlpInputUiState(
                inputText = "Coffee at Starbucks $4.50 yesterday",
                parsedTransaction = ParsedTransaction(
                    amount = 4.50,
                    payee = "Starbucks",
                    category = "Dining",
                    type = TransactionNlpType.EXPENSE,
                    confidence = 0.9f,
                    rawInput = "Coffee at Starbucks $4.50 yesterday",
                ),
            ),
            examplePhrases = emptyList(),
            onInputChanged = {},
            onApplySuggestion = {},
            onConfirm = {},
            onReset = {},
        )
    }
}
