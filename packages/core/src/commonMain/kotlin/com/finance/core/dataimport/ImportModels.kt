// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * A single parsed transaction row from an import file, before it is
 * mapped to the full [com.finance.models.Transaction] domain model.
 *
 * This intermediate representation captures exactly what the source
 * file provides. Fields that are absent in the source file are `null`.
 *
 * @property date The transaction date.
 * @property amount The monetary amount in cents.
 * @property description Payee or merchant description.
 * @property category Category name from the source file (may not match app categories).
 * @property note Additional notes or memo.
 * @property type Source-provided type hint (e.g., "debit", "credit").
 * @property currency Transaction currency (defaults to account currency).
 * @property account Account name from the source file.
 * @property tags Comma-separated tags from the source file.
 * @property sourceRowNumber The 1-based row number in the original file (for error reporting).
 */
@Serializable
data class ParsedTransaction(
    val date: LocalDate,
    val amount: Cents,
    val description: String,
    val category: String? = null,
    val note: String? = null,
    val type: String? = null,
    val currency: Currency? = null,
    val account: String? = null,
    val tags: List<String> = emptyList(),
    val sourceRowNumber: Int = 0,
)

/**
 * A row that failed to parse, with its error details preserved for user review.
 *
 * @property rowNumber 1-based row number in the source file.
 * @property rawFields The raw field values from the CSV row.
 * @property errors Human-readable error messages explaining why parsing failed.
 */
@Serializable
data class ImportRowError(
    val rowNumber: Int,
    val rawFields: List<String>,
    val errors: List<String>,
)

/**
 * Preview of parsed import data shown to the user before committing.
 *
 * @property transactions Successfully parsed transactions.
 * @property errorRows Rows that failed to parse.
 * @property columnMappings Column mappings used (auto-detected or user-overridden).
 * @property sourceFormat The detected source format.
 * @property totalRowCount Total rows in the source file (including errors).
 * @property duplicateCount Number of transactions flagged as potential duplicates.
 */
@Serializable
data class ImportPreview(
    val transactions: List<ParsedTransaction>,
    val errorRows: List<ImportRowError>,
    val columnMappings: List<ColumnMapping>,
    val sourceFormat: ImportSourceFormat,
    val totalRowCount: Int,
    val duplicateCount: Int = 0,
) {
    /** Number of successfully parsed rows. */
    val successCount: Int get() = transactions.size

    /** Number of rows that failed to parse. */
    val errorCount: Int get() = errorRows.size

    /** Success rate as a fraction in [0.0, 1.0]. */
    val successRate: Double
        get() = if (totalRowCount > 0) successCount.toDouble() / totalRowCount else 0.0
}

/**
 * Supported source file formats for import.
 */
@Serializable
enum class ImportSourceFormat {
    /** Generic CSV with configurable column mapping. */
    GENERIC_CSV,

    /** Mint export format (CSV with Mint-specific columns). */
    MINT,

    /** YNAB4 (legacy) register export (CSV). */
    YNAB4,

    /** nYNAB (new YNAB) register export (CSV). */
    NYNAB,
}

/**
 * Tracks import progress during batch processing.
 *
 * @property phase Current phase of the import pipeline.
 * @property processedRows Number of rows processed so far.
 * @property totalRows Total rows to process.
 * @property currentBatch Current batch number (1-based).
 * @property totalBatches Total number of batches.
 */
@Serializable
data class ImportProgress(
    val phase: ImportPhase,
    val processedRows: Int,
    val totalRows: Int,
    val currentBatch: Int = 1,
    val totalBatches: Int = 1,
) {
    /** Completion fraction in [0.0, 1.0]. */
    val fraction: Float get() = if (totalRows > 0) processedRows.toFloat() / totalRows else 0f

    /** Completion percentage (0–100). */
    val percentage: Int get() = (fraction * 100).toInt()
}

/**
 * Phases of the import pipeline, reported via [ImportProgress].
 */
@Serializable
enum class ImportPhase {
    /** Detecting file format and column mapping. */
    DETECTING_FORMAT,

    /** Parsing rows from the source file. */
    PARSING,

    /** Checking for duplicate transactions. */
    DETECTING_DUPLICATES,

    /** Mapping source categories to app categories. */
    MAPPING_CATEGORIES,

    /** Import completed. */
    COMPLETE,
}
