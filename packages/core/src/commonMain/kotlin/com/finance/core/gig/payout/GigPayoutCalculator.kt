// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.gig.payout

import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlinx.datetime.plus
import kotlinx.serialization.Serializable
import kotlin.math.abs

/**
 * Pure Kotlin Multiplatform helpers for gig-platform income attribution and payout reconciliation.
 * Amounts are always represented as integer cents via [Cents].
 */
object GigPayoutCalculator {
    const val UNMATCHED_PLATFORM_NAME = "Unmatched"

    /**
     * Find the best platform mapping for a payee, transaction description, or deposit account name.
     */
    fun matchPlatform(
        input: GigPayoutMatchInput,
        mappings: List<GigPlatformMapping>,
    ): GigPlatformMatch? = GigPlatformMatcher.match(input, mappings)

    /**
     * Groups non-deleted, non-void income transactions by matched gig platform.
     */
    fun groupIncomeByPlatform(
        transactions: List<Transaction>,
        mappings: List<GigPlatformMapping>,
        accountNamesById: Map<SyncId, String> = emptyMap(),
        from: LocalDate? = null,
        to: LocalDate? = null,
        includeUnmatched: Boolean = true,
    ): List<GigPlatformIncomeGroup> {
        val mappingOrder = mappings.mapIndexed { index, mapping -> mapping.platformId to index }.toMap()
        val buckets = linkedMapOf<String?, MutableGigPlatformIncomeGroup>()

        transactions
            .filter { transaction -> transaction.isEligibleIncome(from, to) }
            .forEach { transaction ->
                val match = matchPlatform(transaction.toMatchInput(accountNamesById), mappings)
                val platformId = match?.platformId
                if (platformId == null && !includeUnmatched) return@forEach

                val bucket = buckets.getOrPut(platformId) {
                    MutableGigPlatformIncomeGroup(
                        platformId = platformId,
                        platformName = match?.platformName ?: UNMATCHED_PLATFORM_NAME,
                    )
                }
                val received = transaction.amount.abs()
                bucket.totalReceived += received
                bucket.transactions += GigPlatformIncomeTransaction(
                    transactionId = transaction.id,
                    platformId = platformId,
                    amount = received,
                    date = transaction.date,
                    payee = transaction.payee,
                    description = transaction.note,
                    accountId = transaction.accountId,
                    match = match,
                )
            }

        return buckets.values
            .map { bucket -> bucket.toGroup() }
            .sortedWith(
                compareBy<GigPlatformIncomeGroup> { group ->
                    group.platformId?.let { mappingOrder[it] } ?: Int.MAX_VALUE
                }.thenBy { it.platformName },
            )
    }

    /**
     * Converts matched income transactions into received payouts for reconciliation.
     */
    fun receivedPayoutsFromTransactions(
        transactions: List<Transaction>,
        mappings: List<GigPlatformMapping>,
        accountNamesById: Map<SyncId, String> = emptyMap(),
        from: LocalDate? = null,
        to: LocalDate? = null,
    ): List<ReceivedGigPayout> {
        return transactions
            .filter { transaction -> transaction.isEligibleIncome(from, to) }
            .mapNotNull { transaction ->
                val match = matchPlatform(transaction.toMatchInput(accountNamesById), mappings) ?: return@mapNotNull null
                ReceivedGigPayout(
                    id = transaction.id.value,
                    platformId = match.platformId,
                    amount = transaction.amount.abs(),
                    receivedDate = transaction.date,
                    transactionId = transaction.id,
                )
            }
    }

    /**
     * Reconciles expected platform payouts against received payout transactions.
     *
     * Matching is platform-specific and date bounded. A received payout is used at most once.
     */
    fun reconcile(
        expectedPayouts: List<ExpectedGigPayout>,
        receivedPayouts: List<ReceivedGigPayout>,
        dateToleranceDays: Int = 0,
        defaultToleranceCents: Cents = Cents.ZERO,
    ): GigPayoutReconciliation {
        require(dateToleranceDays >= 0) { "dateToleranceDays must be non-negative" }
        require(defaultToleranceCents.amount >= 0) { "defaultToleranceCents must be non-negative" }

        val unusedReceived = receivedPayouts
            .sortedWith(compareBy<ReceivedGigPayout> { it.receivedDate }.thenBy { it.id })
            .toMutableList()
        val items = expectedPayouts
            .sortedWith(compareBy<ExpectedGigPayout> { it.expectedDate }.thenBy { it.id })
            .map { expected ->
                val tolerance = maxOf(expected.toleranceCents.amount, defaultToleranceCents.amount)
                val candidates = unusedReceived
                    .filter { received -> received.matchesExpected(expected, dateToleranceDays) }
                    .sortedWith(
                        compareBy<ReceivedGigPayout> { received ->
                            abs(expected.expectedDate.daysUntil(received.receivedDate))
                        }.thenBy { it.receivedDate }.thenBy { it.id },
                    )

                val selected = selectReceivedPayouts(expected, candidates, tolerance)
                unusedReceived.removeAll(selected.toSet())
                expected.toReconciliationItem(selected, tolerance)
            }

        val unexpected = unusedReceived.map { received ->
            UnexpectedGigPayout(
                received = received,
                reason = UnexpectedGigPayoutReason.NO_EXPECTED_PAYOUT,
            )
        }

        return GigPayoutReconciliation(
            items = items,
            unexpectedReceived = unexpected,
            totalExpected = expectedPayouts.fold(Cents.ZERO) { total, expected -> total + expected.expectedAmount },
            totalReceived = receivedPayouts.fold(Cents.ZERO) { total, received -> total + received.amount.abs() },
        )
    }

