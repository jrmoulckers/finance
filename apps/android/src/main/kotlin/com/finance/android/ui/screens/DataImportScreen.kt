// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.DataImportUiState
import com.finance.android.ui.viewmodel.DataImportViewModel
import com.finance.android.ui.viewmodel.ImportField
import com.finance.android.ui.viewmodel.ImportFormat
import org.koin.compose.viewmodel.koinViewModel

/**
 * Data import screen with step-by-step file selection, format detection,
 * column mapping, and import progress tracking.
 *
 * ## Accessibility
 * - All interactive elements have `contentDescription`.
 * - Progress is announced via `LinearProgressIndicator` semantics.
 * - Section headings use `semantics { heading() }`.
 *
 * @param onNavigateBack Callback to navigate back after import.
 * @param viewModel [DataImportViewModel] injected via Koin.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataImportScreen(
    onNavigateBack: () -> Unit,
    viewModel: DataImportViewModel = koinViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri ->
        uri?.let { viewModel.onFileSelected(it, it.lastPathSegment ?: "unknown") }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = "Data import screen" },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Step 1: Format selection ─────────────────────────────────
        item {
            Text(
                text = "Import Data",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
        }

        item {
            Text(
                text = "Select format",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ImportFormat.entries.forEach { format ->
                    FilterChip(
                        selected = uiState.selectedFormat == format,
                        onClick = { viewModel.selectFormat(format) },
                        label = { Text(format.displayName) },
                        modifier = Modifier.semantics {
                            contentDescription = "Select ${format.displayName} format"
                        },
                    )
                }
            }
        }

        // ── Step 2: File selection ───────────────────────────────────
        if (uiState.selectedFormat != null) {
            item {
                FileSelectionCard(
                    fileName = uiState.fileName,
                    onSelectFile = { filePickerLauncher.launch("*/*") },
                )
            }
        }

        // ── Step 3: Column mapping ──────────────────────────────────
        if (uiState.columnMappings.isNotEmpty()) {
            item {
                Text(
                    text = "Map Columns",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
            }

            itemsIndexed(uiState.columnMappings) { index, mapping ->
                ColumnMappingRow(
                    sourceColumn = mapping.sourceColumn,
                    selectedField = mapping.targetField,
                    onFieldSelected = { field ->
                        viewModel.updateColumnMapping(index, field)
                    },
                )
            }
        }

        // ── Step 4: Account selection ───────────────────────────────
        if (uiState.columnMappings.isNotEmpty()) {
            item {
                AccountSelectionSection(
                    accounts = uiState.accounts,
                    selectedAccountId = uiState.selectedAccountId,
                    onAccountSelected = { viewModel.selectAccount(it) },
                )
            }
        }

        // ── Import button ───────────────────────────────────────────
        if (uiState.selectedAccountId != null && !uiState.isImporting && !uiState.isComplete) {
            item {
                Button(
                    onClick = { viewModel.startImport() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Start importing transactions" },
                ) {
                    Text("Import ${uiState.totalCount} Transactions")
                }
            }
        }

        // ── Progress ────────────────────────────────────────────────
        if (uiState.isImporting) {
            item {
                ImportProgressSection(
                    progress = uiState.importProgress,
                    importedCount = uiState.importedCount,
                    totalCount = uiState.totalCount,
                )
            }
        }

        // ── Completion ──────────────────────────────────────────────
        if (uiState.isComplete) {
            item {
                ImportCompleteSection(
                    importedCount = uiState.importedCount,
                    onDone = onNavigateBack,
                    onImportMore = { viewModel.resetImport() },
                )
            }
        }

        // ── Error ───────────────────────────────────────────────────
        uiState.errorMessage?.let { error ->
            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun FileSelectionCard(
    fileName: String,
    onSelectFile: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (fileName.isNotEmpty()) {
                Text(
                    text = "Selected: $fileName",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
            OutlinedButton(
                onClick = onSelectFile,
                modifier = Modifier.semantics {
                    contentDescription = "Choose file to import"
                },
            ) {
                Icon(
                    imageVector = Icons.Default.FileUpload,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Choose File")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ColumnMappingRow(
    sourceColumn: String,
    selectedField: ImportField,
    onFieldSelected: (ImportField) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = sourceColumn,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Spacer(modifier = Modifier.width(8.dp))
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
            modifier = Modifier.weight(1f),
        ) {
            OutlinedTextField(
                value = selectedField.displayName,
                onValueChange = {},
                readOnly = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                modifier = Modifier
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    .semantics {
                        contentDescription = "Map column $sourceColumn to field"
                    },
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
                ImportField.entries.forEach { field ->
                    DropdownMenuItem(
                        text = { Text(field.displayName) },
                        onClick = {
                            onFieldSelected(field)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun AccountSelectionSection(
    accounts: List<com.finance.models.Account>,
    selectedAccountId: String?,
    onAccountSelected: (String) -> Unit,
) {
    Text(
        text = "Target Account",
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.semantics { heading() },
    )
    Spacer(modifier = Modifier.height(8.dp))
    accounts.forEach { account ->
        FilterChip(
            selected = account.id.value == selectedAccountId,
            onClick = { onAccountSelected(account.id.value) },
            label = { Text(account.name) },
            modifier = Modifier
                .padding(end = 8.dp)
                .semantics {
                    contentDescription = "Select account ${account.name}"
                },
        )
    }
}

@Composable
private fun ImportProgressSection(
    progress: Float,
    importedCount: Int,
    totalCount: Int,
) {
    Column(
        modifier = Modifier.semantics {
            contentDescription = "Importing: $importedCount of $totalCount transactions"
        },
    ) {
        Text(
            text = "Importing… $importedCount / $totalCount",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(modifier = Modifier.height(8.dp))
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ImportCompleteSection(
    importedCount: Int,
    onDone: () -> Unit,
    onImportMore: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = "Import complete",
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Successfully imported $importedCount transactions",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onImportMore,
                    modifier = Modifier.semantics {
                        contentDescription = "Import more data"
                    },
                ) {
                    Text("Import More")
                }
                Button(
                    onClick = onDone,
                    modifier = Modifier.semantics {
                        contentDescription = "Finish and go back"
                    },
                ) {
                    Text("Done")
                }
            }
        }
    }
}