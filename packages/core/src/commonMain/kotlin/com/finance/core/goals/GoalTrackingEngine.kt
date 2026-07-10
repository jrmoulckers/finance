// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.datetime.monthsUntil
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime

/**
 * Shared, platform-agnostic engine for all goal / savings math (#3673).
 *
 * `GoalTrackingEngine` is the single deterministic source of truth used by
 * every platform app (iOS, Android, Web, Windows) so goal progress,
 * projections, pacing, and allocation never drift between platforms.
 *
 * ## Design rules
 * - **Pure `commonMain`.** No platform APIs; only [Cents] and `kotlinx-datetime`.
 * - **Integer money only.** All arithmetic stays in [Cents] (Long-backed). The
 *   model's [Goal.progress] (a `Double`) is **display-only**; any branching
 *   logic here uses the integer [progressPermille] basis instead (#3737).
 * - **Deterministic.** Same inputs always produce the same outputs, with no
 *   dependence on floating-point comparison or JS number semantics.
 */
@Suppress("TooManyFunctions")
object GoalTrackingEngine {

    private const val PERMILLE_BASIS = 1000L
    private const val MAX_PERMILLE = 1000
    private const val DAYS_PER_WEEK = 7
    private const val DOLLAR_CENTS = 100L
    private const val MAX_YEAR = 9999
    private const val MONTH_DEC = 12
    private const val DAY_31 = 31

    /** Tolerance band (in permille of the target) around the linear pace that still counts as ON_TRACK. */
    private const val PACE_TOLERANCE_PERMILLE = 50L

    // ── #3673 / #3737: core progress primitives ──────────────────────

    /**
     * The amount still needed to reach the goal's target, clamped to
     * [Cents.ZERO] once the goal is met or over-funded.
     */
    fun remainingAmount(goal: Goal): Cents {
        val remaining = goal.targetAmount.amount - goal.currentAmount.amount
        return if (remaining <= 0L) Cents.ZERO else Cents(remaining)
    }

    /**
     * Progress toward the target expressed as an integer permille in `0..1000`
     * using pure integer math (`currentAmount * 1000 / targetAmount`), floored
     * and clamped.
     *
     * This is the integer basis every downstream behaviour (milestones, pace,
     * summaries) branches on, so results are identical on all platforms.
     * Prefer this over the display-only [Goal.progress] `Double` accessor.
     */
    fun progressPermille(goal: Goal): Int =
        permilleForAmount(goal.currentAmount.amount, goal.targetAmount.amount)

    // ── #3734: feasibility / on-time check ───────────────────────────

    /**
     * Determine whether saving [contributionPerPeriod] every [period] starting
     * from [from] reaches the goal by its `targetDate`, and if not, by how much
     * it falls short. See [GoalFeasibility] for field semantics.
     *
     * The projection counts only **whole** periods between [from] and the
     * deadline and stays entirely in integer [Cents]. When the goal has no
     * deadline, [GoalFeasibility.willMeetDeadline] is `true` whenever a positive
     * contribution will eventually complete it.
     */
    fun feasibility(
        goal: Goal,
        contributionPerPeriod: Cents,
        period: ContributionPeriod,
        from: LocalDate,
    ): GoalFeasibility {
        val target = goal.targetAmount
        val completionDate = projectedCompletionDate(goal, contributionPerPeriod, period, from)
        val deadline = goal.targetDate

        if (deadline == null) {
            val willMeet = remainingAmount(goal).isZero() || contributionPerPeriod.isPositive()
            return GoalFeasibility(
                willMeetDeadline = willMeet,
                projectedAmountByDeadline = goal.currentAmount,
                shortfall = if (willMeet) Cents.ZERO else remainingAmount(goal),
                projectedCompletionDate = completionDate,
            )
        }

        val periods = wholePeriodsBetween(from, deadline, period)
        val projected = if (contributionPerPeriod.isZero() || periods == 0) {
            goal.currentAmount
        } else {
            goal.currentAmount + (contributionPerPeriod * periods)
        }
        val gap = target.amount - projected.amount
        return GoalFeasibility(
            willMeetDeadline = projected.amount >= target.amount,
            projectedAmountByDeadline = projected,
            shortfall = if (gap > 0L) Cents(gap) else Cents.ZERO,
            projectedCompletionDate = completionDate,
        )
    }

