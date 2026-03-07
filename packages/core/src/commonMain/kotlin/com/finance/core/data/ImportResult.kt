package com.finance.core.data

import com.finance.models.Transaction
import kotlinx.serialization.Serializable

/**
 * Result of a CSV import operation.
 *
 * Separates successfully imported transactions from rows that were
 * skipped (duplicates) or failed (parse errors), giving the caller
 * full visibility into the outcome.
 */
data class ImportResult(
    /** Transactions that were successfully parsed and imported. */
    val imported: List<Transaction>,
    /** Number of rows skipped because they matched existing transactions. */
    val skippedCount: Int,
    /** Rows that matched one or more existing transactions. */
    val duplicates: List<DuplicateMatch>,
    /** Per-row parse or validation errors. */
    val errors: List<ImportError>,
) {
    /** Convenience: number of successfully imported transactions. */
    val importedCount: Int get() = imported.size

    /** Convenience: number of rows that could not be parsed. */
    val errorCount: Int get() = errors.size
}

/**
 * A potential duplicate: an imported transaction that closely matches
 * an existing one (same date, amount, and payee).
 */
data class DuplicateMatch(
    /** The newly parsed transaction that looks like a duplicate. */
    val imported: Transaction,
    /** The existing transaction it appears to duplicate. */
    val existing: Transaction,
)

/**
 * Describes a single row-level import failure.
 */
@Serializable
data class ImportError(
    /** 1-based row number in the source CSV (excluding header). */
    val row: Int,
    /** Human-readable description of what went wrong. */
    val message: String,
)
