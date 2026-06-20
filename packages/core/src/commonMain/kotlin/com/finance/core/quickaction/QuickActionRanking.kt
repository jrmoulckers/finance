// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.quickaction

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Platform-neutral quick actions that can be rendered as Android shortcuts,
 * widgets, web affordances, or future surfaces.
 *
 * The enum order is part of the deterministic ranking tie-break contract.
 */
@Serializable
enum class QuickActionType {
    ADD_TRANSACTION,
    REVIEW_TRANSACTIONS,
    OPEN_BUDGETS,
    OPEN_GOALS,
    VIEW_INSIGHTS,
    IMPORT_TRANSACTIONS,
    TOGGLE_PRIVACY_MODE,
}

/**
 * A candidate action that a platform may surface to the user.
 *
 * [id] must be a stable product-defined identifier, never a user/account/entity
 * identifier. [titleKey] and [descriptionKey] are localization keys so the
 * shared contract stays platform-neutral and privacy-safe.
 */
@Serializable
data class QuickActionCandidate(
    val id: String,
    val type: QuickActionType,
    val titleKey: String,
    val descriptionKey: String,
    val destination: String,
    val defaultOrder: Int,
    val baseScore: Int = DEFAULT_BASE_SCORE,
    val signals: QuickActionSignals = QuickActionSignals(),
) {
    init {
        require(id.isNotBlank()) { "Quick action id cannot be blank" }
        require(titleKey.isNotBlank()) { "titleKey cannot be blank" }
        require(descriptionKey.isNotBlank()) { "descriptionKey cannot be blank" }
        require(destination.isNotBlank()) { "destination cannot be blank" }
        require(defaultOrder >= 0) { "defaultOrder must be non-negative" }
        require(baseScore in SCORE_RANGE) { "baseScore must be between 0 and 100" }
    }

    companion object {
        const val DEFAULT_BASE_SCORE: Int = 50
        private val SCORE_RANGE = 0..100
    }
}

/** Aggregate local signals. Counts only; no payees, amounts, account ids, or entity ids. */
@Serializable
data class QuickActionSignals(
    val impressionCount: Int = 0,
    val selectionCount: Int = 0,
    val completionCount: Int = 0,
    val dismissalCount: Int = 0,
    val isFresh: Boolean = false,
) {
    init {
        require(impressionCount >= 0) { "impressionCount must be non-negative" }
        require(selectionCount >= 0) { "selectionCount must be non-negative" }
        require(completionCount >= 0) { "completionCount must be non-negative" }
        require(dismissalCount >= 0) { "dismissalCount must be non-negative" }
    }

    val hasUsefulnessCounts: Boolean
        get() = impressionCount > 0 || selectionCount > 0 || completionCount > 0 || dismissalCount > 0

    val contributesToPrediction: Boolean
        get() = isFresh && hasUsefulnessCounts
}

/**
 * User overrides. Precedence is deterministic: pinned beats disabled/dismissed,
 * disabled removes unpinned actions, dismissed demotes remaining actions.
 */
@Serializable
data class QuickActionOverrides(
    val pinnedActionIds: List<String> = emptyList(),
    val dismissedActionIds: Set<String> = emptySet(),
    val disabledActionIds: Set<String> = emptySet(),
) {
    init {
        require(pinnedActionIds.none { it.isBlank() }) { "Pinned action ids cannot be blank" }
        require(pinnedActionIds.distinct().size == pinnedActionIds.size) { "Pinned action ids must be unique" }
        require(dismissedActionIds.none { it.isBlank() }) { "Dismissed action ids cannot be blank" }
        require(disabledActionIds.none { it.isBlank() }) { "Disabled action ids cannot be blank" }
    }

    fun stateFor(actionId: String): QuickActionOverrideState = when {
        actionId in pinnedActionIds -> QuickActionOverrideState.PINNED
        actionId in disabledActionIds -> QuickActionOverrideState.DISABLED
        actionId in dismissedActionIds -> QuickActionOverrideState.DISMISSED
        else -> QuickActionOverrideState.NORMAL
    }

    internal fun pinnedIndex(actionId: String): Int {
        val index = pinnedActionIds.indexOf(actionId)
        return if (index >= 0) index else Int.MAX_VALUE
    }
}

@Serializable
enum class QuickActionOverrideState {
    PINNED,
    NORMAL,
    DISMISSED,
    DISABLED,
}