    // ── #3721: priority ordering ─────────────────────────────────────

    /**
     * Order ACTIVE goals by the recommended funding priority (#3721):
     * 1. dated goals before undated ones, nearest `targetDate` first;
     * 2. then highest completion (closest to done) by [progressPermille];
     * 3. then largest remaining amount;
     * 4. stable tiebreak by goal id.
     *
     * Non-ACTIVE and soft-deleted goals are excluded. All comparison keys are
     * integer cents / dates — no floating-point ordering. [asOf] is accepted
     * for API symmetry with date-aware callers and future pace-weighted rules.
     */
    @Suppress("UnusedParameter")
    fun prioritize(goals: List<Goal>, asOf: LocalDate): List<Goal> =
        goals
            .filter { it.status == GoalStatus.ACTIVE && it.deletedAt == null }
            .sortedWith(
                compareBy<Goal> { it.targetDate == null }
                    .thenBy { it.targetDate ?: LocalDate(MAX_YEAR, MONTH_DEC, DAY_31) }
                    .thenByDescending { progressPermille(it) }
                    .thenByDescending { remainingAmount(it).amount }
                    .thenBy { it.id.value },
            )

    // ── #3730: lump-sum allocation across goals ──────────────────────

    /**
     * Split [amount] across [goals] in funding-priority order (see
     * [prioritize]), capping each goal's share at its remaining amount so no
     * goal is over-funded (#3730).
     *
     * Allocation is exact integer cents with no penny loss: the returned values
     * never sum to more than [amount] and never exceed total remaining. Any
     * leftover after every goal is full is **dropped** (documented).
     *
     * @return map of goal id to allocated [Cents]; only goals that receive a
     *   positive allocation appear. An [amount] of zero yields an empty map.
     * @throws IllegalArgumentException if [amount] is negative.
     */
    fun allocateContribution(amount: Cents, goals: List<Goal>, asOf: LocalDate): Map<SyncId, Cents> {
        require(amount.amount >= 0L) { "Contribution amount cannot be negative" }
        if (amount.isZero()) return emptyMap()

        val result = LinkedHashMap<SyncId, Cents>()
        var budget = amount.amount
        for (goal in prioritize(goals, asOf)) {
            if (budget <= 0L) break
            val need = remainingAmount(goal).amount
            if (need > 0L) {
                val give = minOf(budget, need)
                result[goal.id] = Cents(give)
                budget -= give
            }
        }
        return result
    }

    // ── #3726: aggregate savings summary ─────────────────────────────

    /**
     * Reduce [goals] to a single [GoalSummary]. Totals include only non-deleted,
     * non-CANCELLED goals and use overflow-safe [Cents] addition; counts are
     * reported per status. An empty list yields an all-zero summary.
     */
    fun summarize(goals: List<Goal>): GoalSummary {
        val considered = goals.filter { it.deletedAt == null }
        var saved = Cents.ZERO
        var target = Cents.ZERO
        for (goal in considered) {
            if (goal.status == GoalStatus.CANCELLED) continue
            saved += goal.currentAmount
            target += goal.targetAmount
        }
        val remaining = if (target.amount > saved.amount) Cents(target.amount - saved.amount) else Cents.ZERO
        return GoalSummary(
            totalSaved = saved,
            totalTarget = target,
            remaining = remaining,
            progressPermille = permilleForAmount(saved.amount, target.amount),
            activeCount = considered.count { it.status == GoalStatus.ACTIVE },
            completedCount = considered.count { it.status == GoalStatus.COMPLETED },
            totalCount = considered.size,
        )
    }

    // ── #3716: round-up (spare-change) primitive ─────────────────────

