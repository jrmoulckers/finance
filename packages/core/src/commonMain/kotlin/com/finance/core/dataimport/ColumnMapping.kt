// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import kotlinx.serialization.Serializable

/**
 * Describes a logical column role that an import CSV column can be mapped to.
 *
 * Each role corresponds to a field on [com.finance.models.Transaction] or
 * related domain entities. The import engine uses these roles to decide
 * how to interpret each column during parsing.
 */
@Serializable
enum class ColumnRole {
    /** Transaction date (required). */
    DATE,

    /** Monetary amount (required). */
    AMOUNT,

    /** Payee / merchant / description (required). */
    DESCRIPTION,

    /** Category name for the transaction. */
    CATEGORY,

    /** Additional notes / memo field. */
    NOTE,

    /** Transaction type indicator (debit/credit, expense/income). */
    TYPE,

    /** Currency code (ISO 4217). */
    CURRENCY,

    /** Account name or identifier. */
    ACCOUNT,

    /** Tags or labels (comma-separated). */
    TAGS,

    /** Transaction status. */
    STATUS,

    /** Column should be ignored during import. */
    IGNORED,
}

/**
 * Maps a source CSV column (by header name) to a [ColumnRole].
 *
 * @property sourceColumn The original header name from the CSV file.
 * @property role The logical role assigned to this column.
 * @property confidence Auto-detection confidence in `[0.0, 1.0]`;
 *                      `1.0` for exact header matches, lower for heuristic guesses.
 */
@Serializable
data class ColumnMapping(
    val sourceColumn: String,
    val role: ColumnRole,
    val confidence: Double = 1.0,
) {
    init {
        require(confidence in 0.0..1.0) { "Confidence must be in [0.0, 1.0], was $confidence" }
    }
}

/**
 * The result of auto-detecting column roles from a CSV header row.
 *
 * @property mappings Detected mappings sorted by column order.
 * @property unmappedColumns Column headers that could not be auto-detected
 *                           and default to [ColumnRole.IGNORED].
 * @property missingRequired Required roles that were not found in any column.
 */
@Serializable
data class ColumnDetectionResult(
    val mappings: List<ColumnMapping>,
    val unmappedColumns: List<String>,
    val missingRequired: List<ColumnRole>,
) {
    /** `true` when all required columns (DATE, AMOUNT, DESCRIPTION) are mapped. */
    val isComplete: Boolean get() = missingRequired.isEmpty()
}

/**
 * Detects column roles from CSV header names using keyword matching.
 *
 * The detector maintains a priority-ordered list of known header synonyms
 * for each [ColumnRole]. It matches case-insensitively and assigns the
 * first matching role found. Unrecognised headers default to [ColumnRole.IGNORED].
 */
object ColumnDetector {

    private val REQUIRED_ROLES = listOf(ColumnRole.DATE, ColumnRole.AMOUNT, ColumnRole.DESCRIPTION)

    /**
     * Keyword lists per role — order matters: first match wins.
     * Each pair is (role, list of lowercase header keywords/prefixes).
     */
    private val ROLE_KEYWORDS: List<Pair<ColumnRole, List<String>>> = listOf(
        ColumnRole.DATE to listOf("date", "trans_date", "transaction date", "posted", "posting date"),
        ColumnRole.AMOUNT to listOf(
            "amount", "debit", "credit", "sum", "value",
            "inflow", "outflow", "transaction amount",
        ),
        ColumnRole.DESCRIPTION to listOf(
            "description", "payee", "merchant", "memo", "name",
            "original description", "transaction",
        ),
        ColumnRole.CATEGORY to listOf("category", "labels", "group", "type"),
        ColumnRole.NOTE to listOf("note", "notes", "comment", "remarks"),
        ColumnRole.CURRENCY to listOf("currency", "curr"),
        ColumnRole.ACCOUNT to listOf("account", "account name"),
        ColumnRole.TAGS to listOf("tag", "tags", "label"),
        ColumnRole.STATUS to listOf("status", "state"),
    )

    /**
     * Auto-detect column roles from the given [headers].
     *
     * @param headers The list of CSV column header strings.
     * @return A [ColumnDetectionResult] with mappings and diagnostics.
     */
    fun detect(headers: List<String>): ColumnDetectionResult {
        val assignedRoles = mutableSetOf<ColumnRole>()
        val mappings = mutableListOf<ColumnMapping>()
        val unmapped = mutableListOf<String>()

        for (header in headers) {
            val normalised = header.trim().lowercase()
            val match = findRole(normalised, assignedRoles)
            if (match != null) {
                assignedRoles.add(match.first)
                mappings.add(ColumnMapping(header, match.first, match.second))
            } else {
                unmapped.add(header)
                mappings.add(ColumnMapping(header, ColumnRole.IGNORED, 0.0))
            }
        }

        val missingRequired = REQUIRED_ROLES.filter { it !in assignedRoles }
        return ColumnDetectionResult(mappings, unmapped, missingRequired)
    }

    /**
     * Finds the best matching [ColumnRole] for a normalised header string.
     *
     * @return Pair of (role, confidence) or `null` if no match.
     */
    @Suppress("ReturnCount")
    private fun findRole(
        normalisedHeader: String,
        alreadyAssigned: Set<ColumnRole>,
    ): Pair<ColumnRole, Double>? {
        for ((role, keywords) in ROLE_KEYWORDS) {
            if (role in alreadyAssigned) continue
            for (keyword in keywords) {
                if (normalisedHeader == keyword) return role to 1.0
                if (normalisedHeader.contains(keyword)) return role to 0.8
            }
        }
        return null
    }
}
