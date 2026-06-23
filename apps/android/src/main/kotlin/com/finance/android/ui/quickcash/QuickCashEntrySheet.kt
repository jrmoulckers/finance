// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickcash

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Minimum touch target per Material accessibility guidance. Quick entry is used on the go,
 * so every interactive element stays at least this tall/wide for reliable tapping and
 * Switch Access traversal.
 */
private val MinTouchTarget = 48.dp

/**
 * Modal bottom sheet for **true quick cash entry** (#2180).
 *
 * Presents the fastest possible path to record a cash expense: amount field, optional
 * one-tap category chips, optional note, and a single Save button. The account defaults to
 * the user's cash wallet (resolved in [QuickCashEntryViewModel]). On save the sheet
 * dismisses and reports back via [onSaved].
 *
 * Localization note: user-facing copy is currently English literals. Extracting these into
 * localized string resources is owned by the in-flight i18n work — see the matching
 * `// TODO(human)` markers and the PR "Needs Human Action" section.
 *
 * @param onDismiss invoked when the user dismisses the sheet without saving.
 * @param onSaved invoked after a successful save (the entry has been persisted).
 * @param viewModel injected quick cash entry ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun QuickCashEntrySheet(
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
    viewModel: QuickCashEntryViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    // Dismiss the sheet once the entry has been saved.
    LaunchedEffect(state.isSaved) {
        if (state.isSaved) onSaved()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        QuickCashEntryContent(
            state = state,
            onAmountChange = viewModel::updateAmount,
            onNoteChange = viewModel::updateNote,
            onSelectCategory = viewModel::selectCategory,
            onSelectAccount = viewModel::selectAccount,
            onSave = viewModel::save,
        )
    }
}

/**
 * Stateless content of the quick cash entry sheet. Hoisted out of [QuickCashEntrySheet] so
 * it can be previewed and snapshot-tested without Koin or a live ViewModel.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickCashEntryContent(
    state: QuickCashUiState,
    onAmountChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onSelectCategory: (com.finance.models.types.SyncId?) -> Unit,
    onSelectAccount: (com.finance.models.types.SyncId) -> Unit,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp)
            .padding(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Quick cash expense",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )

        // ── Amount ───────────────────────────────────────────────────────
        OutlinedTextField(
            value = state.amountText,
            onValueChange = onAmountChange,
            label = { Text("Amount") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            supportingText = {
                if (state.formattedAmount.isNotEmpty()) {
                    Text(state.formattedAmount)
                }
            },
            isError = state.errors.any {
                it == QuickCashError.INVALID_AMOUNT || it == QuickCashError.AMOUNT_TOO_LARGE
            },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = MinTouchTarget)
                .semantics {
                    contentDescription = "Cash expense amount in dollars"
                },
        )

        // ── Account (cash-first) ─────────────────────────────────────────
        QuickCashChipRow(
            title = "Account",
            items = state.cashAccounts.map { it.id to it.name },
            selectedId = state.selectedAccountId,
            selectedSemanticsSuffix = "selected account",
            onClick = onSelectAccount,
        )

        // ── Category (optional) ──────────────────────────────────────────
        QuickCashChipRow(
            title = "Category (optional)",
            items = state.categories.map { it.id to it.name },
            selectedId = state.selectedCategoryId,
            selectedSemanticsSuffix = "selected category",
            onClick = onSelectCategory,
        )

        // ── Note (optional) ──────────────────────────────────────────────
        OutlinedTextField(
            value = state.note,
            onValueChange = onNoteChange,
            label = { Text("Note (optional)") },
            singleLine = true,
            isError = state.errors.contains(QuickCashError.NOTE_TOO_LONG),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = MinTouchTarget)
                .semantics { contentDescription = "Optional note for this cash expense" },
        )

        // ── Errors (announced for TalkBack) ──────────────────────────────
        val errorText = state.errors.joinToString("\n", transform = ::errorMessage)
        if (errorText.isNotEmpty()) {
            Text(
                text = errorText,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }

        // ── Save ─────────────────────────────────────────────────────────
        Button(
            onClick = onSave,
            enabled = state.canSave,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = MinTouchTarget)
                .semantics { contentDescription = "Save cash expense" },
        ) {
            Icon(Icons.Filled.Payments, contentDescription = null)
            Spacer(Modifier.padding(horizontal = 4.dp))
            Text("Save cash expense")
        }
    }
}

/**
 * A titled, wrapping row of single-select [FilterChip]s with large touch targets and
 * TalkBack-friendly semantics. Renders nothing when [items] is empty.
 *
 * @param items list of `(id, displayName)` pairs.
 * @param selectedId the currently selected id, if any.
 * @param selectedSemanticsSuffix appended to the selected chip's content description.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickCashChipRow(
    title: String,
    items: List<Pair<com.finance.models.types.SyncId, String>>,
    selectedId: com.finance.models.types.SyncId?,
    selectedSemanticsSuffix: String,
    onClick: (com.finance.models.types.SyncId) -> Unit,
) {
    if (items.isEmpty()) return
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.semantics { heading() },
    )
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { (id, name) ->
            val selected = id == selectedId
            FilterChip(
                selected = selected,
                onClick = { onClick(id) },
                label = { Text(name) },
                leadingIcon = if (selected) {
                    { Icon(Icons.Filled.Check, contentDescription = null) }
                } else {
                    null
                },
                modifier = Modifier
                    .sizeIn(minHeight = MinTouchTarget)
                    .semantics {
                        contentDescription = if (selected) "$name, $selectedSemanticsSuffix" else name
                    },
            )
        }
    }
}

/**
 * Maps a [QuickCashError] to a user-facing message.
 *
 * TODO(human): Replace these English literals with localized string resources (es-ES, etc.)
 * once the i18n resource keys are finalized by the localization work in flight (#2166).
 */
private fun errorMessage(error: QuickCashError): String = when (error) {
    QuickCashError.INVALID_AMOUNT -> "Enter an amount greater than zero"
    QuickCashError.AMOUNT_TOO_LARGE -> "That amount looks too large for quick entry"
    QuickCashError.NO_ACCOUNT -> "Add a cash account to record this expense"
    QuickCashError.NOTE_TOO_LONG -> "Note is too long"
}

@OptIn(ExperimentalLayoutApi::class)
@Preview(showBackground = true)
@Composable
private fun QuickCashEntryContentPreview() {
    FinanceTheme {
        QuickCashEntryContent(
            state = QuickCashUiState(
                amountText = "12.50",
                formattedAmount = "$12.50",
            ),
            onAmountChange = {},
            onNoteChange = {},
            onSelectCategory = {},
            onSelectAccount = {},
            onSave = {},
        )
    }
}
