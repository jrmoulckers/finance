// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.domain.goals

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for [GoalPlanCopy] — teen-friendly phrasing of a goal plan (#2207).
 */
class GoalPlanCopyTest {

    @Test
    fun `headline matches the persona phrasing when a date is known`() {
        assertEquals(
            "Save \$25/week to get your Car by Aug 2027",
            GoalPlanCopy.headline("\$25", "Car", "Aug 2027"),
        )
    }

    @Test
    fun `headline omits the date when none is available`() {
        assertEquals(
            "Save \$25/week toward your Car",
            GoalPlanCopy.headline("\$25", "Car", null),
        )
    }

    @Test
    fun `behind pace message includes the catch-up amount`() {
        val msg = GoalPlanCopy.paceMessage(
            pace = GoalPace.BEHIND,
            goalName = "Car",
            buyByLabel = "Aug 2027",
            catchUpPerWeekFormatted = "\$40",
        )
        assertTrue(msg.contains("\$40"), "Expected catch-up amount in: $msg")
        assertTrue(msg.contains("behind"))
    }

    @Test
    fun `complete pace message celebrates the goal`() {
        val msg = GoalPlanCopy.paceMessage(GoalPace.COMPLETE, "Car", null, null)
        assertTrue(msg.contains("Car"))
        assertTrue(msg.contains("Done"))
    }

    @Test
    fun `no deadline message prompts for a date or amount`() {
        val msg = GoalPlanCopy.paceMessage(GoalPace.NO_DEADLINE, "Car", null, null)
        assertTrue(msg.contains("date") || msg.contains("weekly"))
    }

    @Test
    fun `milestone label and percent stay in sync`() {
        assertEquals(0, GoalPlanCopy.milestonePercent(GoalMilestone.STARTED))
        assertEquals(25, GoalPlanCopy.milestonePercent(GoalMilestone.QUARTER))
        assertEquals(50, GoalPlanCopy.milestonePercent(GoalMilestone.HALF))
        assertEquals(75, GoalPlanCopy.milestonePercent(GoalMilestone.THREE_QUARTER))
        assertEquals(100, GoalPlanCopy.milestonePercent(GoalMilestone.COMPLETE))

        assertTrue(GoalPlanCopy.milestoneLabel(GoalMilestone.HALF).contains("Halfway"))
        assertTrue(GoalPlanCopy.milestoneLabel(GoalMilestone.COMPLETE).contains("reached"))
    }
}