/** Ranked result returned to platform adapters. */
@Serializable
data class RankedQuickAction(
    val candidate: QuickActionCandidate,
    val score: Int,
    val overrideState: QuickActionOverrideState,
    val fallbackApplied: Boolean,
)

/** Deterministic local scoring for fresh aggregate quick-action signals. */
object QuickActionLocalScorer {
    private const val IMPRESSION_WEIGHT = 2
    private const val SELECTION_WEIGHT = 8
    private const val COMPLETION_WEIGHT = 12
    private const val DISMISSAL_PENALTY = 15

    private const val IMPRESSION_CAP = 20
    private const val SELECTION_CAP = 40
    private const val COMPLETION_CAP = 48
    private const val DISMISSAL_CAP = 45

    fun score(candidate: QuickActionCandidate): Int = score(candidate.baseScore, candidate.signals)

    fun score(baseScore: Int, signals: QuickActionSignals): Int {
        require(baseScore in 0..100) { "baseScore must be between 0 and 100" }
        if (!signals.contributesToPrediction) return baseScore

        val positiveScore =
            (signals.impressionCount * IMPRESSION_WEIGHT).coerceAtMost(IMPRESSION_CAP) +
                (signals.selectionCount * SELECTION_WEIGHT).coerceAtMost(SELECTION_CAP) +
                (signals.completionCount * COMPLETION_WEIGHT).coerceAtMost(COMPLETION_CAP)
        val penalty = (signals.dismissalCount * DISMISSAL_PENALTY).coerceAtMost(DISMISSAL_CAP)

        return (baseScore + positiveScore - penalty).coerceAtLeast(0)
    }
}

/**
 * Deterministic ranker. Tie-breaks are, in order:
 * override bucket (pinned, normal, dismissed), pinned list order, score
 * descending when fresh signals exist, default order, enum order, and id.
 *
 * If no candidate has fresh aggregate signals, ranking falls back to the
 * default ordered set and sets [RankedQuickAction.fallbackApplied].
 */
object QuickActionRanker {
    fun rank(
        candidates: List<QuickActionCandidate> = DefaultQuickActions.candidates,
        overrides: QuickActionOverrides = QuickActionOverrides(),
        limit: Int = Int.MAX_VALUE,
    ): List<RankedQuickAction> {
        require(limit >= 0) { "limit must be non-negative" }

        val source = candidates.ifEmpty { DefaultQuickActions.candidates }
        val hasFreshSignals = source.any { it.signals.contributesToPrediction }
        val fallbackApplied = !hasFreshSignals

        return source
            .mapNotNull { candidate ->
                val overrideState = overrides.stateFor(candidate.id)
                if (overrideState == QuickActionOverrideState.DISABLED) {
                    null
                } else {
                    RankedQuickAction(
                        candidate = candidate,
                        score = if (fallbackApplied) candidate.baseScore else QuickActionLocalScorer.score(candidate),
                        overrideState = overrideState,
                        fallbackApplied = fallbackApplied,
                    )
                }
            }
            .sortedWith { left, right -> compareRanked(left, right, overrides, fallbackApplied) }
            .take(limit)
    }

    private fun compareRanked(
        left: RankedQuickAction,
        right: RankedQuickAction,
        overrides: QuickActionOverrides,
        fallbackApplied: Boolean,
    ): Int {
        compareValues(overrideBucket(left.overrideState), overrideBucket(right.overrideState))
            .takeIf { it != 0 }
            ?.let { return it }

        if (left.overrideState == QuickActionOverrideState.PINNED && right.overrideState == QuickActionOverrideState.PINNED) {
            compareValues(overrides.pinnedIndex(left.candidate.id), overrides.pinnedIndex(right.candidate.id))
                .takeIf { it != 0 }
                ?.let { return it }
        }

        if (!fallbackApplied) {
            compareValues(right.score, left.score)
                .takeIf { it != 0 }
                ?.let { return it }
        }

        compareValues(left.candidate.defaultOrder, right.candidate.defaultOrder)
            .takeIf { it != 0 }
            ?.let { return it }
        compareValues(left.candidate.type.ordinal, right.candidate.type.ordinal)
            .takeIf { it != 0 }
            ?.let { return it }
        return left.candidate.id.compareTo(right.candidate.id)
    }

    private fun overrideBucket(state: QuickActionOverrideState): Int = when (state) {
        QuickActionOverrideState.PINNED -> 0
        QuickActionOverrideState.NORMAL -> 1
        QuickActionOverrideState.DISMISSED -> 2
        QuickActionOverrideState.DISABLED -> 3
    }
}

