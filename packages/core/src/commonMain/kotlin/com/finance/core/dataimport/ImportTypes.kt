// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

/**
 * Supported import file formats.
 *
 * Currently only CSV is supported. JSON import may be added in a future release.
 */
enum class ImportFormat {
    /**
     * CSV import — supports two layouts:
     * - **Multi-section**: the format produced by [com.finance.core.export.CsvExportSerializer],
     *   with `# SECTION_NAME` headers separating entity types.
     * - **Single-entity transaction**: a flat CSV with one row per transaction,
     *   suitable for importing bank statement exports.
     */
    CSV,
}

/**
 * Successful import result containing parsed data and processing statistics.
 *
 * @property data Parsed domain entities ready for persistence.
 * @property warnings Non-fatal issues encountered during parsing (e.g., unknown columns,
 *                    unparseable optional fields that were skipped).
 * @property stats Summary counts of rows processed, succeeded, and skipped.
 */
data class ImportResult(
    val data: ImportData,
    val warnings: List<ImportWarning>,
    val stats: ImportStats,
)

/**
 * Summary statistics for an import operation.
 *
 * @property totalRows Total number of data rows encountered across all sections
 *                     (excludes headers, comments, and blank lines).
 * @property successfulRows Number of rows that were successfully parsed into entities.
 * @property skippedRows Number of rows that were skipped due to parse errors.
 * @property entityCounts Breakdown of successfully parsed entities by type.
 */
data class ImportStats(
    val totalRows: Int,
    val successfulRows: Int,
    val skippedRows: Int,
    val entityCounts: ImportEntityCounts,
)

/**
 * Per-entity-type record counts from a successful import.
 */
data class ImportEntityCounts(
    val accounts: Int,
    val transactions: Int,
    val categories: Int,
    val budgets: Int,
    val goals: Int,
) {
    /** Total number of records across all entity types. */
    val total: Int get() = accounts + transactions + categories + budgets + goals
}

/**
 * Non-fatal warning encountered during import.
 *
 * Warnings indicate data quality issues that did not prevent the row from being
 * parsed, but may warrant user attention (e.g., an unknown column was ignored,
 * an optional field had an unparseable value and was defaulted).
 *
 * @property row 1-based row number within the section where the warning occurred.
 * @property column Column name associated with the warning, or empty if row-level.
 * @property message Human-readable description of the issue.
 */
data class ImportWarning(
    val row: Int,
    val column: String,
    val message: String,
)

/**
 * Sealed hierarchy of import errors for exhaustive `when` handling.
 *
 * Follows the project-wide sealed-error pattern established by
 * [com.finance.core.export.ExportError] and [com.finance.core.validation.ValidationError].
 */
sealed class ImportError(val message: String) {
    /** The CSV content is empty or contains only whitespace. */
    data class EmptyFile(
        val detail: String = "Import file is empty or contains no data",
    ) : ImportError(detail)

    /** The CSV content cannot be parsed (e.g., malformed quoting, invalid structure). */
    data class InvalidFormat(
        val detail: String,
    ) : ImportError("Invalid CSV format: $detail")

    /**
     * A required column is missing from a section's header row.
     *
     * @property column The missing column name.
     * @property section The section (e.g., "ACCOUNTS") where the column was expected.
     */
    data class MissingRequiredColumn(
        val column: String,
        val section: String,
    ) : ImportError("Missing required column '$column' in $section section")

    /**
     * A data value could not be parsed to the expected type.
     *
     * @property row 1-based row number within the section.
     * @property column Column name that failed to parse.
     * @property cause Description of the parse failure.
     */
    data class ParseFailed(
        val row: Int,
        val column: String,
        val cause: String,
    ) : ImportError("Parse error at row $row, column '$column': $cause")
}

/**
 * Outcome of an import operation — either [Success] or [Failure].
 *
 * Follows the project-wide pattern of sealed class outcomes for exhaustive
 * `when` handling, avoiding exceptions for business-logic errors.
 */
sealed class ImportOutcome {
    /** Import completed successfully with parsed data. */
    data class Success(val result: ImportResult) : ImportOutcome()

    /** Import failed with a domain-specific error. */
    data class Failure(val error: ImportError) : ImportOutcome()
}
