// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * Cadence at which a recurring contribution is made toward a goal.
 *
 * Used by [GoalTrackingEngine.feasibility] to project savings over whole
 * periods between a start date and a goal's deadline.
 */
@Serializable
enum class ContributionPeriod {
    DAILY,
    WEEKLY,
    MONTHLY,
}

/**
 * Result of a goal feasibility / on-time check (#3734).
 *
 * All monetary fields are exact integer [Cents]; no floating point is used
 * anywhere in the projection.
 *
 * @property willMeetDeadline `true` when the projected balance by the goal's
 *   deadline reaches (or exceeds) its target. When the goal has no deadline,
 *   this is `true` whenever a positive contribution will eventually complete
 *   the goal (or the goal is already complete).
 * @property projectedAmountByDeadline The balance projected at the goal's
 *   deadline: `currentAmount + contribution * wholePeriodsUntilDeadline`.
 *   When the goal has no deadline there is no horizon, so this equals the
 *   goal's current amount.
 * @property shortfall The amount still missing at the deadline, or
 *   [Cents.ZERO] when the goal is projected to be met on time.
 * @property projectedCompletionDate The date the goal is projected to be fully
 *   funded given the contribution, or `null` when it never completes (zero /
 *   non-positive contribution and a positive remaining amount). Equals `from`
 *   when the goal is already complete.
 */
@Serializable
data class GoalFeasibility(
    val willMeetDeadline: Boolean,
    val projectedAmountByDeadline: Cents,
    val shortfall: Cents,
    val projectedCompletionDate: LocalDate?,
)

/**
 * Aggregate savings summary across a list of goals (#3726).
 *
 * Totals are computed in overflow-safe integer [Cents] and include only
 * non-deleted, non-[com.finance.models.GoalStatus.CANCELLED] goals. Counts are
 * reported per status.
 *
 * @property totalSaved Sum of `currentAmount` across counted goals.
 * @property totalTarget Sum of `targetAmount` across counted goals.
 * @property remaining `totalTarget - totalSaved`, clamped to [Cents.ZERO].
 * @property progressPermille Overall progress in 0..1000 computed from integer
 *   totals; `0` when `totalTarget` is zero, clamped at `1000` when over-funded.
 * @property activeCount Number of non-deleted goals with status ACTIVE.
 * @property completedCount Number of non-deleted goals with status COMPLETED.
 * @property totalCount Number of non-deleted goals considered.
 */
@Serializable
data class GoalSummary(
    val totalSaved: Cents,
    val totalTarget: Cents,
    val remaining: Cents,
    val progressPermille: Int,
    val activeCount: Int,
    val completedCount: Int,
    val totalCount: Int,
)

/**
 * Progress milestones a goal can cross, for one-time celebrations (#3708).
 *
 * Each milestone carries its threshold as an integer permille (parts per
 * thousand) so detection uses exact integer comparison, never floating point.
 */
@Serializable
enum class GoalMilestone(val permille: Int) {
    /** 25% of the target reached. */
    QUARTER(250),

    /** 50% of the target reached. */
    HALF(500),

    /** 75% of the target reached. */
    THREE_QUARTER(750),

    /** 100% of the target reached. */
    COMPLETE(1000),
}

/**
 * Pace of a dated goal relative to its linear time budget (#3694).
 *
 * - [COMPLETED] takes precedence when the goal is already met.
 * - [NO_DEADLINE] when the goal has no `targetDate`.
 * - [AHEAD] / [ON_TRACK] / [BEHIND] compare the fraction saved against the
 *   fraction of time elapsed, with a small tolerance band around parity.
 */
@Serializable
enum class GoalPace {
    ON_TRACK,
    AHEAD,
    BEHIND,
    NO_DEADLINE,
    COMPLETED,
}
