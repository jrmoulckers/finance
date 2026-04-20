// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.subscription

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Detects recurring subscription patterns in transaction history.
 *
 * The engine analyses payee names, amounts, and date intervals to
 * identify transactions that recur on a predictable schedule (monthly,
 * weekly, yearly, etc.).
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 */
object SubscriptionDetector {

    /** Tolerance for amount matching: two amounts are "similar" if within this percentage. */
    private const val AMOUNT_TOLERANCE_PERCENT = 10.0

    /** Minimum number of occurrences to consider a pattern a subscription. */
    private const val MIN_OCCURRENCES = 2

    /** Interval tolerance in days for pattern matching. */
    private const val INTERVAL_TOLERANCE_DAYS = 3

    /**
     * Detect subscriptions from a list of transactions.
     *
     * Algorithm:
     * 1. Group expense transactions by normalised payee name.
     * 2. For each payee group with ≥ [MIN_OCCURRENCES] transactions:
     *    a. Sort by date ascending.
     *    b. Compute inter-transaction intervals.
     *    c. Check if intervals are consistent (within tolerance).
     *    d. Verify amounts are similar across occurrences.
     * 3. Classify the detected frequency (weekly, monthly, yearly).
     *
     * @param transactions All available transactions.
     * @return List of detected subscriptions sorted by annual cost descending.
     */
    fun detect(transactions: List<Transaction>): List<DetectedSubscription> {
        val expenses = transactions.filter {
            it.type == TransactionType.EXPENSE &&
                it.deletedAt == null &&
                !it.payee.isNullOrBlank()
        }

        // Group by normalised payee
        val grouped = expenses.groupBy { normalisePayee(it.payee!!) }

        return grouped.mapNotNull { (normalisedPayee, txns) ->
            if (txns.size < MIN_OCCURRENCES) return@mapNotNull null
            analyseGroup(normalisedPayee, txns)
        }.sortedByDescending { it.estimatedAnnualCost.amount }
    }

    /**
     * Estimate total annual subscription cost from detected subscriptions.
     */
    fun estimateAnnualCost(subscriptions: List<DetectedSubscription>): Cents {
        return Cents(subscriptions.sumOf { it.estimatedAnnualCost.amount })
    }

    /**
     * Estimate total monthly subscription cost from detected subscriptions.
     */
    fun estimateMonthlyCost(subscriptions: List<DetectedSubscription>): Cents {
        return Cents(subscriptions.sumOf { it.estimatedMonthlyCost.amount })
    }

    /**
     * Find subscriptions whose amount changed significantly between their
     * earliest and latest occurrence (potential price increases).
     */
    fun detectPriceChanges(
        subscriptions: List<DetectedSubscription>,
        thresholdPercent: Double = 5.0,
    ): List<SubscriptionPriceChange> {
        return subscriptions.mapNotNull { sub ->
            if (sub.transactions.size < 2) return@mapNotNull null

            val sorted = sub.transactions.sortedBy { it.date }
            val earliest = sorted.first().amount.abs()
            val latest = sorted.last().amount.abs()

            if (earliest.isZero()) return@mapNotNull null

            val changePercent = ((latest.amount - earliest.amount).toDouble() / earliest.amount) * 100.0

            if (kotlin.math.abs(changePercent) >= thresholdPercent) {
                SubscriptionPriceChange(
                    subscription = sub,
                    oldAmount = earliest,
                    newAmount = latest,
                    changePercent = changePercent,
                )
            } else null
        }
    }

    // ── Internal analysis ────────────────────────────────────────────

