// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/** Tests for [GoalTrackingEngine.pace] and [GoalTrackingEngine.expectedAmountByNow] (#3694). */
class GoalPaceTest {

    // Goals are created at TestFixtures.fixedInstant (2024-06-15). The window
    // below spans exactly 60 days, so 2024-07-15 is the 30-day (50%) midpoint.
    private val deadline = LocalDate(2024, 8, 14)
    private val midpoint = LocalDate(2024, 7, 15)

    private fun goal(current: Long, target: Long = 1000, date: LocalDate? = deadline) =
        TestFixtures.createGoal(targetAmount = Cents(target), currentAmount = Cents(current), targetDate = date)

    @Test
    fun expectedAmountAtMidpointIsHalf() {
        assertEquals(Cents(500), GoalTrackingEngine.expectedAmountByNow(goal(0), midpoint))
    }

    @Test
    fun expectedAmountBeforeStartIsZero() {
        assertEquals(Cents.ZERO, GoalTrackingEngine.expectedAmountByNow(goal(0), LocalDate(2024, 6, 1)))
    }

    @Test
    fun expectedAmountAfterDeadlineIsFullTarget() {
        assertEquals(Cents(1000), GoalTrackingEngine.expectedAmountByNow(goal(0), LocalDate(2024, 9, 1)))
    }

    @Test
    fun expectedAmountWithoutDeadlineIsZero() {
        assertEquals(Cents.ZERO, GoalTrackingEngine.expectedAmountByNow(goal(0, date = null), midpoint))
    }

    @Test
    fun aheadWhenSavedFarAboveExpectation() {
        assertEquals(GoalPace.AHEAD, GoalTrackingEngine.pace(goal(700), midpoint))
    }

    @Test
    fun behindWhenSavedFarBelowExpectation() {
        assertEquals(GoalPace.BEHIND, GoalTrackingEngine.pace(goal(300), midpoint))
    }

    @Test
    fun onTrackWithinToleranceBand() {
        // Expected 500, tolerance 5% of 1000 = 50 -> band [450, 550].
        assertEquals(GoalPace.ON_TRACK, GoalTrackingEngine.pace(goal(520), midpoint))
    }

    @Test
    fun onTrackAtExactExpectation() {
        assertEquals(GoalPace.ON_TRACK, GoalTrackingEngine.pace(goal(500), midpoint))
    }

    @Test
    fun noDeadlineIsNoDeadline() {
        assertEquals(GoalPace.NO_DEADLINE, GoalTrackingEngine.pace(goal(300, date = null), midpoint))
    }

    @Test
    fun completeTakesPrecedenceOverPace() {
        assertEquals(GoalPace.COMPLETED, GoalTrackingEngine.pace(goal(1000), midpoint))
    }

    @Test
    fun completeTakesPrecedenceEvenWhenNoDeadline() {
        assertEquals(GoalPace.COMPLETED, GoalTrackingEngine.pace(goal(1000, date = null), midpoint))
    }

    @Test
    fun pastDueUnfinishedGoalIsBehind() {
        assertEquals(GoalPace.BEHIND, GoalTrackingEngine.pace(goal(300), LocalDate(2024, 9, 1)))
    }
}
