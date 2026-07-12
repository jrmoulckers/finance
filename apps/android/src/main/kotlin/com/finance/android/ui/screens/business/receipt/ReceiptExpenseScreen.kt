// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.receipt

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.accessibility.financeSemantic
import com.finance.android.ui.accessibility.liveRegion
import com.finance.android.ui.screens.business.BusinessCategory
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Receipt capture → saved expense + COGS workflow (#2183).
 *
 * Takes an OCR result, keeps the receipt image as an attachment, lets the
 * owner accept/reject line items and map them to COGS/inventory/supplies, then
 * saves a single expense.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReceiptExpenseScreen(
    onBack: () -> Unit = {},
    onSaved: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ReceiptExpenseViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Receipt → Expense",
                        modifier = Modifier.semantics {
                            contentDescription = "Save receipt as expense"
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
        if (state.isScanning) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header") { HeaderCard(state) }

            item(key = "items-header") {
                Text(
                    "Line items",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }

            items(state.draft?.lineItems.orEmpty(), key = { it.id }) { line ->
                LineItemCard(
                    line = line,
                    categories = viewModel.mappableCategories,
                    onToggle = { viewModel.toggleAccepted(line.id) },
                    onMap = { viewModel.mapCategory(line.id, it) },
                )
            }

            item(key = "save") {
                SaveSection(state = state, onSave = viewModel::save, onDone = onSaved)
            }
        }
    }
}

@Composable
private fun HeaderCard(state: ReceiptExpenseUiState) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Filled.Photo,
                contentDescription = if (state.hasReceiptImage) "Receipt photo attached" else "No receipt photo",
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(state.merchant, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    if (state.hasReceiptImage) "Receipt photo will be attached" else "No photo",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(state.totalFormatted, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun LineItemCard(
    line: OcrLineItem,
    categories: List<BusinessCategory>,
    onToggle: () -> Unit,
    onMap: (BusinessCategory) -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = line.accepted,
                    onCheckedChange = { onToggle() },
                    modifier = Modifier.financeSemantic(
                        if (line.accepted) "Included: ${line.description}" else "Excluded: ${line.description}",
                    ),
                )
                Text(
                    line.description,
                    style = MaterialTheme.typography.bodyLarge,
                    textDecoration = if (line.accepted) TextDecoration.None else TextDecoration.LineThrough,
                    modifier = Modifier.weight(1f),
                )
            }
            if (line.accepted) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    categories.forEach { category ->
                        FilterChip(
                            selected = line.category == category,
                            onClick = { onMap(category) },
                            label = { Text(category.label) },
                            modifier = Modifier.financeSemantic("Map to ${category.label}"),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SaveSection(
    state: ReceiptExpenseUiState,
    onSave: () -> Unit,
    onDone: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state.reconciliationLabel?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (state.saved) {
            Text(
                state.savedMessage.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.liveRegion(),
            )
            Button(
                onClick = onDone,
                modifier = Modifier
                    .fillMaxWidth()
                    .financeSemantic("Done"),
            ) { Text("Done") }
        } else {
            Button(
                onClick = onSave,
                enabled = state.canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .financeSemantic("Save expense with receipt photo"),
            ) { Text("Save expense (${state.acceptedTotalFormatted})") }
            if (!state.canSave) {
                Text(
                    "Map every included line to a category to save.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ReceiptExpenseScreenPreview() {
    FinanceTheme {
        ReceiptExpenseScreen()
    }
}