    internal fun analyseGroup(
        normalisedPayee: String,
        transactions: List<Transaction>,
    ): DetectedSubscription? {
        val sorted = transactions.sortedBy { it.date }

        // Check amount consistency
        val amounts = sorted.map { it.amount.abs().amount }
        val avgAmount = amounts.sum() / amounts.size
        val allSimilar = amounts.all { amount ->
            val diff = kotlin.math.abs(amount - avgAmount).toDouble()
            avgAmount == 0L || (diff / avgAmount) * 100.0 <= AMOUNT_TOLERANCE_PERCENT
        }

        if (!allSimilar) return null

        // Compute intervals between consecutive transactions
        val intervals = sorted.zipWithNext().map { (a, b) ->
            a.date.daysUntil(b.date)
        }

        if (intervals.isEmpty()) return null

        val avgInterval = intervals.sum().toDouble() / intervals.size

        // Classify frequency
        val frequency = classifyFrequency(avgInterval) ?: return null

        // Check interval consistency
        val intervalsConsistent = intervals.all { interval ->
            kotlin.math.abs(interval - avgInterval) <= INTERVAL_TOLERANCE_DAYS
        }

        if (!intervalsConsistent) return null

        val averageCents = Cents(avgAmount)

        return DetectedSubscription(
            payee = normalisedPayee,
            frequency = frequency,
            averageAmount = averageCents,
            estimatedMonthlyCost = toMonthlyCost(averageCents, frequency),
            estimatedAnnualCost = toAnnualCost(averageCents, frequency),
            occurrenceCount = sorted.size,
            firstSeen = sorted.first().date,
            lastSeen = sorted.last().date,
            confidence = computeConfidence(sorted.size, intervalsConsistent),
            transactions = sorted,
            categoryId = sorted.mapNotNull { it.categoryId }
                .groupBy { it }
                .maxByOrNull { it.value.size }
                ?.key,
        )
    }

    internal fun normalisePayee(payee: String): String {
        return payee.trim().lowercase()
            .replace(Regex("\\s+"), " ") // collapse whitespace
            .replace(Regex("[#*]\\d+$"), "") // strip trailing reference numbers
            .trim()
    }

    internal fun classifyFrequency(avgIntervalDays: Double): SubscriptionFrequency? {
        return when {
            avgIntervalDays in 5.0..9.0 -> SubscriptionFrequency.WEEKLY
            avgIntervalDays in 12.0..17.0 -> SubscriptionFrequency.BIWEEKLY
            avgIntervalDays in 27.0..34.0 -> SubscriptionFrequency.MONTHLY
            avgIntervalDays in 85.0..100.0 -> SubscriptionFrequency.QUARTERLY
            avgIntervalDays in 350.0..380.0 -> SubscriptionFrequency.YEARLY
            else -> null
        }
    }

    internal fun toMonthlyCost(amount: Cents, frequency: SubscriptionFrequency): Cents {
        return when (frequency) {
            SubscriptionFrequency.WEEKLY -> Cents(amount.amount * 52 / 12)
            SubscriptionFrequency.BIWEEKLY -> Cents(amount.amount * 26 / 12)
            SubscriptionFrequency.MONTHLY -> amount
            SubscriptionFrequency.QUARTERLY -> Cents(amount.amount / 3)
            SubscriptionFrequency.YEARLY -> Cents(amount.amount / 12)
        }
    }

    internal fun toAnnualCost(amount: Cents, frequency: SubscriptionFrequency): Cents {
        return when (frequency) {
            SubscriptionFrequency.WEEKLY -> Cents(amount.amount * 52)
            SubscriptionFrequency.BIWEEKLY -> Cents(amount.amount * 26)
            SubscriptionFrequency.MONTHLY -> Cents(amount.amount * 12)
            SubscriptionFrequency.QUARTERLY -> Cents(amount.amount * 4)
            SubscriptionFrequency.YEARLY -> amount
        }
    }

    private fun computeConfidence(
        occurrences: Int,
        intervalsConsistent: Boolean,
    ): SubscriptionConfidence {
        return when {
            occurrences >= 6 && intervalsConsistent -> SubscriptionConfidence.HIGH
            occurrences >= 3 && intervalsConsistent -> SubscriptionConfidence.MEDIUM
            else -> SubscriptionConfidence.LOW
        }
    }
}

// ── Data classes ─────────────────────────────────────────────────────

@Serializable
enum class SubscriptionFrequency {
    WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, YEARLY,
}

@Serializable
enum class SubscriptionConfidence { LOW, MEDIUM, HIGH }

/**
 * A detected recurring subscription pattern.
 */
data class DetectedSubscription(
    val payee: String,
    val frequency: SubscriptionFrequency,
    val averageAmount: Cents,
    val estimatedMonthlyCost: Cents,
    val estimatedAnnualCost: Cents,
    val occurrenceCount: Int,
    val firstSeen: LocalDate,
    val lastSeen: LocalDate,
    val confidence: SubscriptionConfidence,
    val transactions: List<Transaction>,
    val categoryId: SyncId? = null,
)

/**
 * A detected price change in a subscription.
 */
data class SubscriptionPriceChange(
    val subscription: DetectedSubscription,
    val oldAmount: Cents,
    val newAmount: Cents,
    /** Positive = price increase, negative = price decrease. */
    val changePercent: Double,
) {
    val isIncrease: Boolean get() = changePercent > 0
}
