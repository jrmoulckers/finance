// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

/**
 * Ranks quick-actions from on-device [QuickActionSignals] (#2396).
 *
 * The contract is intentionally narrow and side-effect free so the ranking
 * model can be swapped (e.g. for an on-device TFLite model later) without
 * touching the ViewModel or UI. The default implementation,
 * [DeterministicQuickActionRanker], is a transparent, fully unit-tested linear
 * model — no network, no remote inference.
 */
fun interface QuickActionRanker {
    /**
     * Produces a stable, descending-score ordering of surfaceable actions.
     *
     * Implementations MUST be deterministic: identical [signals] always yield
     * identical output (including tie-break ordering).
     */
    fun rank(signals: QuickActionSignals): List<RankedQuickAction>
}

/**
 * A deterministic, transparent linear ranking model.
 *
 * Score = base prior + recency + frequency + time-of-day + contextual signals.
 * Pinned actions are always surfaced first; disabled and dismissed actions are
 * excluded. The model has two well-defined fallbacks:
 *
 * - **Cold-start** ([QuickActionSignals.hasNoUsageHistory]): rank purely by the
 *   per-action [QuickActionType.baseWeight] priors so new users still get a
 *   sensible, universal ordering.
 * - **Stale-model** ([QuickActionSignals.modelAgeMinutes] ≥
 *   [STALE_THRESHOLD_MINUTES]): fall back to the same base-prior ordering rather
 *   than trusting an out-of-date signal snapshot.
 *
 * All weights are constants below so the behaviour is auditable and testable.
 */
class DeterministicQuickActionRanker : QuickActionRanker {

    override fun rank(signals: QuickActionSignals): List<RankedQuickAction> {
        val candidates = QuickActionType.entries.filter { type ->
            type !in signals.disabled && type !in signals.dismissed
        }

        val stale = signals.modelAgeMinutes?.let { it >= STALE_THRESHOLD_MINUTES } ?: false
        val useFallback = signals.hasNoUsageHistory || stale
        val fallbackReason = if (stale) RankReason.STALE_FALLBACK else RankReason.COLD_START

        val ranked = candidates.map { type ->
            val isPinned = type in signals.pinned
            if (useFallback) {
                RankedQuickAction(
                    type = type,
                    score = type.baseWeight + if (isPinned) PINNED_BOOST else 0.0,
                    pinned = isPinned,
                    reason = if (isPinned) RankReason.PINNED else fallbackReason,
                )
            } else {
                score(type, signals, isPinned)
            }
        }

        // Deterministic ordering: pinned first, then score desc, then enum
        // ordinal as a stable tie-breaker.
        return ranked.sortedWith(
            compareByDescending<RankedQuickAction> { it.pinned }
                .thenByDescending { it.score }
                .thenBy { it.type.ordinal },
        )
    }

    private fun score(
        type: QuickActionType,
        signals: QuickActionSignals,
        isPinned: Boolean,
    ): RankedQuickAction {
        var score = type.baseWeight
        var reason = if (isPinned) RankReason.PINNED else RankReason.RECENCY

        val usage = signals.usage[type]
        if (usage != null && usage.activationCount > 0) {
            val frequency = minOf(usage.activationCount, FREQUENCY_CAP).toDouble() / FREQUENCY_CAP
            score += frequency * FREQUENCY_WEIGHT
            val days = usage.recencyDays
            if (days != null) {
                score += RECENCY_WEIGHT / (1.0 + days)
            }
        }

        if (signals.timeBucket in preferredBuckets(type)) {
            score += TIME_WEIGHT
            if (!isPinned) reason = RankReason.TIME_OF_DAY
        }

        if (type == QuickActionType.REVIEW_IMPORTS && signals.pendingImportCount > 0) {
            val ratio = minOf(signals.pendingImportCount, IMPORT_CAP).toDouble() / IMPORT_CAP
            score += ratio * IMPORT_WEIGHT
            if (!isPinned) reason = RankReason.PENDING_IMPORTS
        }

        if (type == QuickActionType.CHECK_BILLS && signals.upcomingBillCount > 0) {
            val ratio = minOf(signals.upcomingBillCount, BILL_CAP).toDouble() / BILL_CAP
            score += ratio * BILL_WEIGHT
            if (!isPinned) reason = RankReason.UPCOMING_BILLS
        }

        if (isPinned) score += PINNED_BOOST

        return RankedQuickAction(type = type, score = score, pinned = isPinned, reason = reason)
    }

    private fun preferredBuckets(type: QuickActionType): Set<TimeBucket> = when (type) {
        QuickActionType.ADD_EXPENSE -> setOf(TimeBucket.MIDDAY, TimeBucket.EVENING)
        QuickActionType.ADD_INCOME -> setOf(TimeBucket.MORNING)
        QuickActionType.REVIEW_IMPORTS -> setOf(TimeBucket.MORNING, TimeBucket.EVENING)
        QuickActionType.CHECK_BILLS -> setOf(TimeBucket.MORNING)
        QuickActionType.VIEW_BUDGETS -> setOf(TimeBucket.EVENING)
        QuickActionType.VIEW_INSIGHTS -> setOf(TimeBucket.EVENING)
        QuickActionType.GIG_TOOLS -> setOf(TimeBucket.EVENING, TimeBucket.NIGHT)
        QuickActionType.COUPLE_SPACE -> setOf(TimeBucket.EVENING)
        QuickActionType.ACHIEVEMENTS -> setOf(TimeBucket.EVENING, TimeBucket.NIGHT)
    }

    companion object {
        /**
         * Snapshots older than this (minutes) trigger the stale-model fallback.
         * Roughly one hour — short enough that time-of-day signals stay
         * trustworthy.
         */
        const val STALE_THRESHOLD_MINUTES: Long = 60

        /** Additive boost guaranteeing pinned actions sort first. */
        const val PINNED_BOOST: Double = 1_000.0

        private const val FREQUENCY_WEIGHT: Double = 0.6
        private const val FREQUENCY_CAP: Int = 10
        private const val RECENCY_WEIGHT: Double = 0.5
        private const val TIME_WEIGHT: Double = 0.4
        private const val IMPORT_WEIGHT: Double = 0.9
        private const val IMPORT_CAP: Int = 5
        private const val BILL_WEIGHT: Double = 0.8
        private const val BILL_CAP: Int = 5
    }
}