    /**
     * The spare change from rounding [amount] up to the next multiple of
     * [nearest] (defaults to the nearest dollar). Returns [Cents.ZERO] when
     * [amount] is already an exact multiple.
     *
     * The result is always in `0 until nearest`. Negative amounts round toward
     * positive infinity (the next multiple `>= amount`), so an expense of
     * `-150` cents at `nearest = 100` yields `50` — callers storing expenses as
     * positive cents get the intuitive result.
     *
     * @throws IllegalArgumentException if [nearest] is not positive.
     */
    fun roundUpContribution(amount: Cents, nearest: Cents = Cents(DOLLAR_CENTS)): Cents {
        require(nearest.isPositive()) { "nearest must be positive" }
        val n = nearest.amount
        val remainder = ((amount.amount % n) + n) % n
        return if (remainder == 0L) Cents.ZERO else Cents(n - remainder)
    }

    /**
     * Sum of [roundUpContribution] over [amounts] using overflow-safe [Cents]
     * addition. An empty list yields [Cents.ZERO].
     *
     * @throws IllegalArgumentException if [nearest] is not positive.
     */
    fun roundUpTotal(amounts: List<Cents>, nearest: Cents = Cents(DOLLAR_CENTS)): Cents {
        require(nearest.isPositive()) { "nearest must be positive" }
        var total = Cents.ZERO
        for (amount in amounts) {
            total += roundUpContribution(amount, nearest)
        }
        return total
    }

    // ── #3708: milestone detection ───────────────────────────────────

    /**
     * All [GoalMilestone] thresholds the goal has reached at its current amount,
     * using exact integer comparison (`current * 1000 >= target * permille`).
     */
    fun milestonesReached(goal: Goal): Set<GoalMilestone> =
        reachedMilestones(goal.currentAmount.amount, goal.targetAmount.amount)

    /**
     * The milestones newly crossed between [previousAmount] and the goal's
     * current amount — the set difference — for firing one-time celebrations.
     * Returns an empty set when the amount is unchanged or moved backward.
     */
    fun newlyReachedMilestones(previousAmount: Cents, goal: Goal): Set<GoalMilestone> {
        val target = goal.targetAmount.amount
        val now = reachedMilestones(goal.currentAmount.amount, target)
        val before = reachedMilestones(previousAmount.amount, target)
        return now - before
    }

    // ── #3700: lifecycle transitions + auto-complete ─────────────────

    /**
     * The set of statuses [from] may legally transition to. Legal matrix:
     * - `ACTIVE` → `PAUSED`, `COMPLETED`, `CANCELLED`
     * - `PAUSED` → `ACTIVE`, `CANCELLED`
     * - `COMPLETED` → `ACTIVE` (reopen)
     * - `CANCELLED` → *(terminal — no transitions)*
     */
    fun transitions(from: GoalStatus): Set<GoalStatus> = when (from) {
        GoalStatus.ACTIVE -> setOf(GoalStatus.PAUSED, GoalStatus.COMPLETED, GoalStatus.CANCELLED)
        GoalStatus.PAUSED -> setOf(GoalStatus.ACTIVE, GoalStatus.CANCELLED)
        GoalStatus.COMPLETED -> setOf(GoalStatus.ACTIVE)
        GoalStatus.CANCELLED -> emptySet()
    }

    /** Whether the [from] → [to] status transition is permitted by [transitions]. */
    fun canTransition(from: GoalStatus, to: GoalStatus): Boolean = to in transitions(from)

    /**
     * Suggests `COMPLETED` when the goal is fully funded and still ACTIVE or
     * PAUSED, otherwise `null`. Never mutates the goal — callers decide whether
     * to apply the recommendation.
     */
    fun recommendedStatus(goal: Goal): GoalStatus? =
        if (goal.isComplete && (goal.status == GoalStatus.ACTIVE || goal.status == GoalStatus.PAUSED)) {
            GoalStatus.COMPLETED
        } else {
            null
        }

    // ── #3694: on-track / ahead / behind pace ────────────────────────

