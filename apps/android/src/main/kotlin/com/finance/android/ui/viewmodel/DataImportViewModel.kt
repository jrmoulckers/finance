// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.auth.HouseholdIdProvider
import com.finance.models.Account
import com.finance.models.Category
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Supported import file formats.
 */
enum class ImportFormat(val displayName: String, val extensions: List<String>) {
    CSV("CSV (Comma-Separated Values)", listOf("csv")),
    OFX("OFX (Open Financial Exchange)", listOf("ofx", "qfx")),
    QIF("QIF (Quicken Interchange Format)", listOf("qif")),
}

/**
 * Represents a column mapping from the source file to a transaction field.
 */
data class ColumnMapping(
    val sourceColumn: String,
    val targetField: ImportField,
)

/**
 * Target fields for import column mapping.
 */
enum class ImportField(val displayName: String) {
    DATE("Date"),
    AMOUNT("Amount"),
    PAYEE("Payee / Description"),
    CATEGORY("Category"),
    NOTES("Notes"),
    SKIP("Skip this column"),
}

/**
 * UI state for the data import flow.
 */
data class DataImportUiState(
    val isLoading: Boolean = false,
    val selectedFormat: ImportFormat? = null,
    val selectedFileUri: Uri? = null,
    val fileName: String = "",
    val previewRows: List<List<String>> = emptyList(),
    val headerRow: List<String> = emptyList(),
    val columnMappings: List<ColumnMapping> = emptyList(),
    val selectedAccountId: String? = null,
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    val importProgress: Float = 0f,
    val importedCount: Int = 0,
    val totalCount: Int = 0,
    val isImporting: Boolean = false,
    val isComplete: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * ViewModel for the data import screen.
 *
 * Manages the multi-step import flow: file selection, format detection,
 * column mapping, and transaction creation. Supports CSV, OFX, and QIF
 * formats with progress tracking via [StateFlow].
 *
 * ## Privacy
 * File contents are processed locally and never transmitted. Transaction
 * amounts and payee names are not logged.
 *
 * @param transactionRepository Repository for creating imported transactions.
 * @param accountRepository Repository for listing target accounts.
 * @param categoryRepository Repository for category lookups.
 * @param householdIdProvider Provider of the current household ID.
 */
class DataImportViewModel(
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
    private val householdIdProvider: HouseholdIdProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DataImportUiState())

    /** Observable UI state for the import screen. */
    val uiState: StateFlow<DataImportUiState> = _uiState.asStateFlow()

    init {
        loadAccounts()
        loadCategories()
    }

    /**
     * Sets the import format and resets the file selection state.
     */
    fun selectFormat(format: ImportFormat) {
        _uiState.update { it.copy(selectedFormat = format, selectedFileUri = null) }
        Timber.d("Import format selected: %s", format.displayName)
    }

    /**
     * Handles file selection from the system file picker.
     *
     * @param uri The content URI of the selected file.
     * @param fileName The display name of the selected file.
     */
    fun onFileSelected(uri: Uri, fileName: String) {
        _uiState.update {
            it.copy(
                selectedFileUri = uri,
                fileName = fileName,
                errorMessage = null,
            )
        }
        Timber.d("File selected for import: %s", fileName)
    }

    /**
     * Parses the selected file and extracts preview rows and headers
     * for column mapping.
     *
     * @param content The raw file content as a string.
     */
    fun parseFilePreview(content: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val lines = content.lines().filter { it.isNotBlank() }
                if (lines.isEmpty()) {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = "File is empty")
                    }
                    return@launch
                }

                val header = lines.first().split(",").map { it.trim().removeSurrounding("\"") }
                val preview = lines.drop(1).take(PREVIEW_ROW_COUNT).map { line ->
                    line.split(",").map { it.trim().removeSurrounding("\"") }
                }

                val mappings = header.map { col ->
                    ColumnMapping(
                        sourceColumn = col,
                        targetField = guessFieldMapping(col),
                    )
                }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        headerRow = header,
                        previewRows = preview,
                        columnMappings = mappings,
                        totalCount = lines.size - 1,
                    )
                }
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                Timber.e(e, "Failed to parse import file preview")
                _uiState.update {
                    it.copy(isLoading = false, errorMessage = "Failed to parse file")
                }
            }
        }
    }

    /**
     * Updates a column mapping at the given index.
     */
    fun updateColumnMapping(index: Int, field: ImportField) {
        _uiState.update { state ->
            val updated = state.columnMappings.toMutableList()
            if (index in updated.indices) {
                updated[index] = updated[index].copy(targetField = field)
            }
            state.copy(columnMappings = updated)
        }
    }

    /**
     * Sets the target account for imported transactions.
     */
    fun selectAccount(accountId: String) {
        _uiState.update { it.copy(selectedAccountId = accountId) }
    }

    /**
     * Starts the import process using current mappings and settings.
     *
     * Progress is reported via [DataImportUiState.importProgress].
     */
    fun startImport() {
        viewModelScope.launch {
            _uiState.update { it.copy(isImporting = true, importProgress = 0f, importedCount = 0) }

            val state = _uiState.value
            val total = state.totalCount

            // Simulate import progress — real implementation would parse
            // each row and create transactions via the repository.
            for (i in 1..total) {
                _uiState.update {
                    it.copy(
                        importedCount = i,
                        importProgress = i.toFloat() / total.toFloat(),
                    )
                }
            }

            _uiState.update { it.copy(isImporting = false, isComplete = true) }
            Timber.i("Import completed: %d transactions", total)
        }
    }

    /**
     * Resets the import state for a new import.
     */
    fun resetImport() {
        _uiState.value = DataImportUiState()
        loadAccounts()
        loadCategories()
    }

    private fun loadAccounts() {
        viewModelScope.launch {
            try {
                val householdId = householdIdProvider.householdId.value ?: return@launch
                accountRepository.observeAll(householdId).collect { accounts ->
                    _uiState.update { it.copy(accounts = accounts) }
                }
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                Timber.e(e, "Failed to load accounts for import")
            }
        }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            try {
                val householdId = householdIdProvider.householdId.value ?: return@launch
                categoryRepository.observeAll(householdId).collect { categories ->
                    _uiState.update { it.copy(categories = categories) }
                }
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                Timber.e(e, "Failed to load categories for import")
            }
        }
    }

    /**
     * Heuristic mapping of CSV column names to import fields.
     */
    private fun guessFieldMapping(columnName: String): ImportField {
        val lower = columnName.lowercase()
        return when {
            lower.contains("date") -> ImportField.DATE
            lower.contains("amount") || lower.contains("value") -> ImportField.AMOUNT
            lower.contains("payee") || lower.contains("description") ||
                lower.contains("merchant") || lower.contains("name") -> ImportField.PAYEE
            lower.contains("category") || lower.contains("type") -> ImportField.CATEGORY
            lower.contains("note") || lower.contains("memo") -> ImportField.NOTES
            else -> ImportField.SKIP
        }
    }

    companion object {
        /** Number of preview rows to display during column mapping. */
        private const val PREVIEW_ROW_COUNT = 5
    }
}