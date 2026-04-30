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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Store
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.NaturalLanguageUiState
import com.finance.desktop.viewmodel.NaturalLanguageViewModel
import com.finance.desktop.viewmodel.NlSuggestion
import com.finance.desktop.viewmodel.ParsedTransaction
import com.finance.models.TransactionType

// =============================================================================
// Natural Language Input Screen — Sprint 21 (#237)
// =============================================================================

/**
 * Natural Language Transaction Input screen.
 *
 * A smart text field that parses free-form input like
 * "Spent $42.50 at Whole Foods on groceries yesterday" into structured
 * transaction data. Shows a live parsing preview, autocomplete suggestions,
 * and a confidence indicator.
 *
 * Narrator reads input field, parsed fields, suggestions, and confidence.
 */
@Composable
fun NaturalLanguageScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<NaturalLanguageViewModel>()
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Natural Language Input screen" },
    ) {
        // Header
        Text(
            text = "Quick Add Transaction",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Quick Add Transaction heading"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Text(
            text = "Describe a transaction in plain English",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Input field with suggestions
        NlInputField(
            text = state.inputText,
            onTextChange = viewModel::updateInput,
            onClear = viewModel::clearInput,
            suggestions = state.suggestions,
            showSuggestions = state.showSuggestions,
            onSuggestionClick = viewModel::applySuggestion,
            onDismissSuggestions = viewModel::dismissSuggestions,
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Status messages
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
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        tint = Color(0xFF2E7D32),
                    )
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

        // Parsed preview
        state.parsedTransaction?.let { parsed ->
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
            ParsedPreviewCard(
                parsed = parsed,
                isProcessing = state.isProcessing,
                onConfirm = viewModel::createTransaction,
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Hint examples
        ExampleHints()
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

// ─── Parsed preview card ─────────────────────────────────────────────────────

@Composable
private fun ParsedPreviewCard(
    parsed: ParsedTransaction,
    isProcessing: Boolean,
    onConfirm: () -> Unit,
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
                    append("Confidence: $pct percent. ")
                    parsed.amount?.let { append("Amount: ${it.amount / 100.0}. ") }
                    parsed.payee?.let { append("Payee: $it. ") }
                    parsed.category?.let { append("Category: $it. ") }
                    parsed.date?.let { append("Date: $it. ") }
                    append("Type: ${parsed.type.name}.")
                }
            },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
            // Title + confidence
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

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Parsed fields grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
            ) {
                ParsedField(
                    icon = Icons.Filled.Payment,
                    label = "Amount",
                    value = parsed.amount?.let {
                        "$${String.format("%.2f", it.amount / 100.0)}"
                    } ?: "—",
                    isPresent = parsed.amount != null,
                    modifier = Modifier.weight(1f),
                )
                ParsedField(
                    icon = Icons.Filled.Store,
                    label = "Payee",
                    value = parsed.payee ?: "—",
                    isPresent = parsed.payee != null,
                    modifier = Modifier.weight(1f),
                )
                ParsedField(
                    icon = Icons.Filled.Category,
                    label = "Category",
                    value = parsed.category ?: "—",
                    isPresent = parsed.category != null,
                    modifier = Modifier.weight(1f),
                )
                ParsedField(
                    icon = Icons.Filled.CalendarToday,
                    label = "Date",
                    value = parsed.date?.toString() ?: "Today",
                    isPresent = parsed.date != null,
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
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (parsed.type == TransactionType.EXPENSE)
                        MaterialTheme.colorScheme.errorContainer
                    else Color(0xFF2E7D32).copy(alpha = 0.12f),
                ) {
                    Text(
                        text = parsed.type.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = if (parsed.type == TransactionType.EXPENSE)
                            MaterialTheme.colorScheme.onErrorContainer
                        else Color(0xFF2E7D32),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
                Button(
                    onClick = onConfirm,
                    enabled = parsed.amount != null && !isProcessing,
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

@Composable
private fun ParsedField(
    icon: ImageVector,
    label: String,
    value: String,
    isPresent: Boolean,
    modifier: Modifier = Modifier,
) {
    val contentColor = if (isPresent)
        MaterialTheme.colorScheme.onSurface
    else
        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)

    Column(
        modifier = modifier.semantics {
            contentDescription = "$label: $value"
        },
    ) {
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
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (isPresent) FontWeight.SemiBold else FontWeight.Normal,
            color = contentColor,
        )
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