    private fun selectReceivedPayouts(
        expected: ExpectedGigPayout,
        candidates: List<ReceivedGigPayout>,
        toleranceCents: Long,
    ): List<ReceivedGigPayout> {
        val exactSingle = candidates.firstOrNull { received ->
            (received.amount.abs() - expected.expectedAmount).absAmount() <= toleranceCents
        }
        if (exactSingle != null) return listOf(exactSingle)

        val selected = mutableListOf<ReceivedGigPayout>()
        var total = Cents.ZERO
        candidates.forEach { received ->
            selected += received
            total += received.amount.abs()
            val variance = total - expected.expectedAmount
            if (variance.absAmount() <= toleranceCents || total.amount >= expected.expectedAmount.amount) {
                return selected
            }
        }
        return selected
    }
}

/** A platform mapping with field-specific, case-insensitive contains patterns. */
@Serializable
data class GigPlatformMapping(
    val platformId: String,
    val displayName: String,
    val payeePatterns: List<String> = emptyList(),
    val descriptionPatterns: List<String> = emptyList(),
    val accountPatterns: List<String> = emptyList(),
) {
    init {
        require(platformId.isNotBlank()) { "platformId cannot be blank" }
        require(displayName.isNotBlank()) { "displayName cannot be blank" }
        require(allPatterns.isNotEmpty()) { "At least one matching pattern is required" }
        require(allPatterns.all { it.isNotBlank() }) { "Matching patterns cannot be blank" }
    }

    val allPatterns: List<String>
        get() = payeePatterns + descriptionPatterns + accountPatterns
}

/** Input signals used by [GigPlatformMatcher]. */
@Serializable
data class GigPayoutMatchInput(
    val payee: String? = null,
    val description: String? = null,
    val accountName: String? = null,
)

/** Details for the selected platform mapping. */
@Serializable
data class GigPlatformMatch(
    val platformId: String,
    val platformName: String,
    val score: Int,
    val matchedFields: List<GigPayoutMatchField>,
    val matchedPatterns: List<String>,
)

@Serializable
enum class GigPayoutMatchField { PAYEE, DESCRIPTION, ACCOUNT }

/** Deterministic matcher for platform-neutral payee/description/account matching. */
object GigPlatformMatcher {
    private const val PAYEE_WEIGHT = 100
    private const val DESCRIPTION_WEIGHT = 70
    private const val ACCOUNT_WEIGHT = 40
    private const val EXACT_MATCH_BONUS = 25

    fun match(input: GigPayoutMatchInput, mappings: List<GigPlatformMapping>): GigPlatformMatch? {
        var best: GigPlatformMatch? = null
        mappings.forEach { mapping ->
            val candidate = scoreMapping(input, mapping)
            if (candidate != null && (best == null || candidate.score > best!!.score)) {
                best = candidate
            }
        }
        return best
    }

    private fun scoreMapping(input: GigPayoutMatchInput, mapping: GigPlatformMapping): GigPlatformMatch? {
        val matches = mutableListOf<FieldPatternMatch>()
        matches += findMatches(input.payee, mapping.payeePatterns, GigPayoutMatchField.PAYEE, PAYEE_WEIGHT)
        matches += findMatches(
            input.description,
            mapping.descriptionPatterns,
            GigPayoutMatchField.DESCRIPTION,
            DESCRIPTION_WEIGHT,
        )
        matches += findMatches(
            input.accountName,
            mapping.accountPatterns,
            GigPayoutMatchField.ACCOUNT,
            ACCOUNT_WEIGHT,
        )

        if (matches.isEmpty()) return null
        return GigPlatformMatch(
            platformId = mapping.platformId,
            platformName = mapping.displayName,
            score = matches.sumOf { it.score },
            matchedFields = matches.map { it.field }.distinct(),
            matchedPatterns = matches.map { it.pattern }.distinct(),
        )
    }

