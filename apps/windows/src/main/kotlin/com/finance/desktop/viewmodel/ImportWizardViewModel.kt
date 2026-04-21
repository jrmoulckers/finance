// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// ─────────────────────────────────────────────────────────────────────────────
// Data Import Wizard ViewModel — Sprint 23
// ─────────────────────────────────────────────────────────────────────────────

/** Steps of the import wizard. */
enum class ImportStep { SELECT_FILE, PREVIEW, MAP_COLUMNS, DETECT_DUPLICATES, IMPORTING, COMPLETE }

/** A column detected in the CSV file. */
data class CsvColumn(
    val index: Int,
    val name: String,
    val sampleValues: List<String>,
)

/** Target field a CSV column can map to. */
enum class TransactionField { DATE, AMOUNT, PAYEE, CATEGORY, NOTES, ACCOUNT, TYPE, SKIP }

/** Column mapping from CSV column to transaction field. */
data class ColumnMapping(
    val csvColumn: CsvColumn,
    val targetField: TransactionField,
)

/** A potential duplicate detected during import analysis. */
data class DuplicateCandidate(
    val rowIndex: Int,
    val date: String,
    val amount: String,
    val payee: String,
    val reason: String,
    val shouldSkip: Boolean,
)

/** Import progress tracking. */
data class ImportProgress(
    val totalRows: Int,
    val processedRows: Int,
    val importedRows: Int,
    val skippedRows: Int,
    val errorRows: Int,
) {
    val percent: Float get() = if (totalRows > 0) processedRows.toFloat() / totalRows else 0f
}

data class ImportWizardUiState(
    val currentStep: ImportStep = ImportStep.SELECT_FILE,
    val fileName: String? = null,
    val fileSizeFormatted: String? = null,
    val csvHeaders: List<String> = emptyList(),
    val csvPreviewRows: List<List<String>> = emptyList(),
    val csvColumns: List<CsvColumn> = emptyList(),
    val columnMappings: List<ColumnMapping> = emptyList(),
    val duplicates: List<DuplicateCandidate> = emptyList(),
    val progress: ImportProgress? = null,
    val isProcessing: Boolean = false,
    val errorMessage: String? = null,
    val importSummary: String? = null,
)

/**
 * ViewModel for the Data Import Wizard.
 *
 * Guides the user through: file selection → CSV preview → column mapping →
 * duplicate detection → import progress → completion summary.
 */
