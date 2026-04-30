// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.FileCopy
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.NavigateBefore
import androidx.compose.material.icons.filled.NavigateNext
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.ColumnMapping
import com.finance.desktop.viewmodel.DuplicateCandidate
import com.finance.desktop.viewmodel.ImportProgress
import com.finance.desktop.viewmodel.ImportStep
import com.finance.desktop.viewmodel.ImportWizardUiState
import com.finance.desktop.viewmodel.ImportWizardViewModel
import com.finance.desktop.viewmodel.TransactionField

// =============================================================================
// Data Import Wizard Screen — Sprint 23
// =============================================================================

/**
 * Data Import Wizard for importing transactions from CSV files.
 *
 * Multi-step wizard flow:
 * 1. Select File — file picker with drag-and-drop zone
 * 2. Preview — CSV data table preview
 * 3. Map Columns — column-to-field mapping with auto-detection
 * 4. Detect Duplicates — review potential duplicate transactions
 * 5. Importing — progress bar with row-by-row status
 * 6. Complete — import summary
 *
 * Narrator reads step progress, table data, and import status.
 */
@Composable
fun ImportWizardScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<ImportWizardViewModel>()
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Data Import Wizard screen" },
    ) {
        // Header
        Text(
            text = "Import Data",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Import Data heading"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Text(
            text = "Import transactions from CSV files",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // Step indicator
        StepIndicator(currentStep = state.currentStep)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Step content
        Box(modifier = Modifier.weight(1f)) {
            when (state.currentStep) {
                ImportStep.SELECT_FILE -> SelectFileStep(onFileSelected = viewModel::selectFile)
                ImportStep.PREVIEW -> PreviewStep(
                    state = state,
                    onNext = viewModel::proceedToMapping,
                    onBack = viewModel::goBack,
                )
                ImportStep.MAP_COLUMNS -> MapColumnsStep(
                    state = state,
                    onMappingChange = viewModel::updateColumnMapping,
                    onNext = viewModel::proceedToDetectDuplicates,
                    onBack = viewModel::goBack,
                )
                ImportStep.DETECT_DUPLICATES -> DuplicateDetectionStep(
                    state = state,
                    onToggleSkip = viewModel::toggleDuplicateSkip,
                    onImport = viewModel::startImport,
                    onBack = viewModel::goBack,
                )
                ImportStep.IMPORTING -> ImportingStep(state = state)
                ImportStep.COMPLETE -> CompleteStep(
                    state = state,
                    onReset = viewModel::resetWizard,
                )
            }
        }
    }
}

// ─── Step indicator ──────────────────────────────────────────────────────────

@Composable
private fun StepIndicator(currentStep: ImportStep) {
    val steps = listOf(
        "Select File" to ImportStep.SELECT_FILE,
        "Preview" to ImportStep.PREVIEW,
        "Map Columns" to ImportStep.MAP_COLUMNS,
        "Duplicates" to ImportStep.DETECT_DUPLICATES,
        "Import" to ImportStep.IMPORTING,
        "Complete" to ImportStep.COMPLETE,
    )
    val currentIndex = steps.indexOfFirst { it.second == currentStep }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Import wizard step ${currentIndex + 1} of ${steps.size}: ${steps[currentIndex].first}" },
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        steps.forEachIndexed { index, (label, _) ->
            val isCompleted = index < currentIndex
            val isCurrent = index == currentIndex
            val color = when {
                isCompleted -> Color(0xFF2E7D32)
                isCurrent -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.outlineVariant
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.semantics {
                    contentDescription = when {
                        isCompleted -> "$label, completed"
                        isCurrent -> "$label, current step"
                        else -> "$label, upcoming"
                    }
                },
            ) {
                // Step circle
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(if (isCompleted || isCurrent) color else Color.Transparent)
                        .border(2.dp, color, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isCompleted) {
                        Icon(
                            Icons.Filled.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp),
                        )
                    } else {
                        Text(
                            text = "${index + 1}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (isCurrent) Color.White else color,
                        )
                    }
                }
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                    color = if (isCurrent || isCompleted) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Connector line
            if (index < steps.lastIndex) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(2.dp)
                        .padding(horizontal = FinanceDesktopTheme.spacing.sm)
                        .background(
                            if (index < currentIndex) Color(0xFF2E7D32)
                            else MaterialTheme.colorScheme.outlineVariant,
                        ),
                )
            }
        }
    }
}

// ─── Step 1: Select file ─────────────────────────────────────────────────────