    private fun findMatches(
        value: String?,
        patterns: List<String>,
        field: GigPayoutMatchField,
        weight: Int,
    ): List<FieldPatternMatch> {
        val normalizedValue = value.normalizedForPlatformMatch()
        if (normalizedValue.isEmpty()) return emptyList()

        return patterns.mapNotNull { pattern ->
            val normalizedPattern = pattern.normalizedForPlatformMatch()
            if (normalizedPattern.isEmpty() || !normalizedValue.contains(normalizedPattern)) return@mapNotNull null
            val exactBonus = if (normalizedValue == normalizedPattern) EXACT_MATCH_BONUS else 0
            FieldPatternMatch(
                field = field,
                pattern = pattern,
                score = weight + exactBonus + normalizedPattern.length,
            )
        }
    }
}

/** Common gig-platform defaults that mirror web merchant seed fixtures for Uber, Lyft, and DoorDash. */
object GigPlatformDefaults {
    val mappings: List<GigPlatformMapping> = listOf(
        GigPlatformMapping(
            platformId = "uber",
            displayName = "Uber",
            payeePatterns = listOf("Uber", "Uber Technologies", "Uber BV"),
            descriptionPatterns = listOf("Uber trip", "Uber eats", "Uber payout", "Uber driver"),
            accountPatterns = listOf("Uber"),
        ),
        GigPlatformMapping(
            platformId = "lyft",
            displayName = "Lyft",
            payeePatterns = listOf("Lyft"),
            descriptionPatterns = listOf("Lyft payout", "Lyft ride", "Lyft driver"),
            accountPatterns = listOf("Lyft"),
        ),
        GigPlatformMapping(
            platformId = "doordash",
            displayName = "DoorDash",
            payeePatterns = listOf("DoorDash", "Door Dash", "DasherDirect"),
            descriptionPatterns = listOf("DoorDash payout", "Dasher payout", "Door Dash"),
            accountPatterns = listOf("DoorDash", "Dasher"),
        ),
        GigPlatformMapping(
            platformId = "instacart",
            displayName = "Instacart",
            payeePatterns = listOf("Instacart", "Maplebear"),
            descriptionPatterns = listOf("Instacart shopper", "Instacart payout"),
            accountPatterns = listOf("Instacart"),
        ),
        GigPlatformMapping(
            platformId = "grubhub",
            displayName = "Grubhub",
            payeePatterns = listOf("Grubhub"),
            descriptionPatterns = listOf("Grubhub payout", "Grubhub driver"),
            accountPatterns = listOf("Grubhub"),
        ),
        GigPlatformMapping(
            platformId = "shipt",
            displayName = "Shipt",
            payeePatterns = listOf("Shipt"),
            descriptionPatterns = listOf("Shipt shopper", "Shipt payout"),
            accountPatterns = listOf("Shipt"),
        ),
        GigPlatformMapping(
            platformId = "upwork",
            displayName = "Upwork",
            payeePatterns = listOf("Upwork"),
            descriptionPatterns = listOf("Upwork payout", "Upwork freelance"),
            accountPatterns = listOf("Upwork"),
        ),
        GigPlatformMapping(
            platformId = "fiverr",
            displayName = "Fiverr",
            payeePatterns = listOf("Fiverr"),
            descriptionPatterns = listOf("Fiverr payout", "Fiverr freelance"),
            accountPatterns = listOf("Fiverr"),
        ),
    )
}

/** A matched income transaction inside a platform group. */
@Serializable
data class GigPlatformIncomeTransaction(
    val transactionId: SyncId,
    val platformId: String?,
    val amount: Cents,
    val date: LocalDate,
    val payee: String?,
    val description: String?,
    val accountId: SyncId,
    val match: GigPlatformMatch?,
)

/** Income totals for one platform, or an unmatched bucket when [platformId] is null. */
@Serializable
data class GigPlatformIncomeGroup(
    val platformId: String?,
    val platformName: String,
    val totalReceived: Cents,
    val transactionCount: Int,
    val transactionIds: List<SyncId>,
    val transactions: List<GigPlatformIncomeTransaction>,
)

/** Expected payout for a platform and date. */
@Serializable
data class ExpectedGigPayout(
    val id: String,
    val platformId: String,
    val expectedAmount: Cents,
    val expectedDate: LocalDate,
    val toleranceCents: Cents = Cents.ZERO,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
        require(platformId.isNotBlank()) { "platformId cannot be blank" }
        require(expectedAmount.amount > 0) { "expectedAmount must be positive" }
        require(toleranceCents.amount >= 0) { "toleranceCents must be non-negative" }
    }
}

