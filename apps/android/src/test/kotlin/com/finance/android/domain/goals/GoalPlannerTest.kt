// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.domain.goals

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [GoalPlanner] — the deterministic teen savings calculator (#2207).
 *
 * All dates are fixed so projections are reproducible on any machine. Required
 * per-period amounts must round **up** so a saver following the plan is never
 * short of the target on the deadline.
 */
class GoalPlannerTest {

    private val today = LocalDate(2026, 1, 1)

    // ── Required per-week / deadline plans ──────────────────────────────

    @Test
    fun `deadline plan computes weekly target rounded up`() {
        // $1,300 over 13 weeks → $100/week exactly.
        val plan = GoalPlanner.plan(
            targetCents = 130_000,
            currentCents = 0,
            today = today,
            targetDate = LocalDate(2026, 4, 2), // 91 days = 13 weeks
        )

        assertEquals(130_000, plan.remainingCents)
        assertEquals(10_000, plan.perWeekCents)
        assertEquals(13, plan.weeksRemaining)
        assertEquals(LocalDate(2026, 4, 2), plan.projectedDate)
        assertEquals(GoalPace.ON_TRACK, plan.pace)
        assertFalse(plan.isComplete)
        assertNull(plan.catchUpPerWeekCents)
    }

    @Test
    fun `weekly target rounds up when not evenly divisible`() {
        // $1,000 over 3 weeks → ceil(100000/3) = 33334 cents.
        val plan = GoalPlanner.plan(
            targetCents = 100_000,
            currentCents = 0,
            today = today,
            targetDate = LocalDate(2026, 1, 22), // 21 days = 3 weeks
        )
        assertEquals(33_334, plan.perWeekCents)
        // Saving the suggested amount for all weeks must cover the target.
        assertTrue(plan.perWeekCents * plan.weeksRemaining!! >= plan.remainingCents)
    }

    @Test
    fun `paycheck and monthly targets are populated and cover remaining`() {
        val plan = GoalPlanner.plan(
            targetCents = 130_000,
            currentCents = 0,
            today = today,
            targetDate = LocalDate(2026, 4, 2),
        )
        assertTrue(plan.perPaycheckCents > 0)
        assertTrue(plan.perMonthCents > 0)
        // Per-paycheck (biweekly) should be roughly double the weekly amount.
        assertTrue(plan.perPaycheckCents >= plan.perWeekCents)
    }

    @Test
    fun `current savings reduce the remaining amount`() {
        val plan = GoalPlanner.plan(
            targetCents = 130_000,
            currentCents = 65_000,
            today = today,
            targetDate = LocalDate(2026, 4, 2),
        )
        assertEquals(65_000, plan.remainingCents)
        assertEquals(5_000, plan.perWeekCents) // half the remaining over 13 weeks
        assertEquals(GoalMilestone.HALF, plan.milestone)
    }

    // ── Completion ──────────────────────────────────────────────────────

    @Test
    fun `reached goal reports complete with zero targets`() {
        val plan = GoalPlanner.plan(
            targetCents = 100_000,
            currentCents = 100_000,
            today = today,
            targetDate = LocalDate(2026, 6, 1),
        )
        assertTrue(plan.isComplete)
        assertEquals(GoalPace.COMPLETE, plan.pace)
        assertEquals(GoalMilestone.COMPLETE, plan.milestone)
        assertEquals(0, plan.perWeekCents)
        assertEquals(0, plan.remainingCents)
    }

    @Test
    fun `over-saved goal is still complete and clamps remaining to zero`() {
        val plan = GoalPlanner.plan(
            targetCents = 100_000,
            currentCents = 150_000,
            today = today,
            targetDate = null,
        )
        assertTrue(plan.isComplete)
        assertEquals(0, plan.remainingCents)
    }

    // ── Overdue ─────────────────────────────────────────────────────────

    @Test
    fun `past deadline is overdue and needs the full remaining as catch-up`() {
        val plan = GoalPlanner.plan(
            targetCents = 100_000,
            currentCents = 20_000,
            today = today,
            targetDate = LocalDate(2025, 12, 1), // before today
        )
        assertEquals(GoalPace.OVERDUE, plan.pace)
        assertEquals(80_000, plan.remainingCents)
        assertEquals(80_000, plan.catchUpPerWeekCents)
        assertFalse(plan.isComplete)
    }

    // ── Pace assessment with an actual save rate ────────────────────────

    @Test
    fun `slow actual rate is classified behind with a catch-up amount`() {
        val plan = GoalPlanner.plan(
            targetCents = 130_000,
            currentCents = 0,
            today = today,
            targetDate = LocalDate(2026, 4, 2), // needs $100/week
            actualPerWeekCents = 5_000, // only $50/week
        )
        assertEquals(GoalPace.BEHIND, plan.pace)
        assertEquals(10_000, plan.catchUpPerWeekCents)
        assertTrue(plan.projectedDate!! > LocalDate(2026, 4, 2))
    }

    @Test
    fun `fast actual rate is classified ahead`() {
        val plan = GoalPlanner.plan(
            targetCents = 130_000,
            currentCents = 0,
            today = today,
            targetDate = LocalDate(2026, 4, 2),
            actualPerWeekCents = 20_000, // $200/week
        )
        assertEquals(GoalPace.AHEAD, plan.pace)
        assertNull(plan.catchUpPerWeekCents)
        assertTrue(plan.projectedDate!! < LocalDate(2026, 4, 2))
    }

    @Test
    fun `matching actual rate is on track`() {
        val plan = GoalPlanner.plan(
            targetCents = 130_000,
            currentCents = 0,
            today = today,
            targetDate = LocalDate(2026, 4, 2),
            actualPerWeekCents = 10_000, // exactly $100/week
        )
        assertEquals(GoalPace.ON_TRACK, plan.pace)
        assertEquals(LocalDate(2026, 4, 2), plan.projectedDate)
    }

    // ── Open-ended goals ────────────────────────────────────────────────

    @Test
    fun `open-ended goal with a save rate projects a buy-by date`() {
        val plan = GoalPlanner.plan(
            targetCents = 100_000,
            currentCents = 0,
            today = today,
            targetDate = null,
            actualPerWeekCents = 25_000, // $250/week → 4 weeks
        )
        assertEquals(GoalPace.ON_TRACK, plan.pace)
        assertEquals(25_000, plan.perWeekCents)
        assertEquals(50_000, plan.perPaycheckCents)
        assertEquals(4, plan.weeksRemaining)
        assertEquals(LocalDate(2026, 1, 29), plan.projectedDate)
    }

    @Test
    fun `open-ended goal without a save rate has no deadline pace`() {
        val plan = GoalPlanner.plan(
            targetCents = 100_000,
            currentCents = 10_000,
            today = today,
            targetDate = null,
        )
        assertEquals(GoalPace.NO_DEADLINE, plan.pace)
        assertNull(plan.weeksRemaining)
        assertNull(plan.projectedDate)
        assertEquals(0, plan.perWeekCents)
    }

    // ── Standalone helpers ──────────────────────────────────────────────

    @Test
    fun `projectedDate returns null for a non-positive rate`() {
        assertNull(GoalPlanner.projectedDate(100_000, 0, today))
        assertNull(GoalPlanner.projectedDate(100_000, -5, today))
    }

    @Test
    fun `projectedDate rounds weeks up`() {
        // $1,000 at $300/week → ceil(100000/30000) = 4 weeks → +28 days.
        assertEquals(
            LocalDate(2026, 1, 29),
            GoalPlanner.projectedDate(100_000, 30_000, today),
        )
    }

    @Test
    fun `requiredPerWeek returns full remaining when deadline is today or past`() {
        assertEquals(50_000, GoalPlanner.requiredPerWeek(50_000, today, today))
        assertEquals(50_000, GoalPlanner.requiredPerWeek(50_000, today, LocalDate(2025, 1, 1)))
    }

    @Test
    fun `milestoneFor classifies each checkpoint band`() {
        assertEquals(GoalMilestone.STARTED, GoalPlanner.milestoneFor(0, 100))
        assertEquals(GoalMilestone.STARTED, GoalPlanner.milestoneFor(24, 100))
        assertEquals(GoalMilestone.QUARTER, GoalPlanner.milestoneFor(25, 100))
        assertEquals(GoalMilestone.HALF, GoalPlanner.milestoneFor(50, 100))
        assertEquals(GoalMilestone.THREE_QUARTER, GoalPlanner.milestoneFor(75, 100))
        assertEquals(GoalMilestone.COMPLETE, GoalPlanner.milestoneFor(100, 100))
        assertEquals(GoalMilestone.COMPLETE, GoalPlanner.milestoneFor(120, 100))
    }

    @Test
    fun `non-positive target is rejected`() {
        assertFailsWith<IllegalArgumentException> {
            GoalPlanner.plan(0, 0, today, null)
        }
        assertFailsWith<IllegalArgumentException> {
            GoalPlanner.plan(-10, 0, today, null)
        }
    }
}
