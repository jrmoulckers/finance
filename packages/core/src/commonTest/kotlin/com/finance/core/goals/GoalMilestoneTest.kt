// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals

/** Tests for [GoalTrackingEngine.milestonesReached] and [GoalTrackingEngine.newlyReachedMilestones] (#3708). */
class GoalMilestoneTest {

    private fun goal(current: Long, target: Long = 1000) =
        TestFixtures.createGoal(targetAmount = Cents(target), currentAmount = Cents(current))

    @Test
    fun noMilestonesBelowQuarter() {
        assertEquals(emptySet(), GoalTrackingEngine.milestonesReached(goal(249)))
    }

    @Test
    fun exactQuarterThreshold() {
        assertEquals(setOf(GoalMilestone.QUARTER), GoalTrackingEngine.milestonesReached(goal(250)))
    }

    @Test
    fun exactHalfThreshold() {
        assertEquals(
            setOf(GoalMilestone.QUARTER, GoalMilestone.HALF),
            GoalTrackingEngine.milestonesReached(goal(500)),
        )
    }

    @Test
    fun exactThreeQuarterThreshold() {
        assertEquals(
            setOf(GoalMilestone.QUARTER, GoalMilestone.HALF, GoalMilestone.THREE_QUARTER),
            GoalTrackingEngine.milestonesReached(goal(750)),
        )
    }

    @Test
    fun completeReachesAll() {
        assertEquals(
            setOf(
                GoalMilestone.QUARTER,
                GoalMilestone.HALF,
                GoalMilestone.THREE_QUARTER,
                GoalMilestone.COMPLETE,
            ),
            GoalTrackingEngine.milestonesReached(goal(1000)),
        )
    }

    @Test
    fun overHundredPercentClampsToComplete() {
        assertEquals(
            setOf(
                GoalMilestone.QUARTER,
                GoalMilestone.HALF,
                GoalMilestone.THREE_QUARTER,
                GoalMilestone.COMPLETE,
            ),
            GoalTrackingEngine.milestonesReached(goal(1500)),
        )
    }

    @Test
    fun newlyReachedCrossingMultipleThresholdsInOneJump() {
        val g = goal(current = 1000)
        assertEquals(
            setOf(
                GoalMilestone.QUARTER,
                GoalMilestone.HALF,
                GoalMilestone.THREE_QUARTER,
                GoalMilestone.COMPLETE,
            ),
            GoalTrackingEngine.newlyReachedMilestones(Cents.ZERO, g),
        )
    }

    @Test
    fun newlyReachedOnlyTheJustCrossedThreshold() {
        val g = goal(current = 550)
        // Previously at 40% (already past QUARTER), now at 55% -> only HALF is new.
        assertEquals(
            setOf(GoalMilestone.HALF),
            GoalTrackingEngine.newlyReachedMilestones(Cents(400), g),
        )
    }

    @Test
    fun newlyReachedIsEmptyWhenAmountUnchanged() {
        val g = goal(current = 600)
        assertEquals(emptySet(), GoalTrackingEngine.newlyReachedMilestones(Cents(600), g))
    }

    @Test
    fun newlyReachedIsEmptyWhenAmountDecreased() {
        val g = goal(current = 300)
        assertEquals(emptySet(), GoalTrackingEngine.newlyReachedMilestones(Cents(800), g))
    }
}