    /**
     * Classify a goal's [GoalPace] as of [asOf] by comparing the fraction saved
     * against the fraction of time elapsed between the goal's creation date and
     * its `targetDate`. [GoalPace.COMPLETED] takes precedence; goals without a
     * deadline are [GoalPace.NO_DEADLINE]. A small tolerance band around the
     * linear expectation classifies near-parity as [GoalPace.ON_TRACK].
     */
    fun pace(goal: Goal, asOf: LocalDate): GoalPace = when {
        goal.isComplete -> GoalPace.COMPLETED
        goal.targetDate == null -> GoalPace.NO_DEADLINE
        else -> {
            val current = goal.currentAmount.amount
            val expected = expectedAmountByNow(goal, asOf).amount
            val tolerance = goal.targetAmount.amount * PACE_TOLERANCE_PERMILLE / PERMILLE_BASIS
            when {
                current in (expected - tolerance)..(expected + tolerance) -> GoalPace.ON_TRACK
                current > expected -> GoalPace.AHEAD
                else -> GoalPace.BEHIND
            }
        }
    }

    /**
     * The amount a dated goal is linearly expected to have saved by [asOf]:
     * `target * elapsedDays / totalDays`, with `elapsedDays` clamped to
     * `0..totalDays`. Returns [Cents.ZERO] when the goal has no deadline, and
     * the full target when the deadline is on or before the creation date.
     */
    fun expectedAmountByNow(goal: Goal, asOf: LocalDate): Cents {
        val deadline = goal.targetDate ?: return Cents.ZERO
        val start = goal.createdAt.toLocalDateTime(TimeZone.UTC).date
        val totalDays = start.daysUntil(deadline)
        return when {
            totalDays <= 0 -> goal.targetAmount
            else -> {
                val elapsed = start.daysUntil(asOf).coerceIn(0, totalDays)
                Cents(goal.targetAmount.amount * elapsed / totalDays)
            }
        }
    }

    // ── private helpers ──────────────────────────────────────────────

    private fun permilleForAmount(current: Long, target: Long): Int {
        if (target <= 0L) return 0
        val clamped = current.coerceAtLeast(0L)
        return if (clamped >= target) MAX_PERMILLE else ((clamped * PERMILLE_BASIS) / target).toInt()
    }

    private fun reachedMilestones(amount: Long, target: Long): Set<GoalMilestone> {
        if (target <= 0L) return emptySet()
        val clamped = amount.coerceAtLeast(0L)
        return GoalMilestone.entries
            .filter { clamped * PERMILLE_BASIS >= target * it.permille.toLong() }
            .toSet()
    }

    private fun projectedCompletionDate(
        goal: Goal,
        contribution: Cents,
        period: ContributionPeriod,
        from: LocalDate,
    ): LocalDate? {
        val remaining = remainingAmount(goal).amount
        return when {
            remaining <= 0L -> from
            !contribution.isPositive() -> null
            else -> {
                val periodsNeeded = ((remaining + contribution.amount - 1L) / contribution.amount)
                    .coerceAtMost(Int.MAX_VALUE.toLong())
                    .toInt()
                addPeriods(from, periodsNeeded, period)
            }
        }
    }

    private fun wholePeriodsBetween(from: LocalDate, to: LocalDate, period: ContributionPeriod): Int {
        if (to <= from) return 0
        return when (period) {
            ContributionPeriod.DAILY -> from.daysUntil(to)
            ContributionPeriod.WEEKLY -> from.daysUntil(to) / DAYS_PER_WEEK
            ContributionPeriod.MONTHLY -> from.monthsUntil(to)
        }
    }

    private fun addPeriods(from: LocalDate, count: Int, period: ContributionPeriod): LocalDate = when (period) {
        ContributionPeriod.DAILY -> from.plus(count, DateTimeUnit.DAY)
        ContributionPeriod.WEEKLY -> from.plus(count * DAYS_PER_WEEK, DateTimeUnit.DAY)
        ContributionPeriod.MONTHLY -> from.plus(count, DateTimeUnit.MONTH)
    }
}