@Composable
private fun SelectFileStep(onFileSelected: (String) -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        ElevatedCard(
            modifier = Modifier
                .width(480.dp)
                .clickable { onFileSelected("transactions_export.csv") }
                .semantics {
                    contentDescription = "Click to select a CSV file for import"
                    role = Role.Button
                },
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxxl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = Icons.Filled.CloudUpload,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                Text(
                    text = "Select CSV File",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = "Click to browse or drag & drop a CSV file",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Text(
                        text = "Supported formats: .csv, .tsv",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

// ─── Step 2: CSV Preview ─────────────────────────────────────────────────────

@Composable
private fun PreviewStep(
    state: ImportWizardUiState,
    onNext: () -> Unit,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // File info
        Card(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Description, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Column(modifier = Modifier.weight(1f)) {
                    Text(state.fileName ?: "", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    Text("${state.fileSizeFormatted} • ${state.csvPreviewRows.size} rows • ${state.csvHeaders.size} columns",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // CSV data table (scrollable)
        Text(
            text = "Data Preview",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

        val scrollState = rememberScrollState()
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(scrollState),
        ) {
            // Header row
            item {
                Row(
                    modifier = Modifier
                        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                        .padding(horizontal = FinanceDesktopTheme.spacing.md, vertical = FinanceDesktopTheme.spacing.sm),
                ) {
                    Text(
                        "#",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(40.dp),
                    )
                    state.csvHeaders.forEach { header ->
                        Text(
                            text = header,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(140.dp).padding(horizontal = 4.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            // Data rows
            itemsIndexed(state.csvPreviewRows) { index, row ->
                Row(
                    modifier = Modifier
                        .background(
                            if (index % 2 == 0) MaterialTheme.colorScheme.surface
                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                        )
                        .padding(horizontal = FinanceDesktopTheme.spacing.md, vertical = FinanceDesktopTheme.spacing.xs)
                        .semantics {
                            contentDescription = "Row ${index + 1}: ${row.joinToString(", ")}"
                        },
                ) {
                    Text(
                        "${index + 1}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(40.dp),
                    )
                    row.forEach { cell ->
                        Text(
                            text = cell,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.width(140.dp).padding(horizontal = 4.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        WizardNavButtons(onBack = onBack, onNext = onNext, nextLabel = "Map Columns")
    }
}

// ─── Step 3: Column mapping ──────────────────────────────────────────────────

@Composable
private fun MapColumnsStep(
    state: ImportWizardUiState,
    onMappingChange: (Int, TransactionField) -> Unit,
    onNext: () -> Unit,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Map each CSV column to a transaction field",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            itemsIndexed(state.columnMappings) { _, mapping ->
                ColumnMappingRow(
                    mapping = mapping,
                    onFieldChange = { field -> onMappingChange(mapping.csvColumn.index, field) },
                )
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        WizardNavButtons(onBack = onBack, onNext = onNext, nextLabel = "Check Duplicates")
    }
}

@Composable
private fun ColumnMappingRow(
    mapping: ColumnMapping,
    onFieldChange: (TransactionField) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Column '${mapping.csvColumn.name}' mapped to ${mapping.targetField.name.lowercase()}"
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // CSV column info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = mapping.csvColumn.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "e.g. ${mapping.csvColumn.sampleValues.joinToString(", ")}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Arrow
            Icon(
                Icons.Filled.NavigateNext,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))

            // Target field dropdown
            Box {
                FilledTonalButton(
                    onClick = { expanded = true },
                    modifier = Modifier.semantics {
                        contentDescription = "Map to: ${mapping.targetField.name.lowercase()}. Click to change."
                        role = Role.DropdownList
                    },
                ) {
                    Text(
                        text = mapping.targetField.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
                DropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false },
                ) {
                    TransactionField.entries.forEach { field ->
                        DropdownMenuItem(
                            text = {
                                Text(field.name.lowercase().replaceFirstChar { it.uppercase() })
                            },
                            onClick = {
                                onFieldChange(field)
                                expanded = false
                            },
                            modifier = Modifier.semantics {
                                contentDescription = "Map to ${field.name.lowercase()}"
                            },
                        )
                    }
                }
            }
        }
    }
}

// ─── Step 4: Duplicate detection ─────────────────────────────────────────────

@Composable
private fun DuplicateDetectionStep(
    state: ImportWizardUiState,
    onToggleSkip: (Int) -> Unit,
    onImport: () -> Unit,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        if (state.duplicates.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = Color(0xFF2E7D32),
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Text(
                        "No duplicates detected!",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics { contentDescription = "No duplicate transactions found" },
                    )
                    Text(
                        "All rows are unique and ready to import.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary)
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = "${state.duplicates.size} potential duplicates found",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics {
                        contentDescription = "${state.duplicates.size} potential duplicate transactions found"
                    },
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                itemsIndexed(state.duplicates) { _, dup ->
                    DuplicateRow(
                        duplicate = dup,
                        onToggleSkip = { onToggleSkip(dup.rowIndex) },
                    )
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        WizardNavButtons(onBack = onBack, onNext = onImport, nextLabel = "Start Import")
    }
}

@Composable
private fun DuplicateRow(
    duplicate: DuplicateCandidate,
    onToggleSkip: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Potential duplicate: ${duplicate.payee}, ${duplicate.amount} on ${duplicate.date}. ")
                    append("Reason: ${duplicate.reason}. ")
                    append(if (duplicate.shouldSkip) "Will be skipped." else "Will be imported.")
                }
            },
        colors = CardDefaults.cardColors(
            containerColor = if (duplicate.shouldSkip)
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
            else MaterialTheme.colorScheme.surface,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = duplicate.shouldSkip,
                onCheckedChange = { onToggleSkip() },
                modifier = Modifier.semantics {
                    contentDescription = if (duplicate.shouldSkip) "Marked to skip" else "Marked to import"
                },
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Row {
                    Text("Row ${duplicate.rowIndex + 1}", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(duplicate.date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    "${duplicate.payee} — ${duplicate.amount}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    duplicate.reason,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (duplicate.shouldSkip)
                    MaterialTheme.colorScheme.error.copy(alpha = 0.12f)
                else Color(0xFF2E7D32).copy(alpha = 0.12f),
            ) {
                Text(
                    text = if (duplicate.shouldSkip) "Skip" else "Import",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (duplicate.shouldSkip)
                        MaterialTheme.colorScheme.error else Color(0xFF2E7D32),
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

// ─── Step 5: Importing ───────────────────────────────────────────────────────

@Composable
private fun ImportingStep(state: ImportWizardUiState) {
    val progress = state.progress ?: return
    val animatedProgress by animateFloatAsState(
        targetValue = progress.percent,
        animationSpec = tween(300),
        label = "import-progress",
    )
    val pct = (animatedProgress * 100).toInt()

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        ElevatedCard(modifier = Modifier.width(480.dp)) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxxl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = Icons.Filled.FileUpload,
                    contentDescription = null,
                    modifier = Modifier.size(48.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                Text(
                    text = "Importing Transactions…",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                LinearProgressIndicator(
                    progress = { animatedProgress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .semantics { contentDescription = "Import progress: $pct percent" },
                    strokeCap = StrokeCap.Round,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "$pct% — ${progress.processedRows} of ${progress.totalRows} rows",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    ImportStatChip("Imported", "${progress.importedRows}", Color(0xFF2E7D32))
                    ImportStatChip("Skipped", "${progress.skippedRows}", MaterialTheme.colorScheme.tertiary)
                    ImportStatChip("Errors", "${progress.errorRows}", MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun ImportStatChip(label: String, value: String, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics { contentDescription = "$label: $value" },
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = color,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ─── Step 6: Complete ────────────────────────────────────────────────────────

@Composable
private fun CompleteStep(
    state: ImportWizardUiState,
    onReset: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        ElevatedCard(modifier = Modifier.width(480.dp)) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxxl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = Color(0xFF2E7D32),
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                Text(
                    text = "Import Complete!",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Import complete"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                Text(
                    text = state.importSummary ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.semantics {
                        contentDescription = state.importSummary ?: ""
                    },
                )

                state.progress?.let { progress ->
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        ImportStatChip("Total", "${progress.totalRows}", MaterialTheme.colorScheme.onSurface)
                        ImportStatChip("Imported", "${progress.importedRows}", Color(0xFF2E7D32))
                        ImportStatChip("Skipped", "${progress.skippedRows}", MaterialTheme.colorScheme.tertiary)
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                Button(
                    onClick = onReset,
                    modifier = Modifier.semantics {
                        contentDescription = "Import another file"
                        role = Role.Button
                    },
                ) {
                    Icon(Icons.Filled.FileCopy, contentDescription = null)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Import Another File")
                }
            }
        }
    }
}

// ─── Shared navigation buttons ───────────────────────────────────────────────

@Composable
private fun WizardNavButtons(
    onBack: () -> Unit,
    onNext: () -> Unit,
    nextLabel: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        OutlinedButton(
            onClick = onBack,
            modifier = Modifier.semantics {
                contentDescription = "Go back"
                role = Role.Button
            },
        ) {
            Icon(Icons.Filled.NavigateBefore, contentDescription = null)
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
            Text("Back")
        }
        Button(
            onClick = onNext,
            modifier = Modifier.semantics {
                contentDescription = nextLabel
                role = Role.Button
            },
        ) {
            Text(nextLabel)
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
            Icon(Icons.Filled.NavigateNext, contentDescription = null)
        }
    }
}