/** Received payout, usually derived from a matched income transaction. */
@Serializable
data class ReceivedGigPayout(
    val id: String,
    val platformId: String,
    val amount: Cents,
    val receivedDate: LocalDate,
    val transactionId: SyncId? = null,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
        require(platformId.isNotBlank()) { "platformId cannot be blank" }
        require(amount.amount != 0L) { "amount cannot be zero" }
    }
}

@Serializable
enum class GigPayoutReconciliationStatus { MATCHED, PARTIAL, MISSING, OVERPAID }

@Serializable
data class GigPayoutReconciliationItem(
    val expected: ExpectedGigPayout,
    val status: GigPayoutReconciliationStatus,
    val received: List<ReceivedGigPayout>,
    val receivedAmount: Cents,
    val variance: Cents,
)

@Serializable
enum class UnexpectedGigPayoutReason { NO_EXPECTED_PAYOUT }

@Serializable
data class UnexpectedGigPayout(
    val received: ReceivedGigPayout,
    val reason: UnexpectedGigPayoutReason,
)

@Serializable
data class GigPayoutReconciliation(
    val items: List<GigPayoutReconciliationItem>,
    val unexpectedReceived: List<UnexpectedGigPayout>,
    val totalExpected: Cents,
    val totalReceived: Cents,
) {
    val matchedItems: List<GigPayoutReconciliationItem>
        get() = items.filter { it.status == GigPayoutReconciliationStatus.MATCHED }

    val partialItems: List<GigPayoutReconciliationItem>
        get() = items.filter { it.status == GigPayoutReconciliationStatus.PARTIAL }

    val missingItems: List<GigPayoutReconciliationItem>
        get() = items.filter { it.status == GigPayoutReconciliationStatus.MISSING }

    val overpaidItems: List<GigPayoutReconciliationItem>
        get() = items.filter { it.status == GigPayoutReconciliationStatus.OVERPAID }
}

private data class FieldPatternMatch(
    val field: GigPayoutMatchField,
    val pattern: String,
    val score: Int,
)

private data class MutableGigPlatformIncomeGroup(
    val platformId: String?,
    val platformName: String,
    var totalReceived: Cents = Cents.ZERO,
    val transactions: MutableList<GigPlatformIncomeTransaction> = mutableListOf(),
) {
    fun toGroup(): GigPlatformIncomeGroup = GigPlatformIncomeGroup(
        platformId = platformId,
        platformName = platformName,
        totalReceived = totalReceived,
        transactionCount = transactions.size,
        transactionIds = transactions.map { it.transactionId },
        transactions = transactions.toList(),
    )
}

private fun Transaction.isEligibleIncome(from: LocalDate?, to: LocalDate?): Boolean {
    return type == TransactionType.INCOME &&
        status != TransactionStatus.VOID &&
        deletedAt == null &&
        (from == null || date >= from) &&
        (to == null || date <= to)
}

private fun Transaction.toMatchInput(accountNamesById: Map<SyncId, String>): GigPayoutMatchInput {
    return GigPayoutMatchInput(
        payee = payee,
        description = note,
        accountName = accountNamesById[accountId],
    )
}

private fun ReceivedGigPayout.matchesExpected(expected: ExpectedGigPayout, dateToleranceDays: Int): Boolean {
    val earliest = expected.expectedDate.plus(-dateToleranceDays, DateTimeUnit.DAY)
    val latest = expected.expectedDate.plus(dateToleranceDays, DateTimeUnit.DAY)
    return platformId == expected.platformId && receivedDate in earliest..latest
}

private fun ExpectedGigPayout.toReconciliationItem(
    received: List<ReceivedGigPayout>,
    toleranceCents: Long,
): GigPayoutReconciliationItem {
    val receivedAmount = received.fold(Cents.ZERO) { total, payout -> total + payout.amount.abs() }
    val variance = receivedAmount - expectedAmount
    val status = when {
        received.isEmpty() -> GigPayoutReconciliationStatus.MISSING
        variance.absAmount() <= toleranceCents -> GigPayoutReconciliationStatus.MATCHED
        variance.amount < 0 -> GigPayoutReconciliationStatus.PARTIAL
        else -> GigPayoutReconciliationStatus.OVERPAID
    }

    return GigPayoutReconciliationItem(
        expected = this,
        status = status,
        received = received,
        receivedAmount = receivedAmount,
        variance = variance,
    )
}

private fun String?.normalizedForPlatformMatch(): String {
    if (this.isNullOrBlank()) return ""
    return lowercase()
        .map { char -> if (char.isLetterOrDigit()) char else ' ' }
        .joinToString(separator = "")
        .trim()
        .replace(Regex("\\s+"), " ")
}

private fun Cents.absAmount(): Long = abs(amount)