class ImportWizardViewModel(
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(ImportWizardUiState())
    val uiState: StateFlow<ImportWizardUiState> = _uiState.asStateFlow()

    fun selectFile(fileName: String) {
        // Simulate loading a CSV file
        val headers = listOf("Date", "Description", "Amount", "Category", "Account")
        val previewRows = listOf(
            listOf("2025-03-01", "Whole Foods Market", "-42.50", "Groceries", "Checking"),
            listOf("2025-03-02", "Shell Gas Station", "-35.00", "Transportation", "Credit Card"),
            listOf("2025-03-03", "Salary Deposit", "3500.00", "Income", "Checking"),
            listOf("2025-03-04", "Netflix", "-15.99", "Entertainment", "Credit Card"),
            listOf("2025-03-05", "Target", "-67.23", "Shopping", "Debit Card"),
            listOf("2025-03-06", "Electric Company", "-125.00", "Utilities", "Checking"),
            listOf("2025-03-07", "Coffee Shop", "-5.75", "Food & Drink", "Cash"),
            listOf("2025-03-08", "Freelance Payment", "750.00", "Income", "Checking"),
        )

        val columns = headers.mapIndexed { i, name ->
            CsvColumn(
                index = i,
                name = name,
                sampleValues = previewRows.take(3).map { it[i] },
            )
        }

        _uiState.value = _uiState.value.copy(
            currentStep = ImportStep.PREVIEW,
            fileName = fileName,
            fileSizeFormatted = "2.4 KB",
            csvHeaders = headers,
            csvPreviewRows = previewRows,
            csvColumns = columns,
            errorMessage = null,
        )
    }

    fun proceedToMapping() {
        // Auto-detect column mappings based on header names
        val autoMappings = _uiState.value.csvColumns.map { col ->
            val target = when (col.name.lowercase()) {
                "date" -> TransactionField.DATE
                "description", "payee", "merchant" -> TransactionField.PAYEE
                "amount", "value" -> TransactionField.AMOUNT
                "category", "type" -> TransactionField.CATEGORY
                "account" -> TransactionField.ACCOUNT
                "notes", "memo" -> TransactionField.NOTES
                else -> TransactionField.SKIP
            }
            ColumnMapping(csvColumn = col, targetField = target)
        }

        _uiState.value = _uiState.value.copy(
            currentStep = ImportStep.MAP_COLUMNS,
            columnMappings = autoMappings,
        )
    }

    fun updateColumnMapping(columnIndex: Int, targetField: TransactionField) {
        _uiState.value = _uiState.value.copy(
            columnMappings = _uiState.value.columnMappings.map {
                if (it.csvColumn.index == columnIndex) it.copy(targetField = targetField) else it
            },
        )
    }

    fun proceedToDetectDuplicates() {
        // Simulate duplicate detection
        val duplicates = listOf(
            DuplicateCandidate(3, "2025-03-04", "-\$15.99", "Netflix", "Existing subscription payment matches", true),
            DuplicateCandidate(5, "2025-03-06", "-\$125.00", "Electric Company", "Similar amount on same date", false),
        )

        _uiState.value = _uiState.value.copy(
            currentStep = ImportStep.DETECT_DUPLICATES,
            duplicates = duplicates,
        )
    }

    fun toggleDuplicateSkip(rowIndex: Int) {
        _uiState.value = _uiState.value.copy(
            duplicates = _uiState.value.duplicates.map {
                if (it.rowIndex == rowIndex) it.copy(shouldSkip = !it.shouldSkip) else it
            },
        )
    }

    fun startImport() {
        viewModelScope.launch {
            val totalRows = _uiState.value.csvPreviewRows.size
            val skippedIndices = _uiState.value.duplicates.filter { it.shouldSkip }.map { it.rowIndex }.toSet()

            _uiState.value = _uiState.value.copy(
                currentStep = ImportStep.IMPORTING,
                isProcessing = true,
                progress = ImportProgress(totalRows, 0, 0, 0, 0),
            )

            var imported = 0
            var skipped = 0
            val now = Clock.System.now()

            for (i in 0 until totalRows) {
                delay(300) // Simulate processing time per row

                if (i in skippedIndices) {
                    skipped++
                } else {
                    // Create transaction from CSV row
                    val row = _uiState.value.csvPreviewRows[i]
                    val amountStr = row.getOrNull(2) ?: "0"
                    val amountCents = ((amountStr.replace(",", "").toDoubleOrNull() ?: 0.0) * 100).toLong()
                    val type = if (amountCents >= 0) TransactionType.INCOME else TransactionType.EXPENSE

                    val txn = Transaction(
                        id = SyncId("import-${now.toEpochMilliseconds()}-$i"),
                        householdId = SyncId("d1"),
                        accountId = SyncId("a1"),
                        amount = Cents(kotlin.math.abs(amountCents)),
                        currency = Currency.USD,
                        type = type,
                        date = try { LocalDate.parse(row[0]) } catch (_: Exception) {
                            Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
                        },
                        payee = row.getOrNull(1),
                        categoryId = null,
                        notes = "Imported from ${_uiState.value.fileName}",
                        createdAt = now,
                        updatedAt = now,
                    )
                    transactionRepository.insert(txn)
                    imported++
                }

                _uiState.value = _uiState.value.copy(
                    progress = ImportProgress(
                        totalRows = totalRows,
                        processedRows = i + 1,
                        importedRows = imported,
                        skippedRows = skipped,
                        errorRows = 0,
                    ),
                )
            }

            _uiState.value = _uiState.value.copy(
                currentStep = ImportStep.COMPLETE,
                isProcessing = false,
                importSummary = "$imported transactions imported, $skipped skipped as duplicates",
            )
        }
    }

    fun resetWizard() {
        _uiState.value = ImportWizardUiState()
    }

    fun goBack() {
        val prevStep = when (_uiState.value.currentStep) {
            ImportStep.PREVIEW -> ImportStep.SELECT_FILE
            ImportStep.MAP_COLUMNS -> ImportStep.PREVIEW
            ImportStep.DETECT_DUPLICATES -> ImportStep.MAP_COLUMNS
            else -> return
        }
        _uiState.value = _uiState.value.copy(currentStep = prevStep)
    }
}
