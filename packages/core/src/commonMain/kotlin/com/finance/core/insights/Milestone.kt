package com.finance.core.insights

import com.finance.models.types.Cents
import com.finance.models.types.SyncId

/**
 * A progress milestone for a savings [com.finance.models.Goal].
 *
 * @property goalId The goal this milestone belongs to.
 * @property goalName Human-readable goal name.
 * @property percent The milestone threshold (25, 50, 75, or 100).
 * @property reached Whether the goal's current progress has reached this milestone.
 * @property currentAmount The goal's current saved amount at evaluation time.
 * @property targetAmount The goal's target amount.
 */
data class Milestone(
    val goalId: SyncId,
    val goalName: String,
    val percent: Int,
    val reached: Boolean,
    val currentAmount: Cents,
    val targetAmount: Cents,
) {
    init {
        require(percent in THRESHOLDS) { "Milestone percent must be one of $THRESHOLDS" }
    }

    companion object {
        /** Standard milestone thresholds. */
        val THRESHOLDS = listOf(25, 50, 75, 100)
    }
}
