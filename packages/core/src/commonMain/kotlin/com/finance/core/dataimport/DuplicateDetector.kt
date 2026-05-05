// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate

/**
 * Detects potential duplicate transactions by matching imported transactions
 * against existing ones based on date, amount, and merchant/description.
 *
 * Duplicate detection uses a composite key of `(date, amount, normalisedDescription)`
 * to identify matches. This approach balances precision (avoiding false positives
 * from same-day same-merchant purchases of different amounts) with recall (catching
 * duplicates even when descriptions vary slightly).
 */
object DuplicateDetector {

    /**
     * Fingerprint used for matching. Composed of the transaction's date,
     * amount, and a normalised version of the description.
     */
    data class TransactionFingerprint(
        val date: LocalDate,
        val amount: Cents,
        val normalisedDescription: String,
    )

    /**
     * Result of duplicate detection for a batch of imported transactions.
     *
     * @property duplicateIndices Set of 0-based indices into the input list
     *                            that are flagged as potential duplicates.
     * @property uniqueTransactions Transactions not flagged as duplicates.
     * @property duplicateTransactions Transactions flagged as duplicates.
     */
    data class DuplicateResult(
        val duplicateIndices: Set<Int>,
        val uniqueTransactions: List<ParsedTransaction>,
        val duplicateTransactions: List<ParsedTransaction>,
    ) {
        /** Total number of potential duplicates found. */
        val duplicateCount: Int get() = duplicateIndices.size
    }

    /**
     * Detect duplicates in [imported] transactions against a set of [existing] fingerprints.
     *
     * @param imported The list of newly parsed transactions to check.
     * @param existing Fingerprints of transactions already in the database.
     * @return [DuplicateResult] containing indices and filtered lists.
     */
    fun detect(
        imported: List<ParsedTransaction>,
        existing: Set<TransactionFingerprint>,
    ): DuplicateResult {
        val duplicateIndices = mutableSetOf<Int>()
        val unique = mutableListOf<ParsedTransaction>()
        val duplicates = mutableListOf<ParsedTransaction>()

        for ((index, tx) in imported.withIndex()) {
            val fingerprint = fingerprint(tx)
            if (fingerprint in existing) {
                duplicateIndices.add(index)
                duplicates.add(tx)
            } else {
                unique.add(tx)
            }
        }

        return DuplicateResult(
            duplicateIndices = duplicateIndices,
            uniqueTransactions = unique,
            duplicateTransactions = duplicates,
        )
    }

    /**
     * Also detect duplicates within the imported batch itself (intra-batch duplicates).
     *
     * @param imported The list of newly parsed transactions to check.
     * @param existing Fingerprints of transactions already in the database.
     * @return [DuplicateResult] including both cross-set and intra-batch duplicates.
     */
    fun detectWithIntraBatch(
        imported: List<ParsedTransaction>,
        existing: Set<TransactionFingerprint>,
    ): DuplicateResult {
        val duplicateIndices = mutableSetOf<Int>()
        val unique = mutableListOf<ParsedTransaction>()
        val duplicates = mutableListOf<ParsedTransaction>()
        val seen = mutableSetOf<TransactionFingerprint>()
        seen.addAll(existing)

        for ((index, tx) in imported.withIndex()) {
            val fp = fingerprint(tx)
            if (fp in seen) {
                duplicateIndices.add(index)
                duplicates.add(tx)
            } else {
                seen.add(fp)
                unique.add(tx)
            }
        }

        return DuplicateResult(
            duplicateIndices = duplicateIndices,
            uniqueTransactions = unique,
            duplicateTransactions = duplicates,
        )
    }

    /**
     * Create a [TransactionFingerprint] from a [ParsedTransaction].
     *
     * @param tx The parsed transaction.
     * @return A fingerprint suitable for duplicate matching.
     */
    fun fingerprint(tx: ParsedTransaction): TransactionFingerprint {
        return TransactionFingerprint(
            date = tx.date,
            amount = tx.amount,
            normalisedDescription = normalise(tx.description),
        )
    }

    /**
     * Create a [TransactionFingerprint] from raw components.
     *
     * Useful for building fingerprints from existing database records.
     *
     * @param date Transaction date.
     * @param amount Transaction amount in cents.
     * @param description Payee/merchant description.
     * @return A normalised fingerprint.
     */
    fun fingerprint(date: LocalDate, amount: Cents, description: String): TransactionFingerprint {
        return TransactionFingerprint(
            date = date,
            amount = amount,
            normalisedDescription = normalise(description),
        )
    }

    /**
     * Normalise a description string for fuzzy matching.
     *
     * Lowercases, trims, collapses whitespace, and removes common
     * suffixes like transaction IDs and reference numbers.
     */
    internal fun normalise(description: String): String {
        return description
            .lowercase()
            .trim()
            .replace(Regex("\\s+"), " ")
            .replace(Regex("#\\d+"), "") // Remove reference numbers
            .replace(Regex("\\b\\d{6,}\\b"), "") // Remove long digit sequences
            .trim()
    }
}
