// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

import java.util.Locale
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme

/**
 * Voice transaction review screen (#2383).
 *
 * Shows the parsed draft, asks native prompts for missing/ambiguous fields,
 * and requires explicit confirmation before saving. The actual speech capture
 * and Assistant App Action wiring are device-only and live outside this screen.
 *
 * @param state Current review state from [VoiceTransactionViewModel].
 * @param onPromptResolved Called with the user's answer to the current prompt.
 * @param onConfirm Called when the user confirms the reviewed draft.
 * @param onCancel Called when the user abandons the session.
 * @param onBack Navigation callback.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceTransactionScreen(
    state: VoiceEntryUiState,
    onPromptResolved: (String) -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Voice Transaction",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Voice transaction review screen"
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (state.isOfflineDraft) {
                OfflineBanner()
            }

            ConfidenceBar(state.overallConfidence)

            when (val prompt = state.currentPrompt) {
                null -> {
                    DraftSummaryCard(state.draft)
                    ReviewActions(
                        canSave = state.canSave,
                        onConfirm = onConfirm,
                        onCancel = onCancel,
                    )
                }

                else -> FieldPromptSection(
                    prompt = prompt,
                    onResolve = onPromptResolved,
                    onCancel = onCancel,
                )
            }

            Spacer(Modifier.height(48.dp))
        }
    }
}

@Composable
private fun OfflineBanner() {
    Text(
        text = "Saved as an offline draft — finish reviewing it here when you're ready.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription =
                    "This transaction was saved as an offline draft. Finish reviewing it when ready."
            },
    )
}

@Composable
private fun ConfidenceBar(confidence: Float) {
    val percent = (confidence * 100).toInt()
    Column(
        modifier = Modifier.semantics {
            contentDescription = "Parse confidence $percent percent"
        },
    ) {
        Text(
            text = "Confidence: $percent%",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { confidence },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FieldPromptSection(
    prompt: FieldPrompt,
    onResolve: (String) -> Unit,
    onCancel: () -> Unit,
) {
    var typed by remember(prompt) { mutableStateOf("") }
    val label = prompt.field.displayName()
    val question = when (prompt.reason) {
        PromptReason.MISSING -> "What's the $label?"
        PromptReason.AMBIGUOUS -> "Which $label did you mean?"
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.semantics { contentDescription = question },
    ) {
        Text(
            text = question,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )

        if (prompt.candidates.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                prompt.candidates.forEach { candidate ->
                    val display = prompt.field.formatCandidate(candidate)
                    AssistChip(
                        onClick = { onResolve(candidate) },
                        label = { Text(display) },
                        modifier = Modifier.semantics {
                            contentDescription = "Choose $label $display"
                        },
                    )
                }
            }
        }

        OutlinedTextField(
            value = typed,
            onValueChange = { typed = it },
            label = { Text("Enter $label") },
            singleLine = true,
            keyboardOptions = if (prompt.field == VoiceField.AMOUNT) {
                KeyboardOptions(keyboardType = KeyboardType.Number)
            } else {
                KeyboardOptions.Default
            },
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Enter $label manually" },
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = {
                    val value = if (prompt.field == VoiceField.AMOUNT) {
                        typed.toMinorUnitsOrNull()?.toString().orEmpty()
                    } else {
                        typed.trim()
                    }
                    if (value.isNotBlank()) onResolve(value)
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Confirm $label" },
            ) {
                Icon(Icons.Filled.Check, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Confirm")
            }
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.semantics { contentDescription = "Cancel voice entry" },
            ) {
                Icon(Icons.Filled.Close, null, Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun DraftSummaryCard(draft: VoiceTransactionDraft) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = draft.accessibilitySummary() },
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "Review your transaction",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            DraftRow("Amount", draft.amountMinor?.let { formatMinor(it, draft.currencyCode) } ?: "—")
            DraftRow("Merchant", draft.merchant ?: "—")
            DraftRow("Category", draft.category ?: "—")
            DraftRow("Account", draft.account ?: "—")
            DraftRow("Note", draft.note ?: "—")
            DraftRow("Type", draft.direction.name.lowercase().replaceFirstChar { it.uppercase() })
        }
    }
}

@Composable
private fun DraftRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "$label: $value" },
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun ReviewActions(
    canSave: Boolean,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(
            onClick = onConfirm,
            enabled = canSave,
            modifier = Modifier
                .weight(1f)
                .semantics {
                    contentDescription = if (canSave) {
                        "Save transaction"
                    } else {
                        "Save transaction, disabled until all fields are filled"
                    }
                },
        ) {
            Icon(Icons.Filled.Check, null, Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Save")
        }
        OutlinedButton(
            onClick = onCancel,
            modifier = Modifier.semantics { contentDescription = "Discard voice transaction" },
        ) {
            Icon(Icons.Filled.Close, null, Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Discard")
        }
    }
}

// ── Formatting helpers ──────────────────────────────────────────────────

private fun VoiceField.displayName(): String = when (this) {
    VoiceField.AMOUNT -> "amount"
    VoiceField.MERCHANT -> "merchant"
    VoiceField.CATEGORY -> "category"
    VoiceField.ACCOUNT -> "account"
    VoiceField.NOTE -> "note"
}

private fun VoiceField.formatCandidate(candidate: String): String =
    if (this == VoiceField.AMOUNT) {
        candidate.toLongOrNull()?.let { formatMinor(it, null) } ?: candidate
    } else {
        candidate
    }

private fun formatMinor(minor: Long, currencyCode: String?): String {
    val major = minor / 100.0
    val symbol = when (currencyCode) {
        "EUR" -> "€"
        "GBP" -> "£"
        else -> "$"
    }
    return symbol + String.format(Locale.ROOT, "%.2f", major)
}

private fun String.toMinorUnitsOrNull(): Long? {
    val cleaned = trim().removePrefix("$").removePrefix("€").removePrefix("£").replace(",", "")
    if (cleaned.isBlank()) return null
    val parts = cleaned.split(".")
    val whole = parts[0].toLongOrNull() ?: return null
    val fraction = if (parts.size > 1) parts[1].padEnd(2, '0').take(2).toLongOrNull() ?: 0L else 0L
    return whole * 100 + fraction
}

private fun VoiceTransactionDraft.accessibilitySummary(): String = buildString {
    append("Review transaction. ")
    amountMinor?.let { append("Amount ${formatMinor(it, currencyCode)}. ") }
    merchant?.let { append("Merchant $it. ") }
    category?.let { append("Category $it. ") }
    account?.let { append("Account $it. ") }
    note?.let { append("Note $it. ") }
    append("Type ${direction.name.lowercase()}.")
}

// ── Previews ────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember")
@Preview(showBackground = true, name = "Voice — Review")
@Composable
private fun VoiceReviewPreview() {
    FinanceTheme(dynamicColor = false) {
        VoiceTransactionScreen(
            state = VoiceEntryUiState(
                stage = VoiceEntryStage.REVIEW,
                draft = VoiceTransactionDraft(
                    amountMinor = 450,
                    currencyCode = "USD",
                    merchant = "Starbucks",
                    category = "Dining",
                ),
                overallConfidence = 0.85f,
            ),
            onPromptResolved = {},
            onConfirm = {},
            onCancel = {},
        )
    }
}

@Suppress("UnusedPrivateMember")
@Preview(showBackground = true, name = "Voice — Prompt")
@Composable
private fun VoicePromptPreview() {
    FinanceTheme(dynamicColor = false) {
        VoiceTransactionScreen(
            state = VoiceEntryUiState(
                stage = VoiceEntryStage.PROMPTING,
                draft = VoiceTransactionDraft(amountMinor = 1200),
                pendingPrompts = listOf(
                    FieldPrompt(
                        field = VoiceField.MERCHANT,
                        candidates = listOf("Chipotle", "Chevron"),
                        reason = PromptReason.AMBIGUOUS,
                    ),
                ),
                overallConfidence = 0.5f,
            ),
            onPromptResolved = {},
            onConfirm = {},
            onCancel = {},
        )
    }
}