/** Sensible stale/no-signal fallback candidates for first-run platforms. */
object DefaultQuickActions {
    val candidates: List<QuickActionCandidate> = listOf(
        QuickActionCandidate(
            id = "add-transaction",
            type = QuickActionType.ADD_TRANSACTION,
            titleKey = "quick_action.add_transaction.title",
            descriptionKey = "quick_action.add_transaction.description",
            destination = "transactions/new",
            defaultOrder = 0,
            baseScore = 75,
        ),
        QuickActionCandidate(
            id = "review-transactions",
            type = QuickActionType.REVIEW_TRANSACTIONS,
            titleKey = "quick_action.review_transactions.title",
            descriptionKey = "quick_action.review_transactions.description",
            destination = "transactions/review",
            defaultOrder = 1,
            baseScore = 68,
        ),
        QuickActionCandidate(
            id = "open-budgets",
            type = QuickActionType.OPEN_BUDGETS,
            titleKey = "quick_action.open_budgets.title",
            descriptionKey = "quick_action.open_budgets.description",
            destination = "budgets",
            defaultOrder = 2,
            baseScore = 62,
        ),
        QuickActionCandidate(
            id = "view-insights",
            type = QuickActionType.VIEW_INSIGHTS,
            titleKey = "quick_action.view_insights.title",
            descriptionKey = "quick_action.view_insights.description",
            destination = "insights",
            defaultOrder = 3,
            baseScore = 58,
        ),
        QuickActionCandidate(
            id = "open-goals",
            type = QuickActionType.OPEN_GOALS,
            titleKey = "quick_action.open_goals.title",
            descriptionKey = "quick_action.open_goals.description",
            destination = "goals",
            defaultOrder = 4,
            baseScore = 55,
        ),
        QuickActionCandidate(
            id = "toggle-privacy-mode",
            type = QuickActionType.TOGGLE_PRIVACY_MODE,
            titleKey = "quick_action.toggle_privacy_mode.title",
            descriptionKey = "quick_action.toggle_privacy_mode.description",
            destination = "privacy-mode",
            defaultOrder = 5,
            baseScore = 50,
        ),
    )
}

/**
 * Privacy-safe aggregate usefulness event. Properties intentionally contain
 * counts only: no action ids, account ids, transaction ids, payees, or amounts.
 */
@Serializable
data class QuickActionUsefulnessEvent(
    val timestamp: Instant,
    val shownCount: Int,
    val selectedCount: Int,
    val completedCount: Int,
    val dismissedCount: Int,
    val pinnedCount: Int = 0,
    val disabledCount: Int = 0,
    val staleFallbackCount: Int = 0,
) {
    init {
        require(shownCount >= 0) { "shownCount must be non-negative" }
        require(selectedCount >= 0) { "selectedCount must be non-negative" }
        require(completedCount >= 0) { "completedCount must be non-negative" }
        require(dismissedCount >= 0) { "dismissedCount must be non-negative" }
        require(pinnedCount >= 0) { "pinnedCount must be non-negative" }
        require(disabledCount >= 0) { "disabledCount must be non-negative" }
        require(staleFallbackCount >= 0) { "staleFallbackCount must be non-negative" }
        require(selectedCount <= shownCount) { "selectedCount cannot exceed shownCount" }
        require(completedCount <= selectedCount) { "completedCount cannot exceed selectedCount" }
        require(dismissedCount <= shownCount) { "dismissedCount cannot exceed shownCount" }
    }

    val name: String = "quick_action_usefulness"

    val properties: Map<String, String>
        get() = mapOf(
            "shown_count" to shownCount.toString(),
            "selected_count" to selectedCount.toString(),
            "completed_count" to completedCount.toString(),
            "dismissed_count" to dismissedCount.toString(),
            "pinned_count" to pinnedCount.toString(),
            "disabled_count" to disabledCount.toString(),
            "stale_fallback_count" to staleFallbackCount.toString(),
        )

    fun hasOnlyAggregateCountProperties(): Boolean {
        return properties.keys == PRIVACY_SAFE_COUNT_KEYS && properties.values.all { it.isNonNegativeInteger() }
    }

    companion object {
        val PRIVACY_SAFE_COUNT_KEYS: Set<String> = setOf(
            "shown_count",
            "selected_count",
            "completed_count",
            "dismissed_count",
            "pinned_count",
            "disabled_count",
            "stale_fallback_count",
        )
    }
}

private fun String.isNonNegativeInteger(): Boolean = isNotEmpty() && all { it in '0'..'9' }
