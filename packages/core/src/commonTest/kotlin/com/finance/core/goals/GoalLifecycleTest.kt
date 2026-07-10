// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Tests for [GoalTrackingEngine] lifecycle transitions and auto-complete recommendation (#3700). */
class GoalLifecycleTest {

    @Test
    fun activeTransitions() {
        assertEquals(
            setOf(GoalStatus.PAUSED, GoalStatus.COMPLETED, GoalStatus.CANCELLED),
            GoalTrackingEngine.transitions(GoalStatus.ACTIVE),
        )
    }

    @Test
    fun pausedTransitions() {
        assertEquals(
            setOf(GoalStatus.ACTIVE, GoalStatus.CANCELLED),
            GoalTrackingEngine.transitions(GoalStatus.PAUSED),
        )
    }

    @Test
    fun completedCanOnlyReopen() {
        assertEquals(setOf(GoalStatus.ACTIVE), GoalTrackingEngine.transitions(GoalStatus.COMPLETED))
    }

    @Test
    fun cancelledIsTerminal() {
        assertEquals(emptySet(), GoalTrackingEngine.transitions(GoalStatus.CANCELLED))
    }

    @Test
    fun legalTransitionsAllowed() {
        assertTrue(GoalTrackingEngine.canTransition(GoalStatus.ACTIVE, GoalStatus.PAUSED))
        assertTrue(GoalTrackingEngine.canTransition(GoalStatus.ACTIVE, GoalStatus.COMPLETED))
        assertTrue(GoalTrackingEngine.canTransition(GoalStatus.ACTIVE, GoalStatus.CANCELLED))
        assertTrue(GoalTrackingEngine.canTransition(GoalStatus.PAUSED, GoalStatus.ACTIVE))
        assertTrue(GoalTrackingEngine.canTransition(GoalStatus.PAUSED, GoalStatus.CANCELLED))
        assertTrue(GoalTrackingEngine.canTransition(GoalStatus.COMPLETED, GoalStatus.ACTIVE))
    }

    @Test
    fun illegalTransitionsRejected() {
        assertFalse(GoalTrackingEngine.canTransition(GoalStatus.CANCELLED, GoalStatus.ACTIVE))
        assertFalse(GoalTrackingEngine.canTransition(GoalStatus.COMPLETED, GoalStatus.CANCELLED))
        assertFalse(GoalTrackingEngine.canTransition(GoalStatus.COMPLETED, GoalStatus.PAUSED))
        assertFalse(GoalTrackingEngine.canTransition(GoalStatus.PAUSED, GoalStatus.COMPLETED))
        assertFalse(GoalTrackingEngine.canTransition(GoalStatus.ACTIVE, GoalStatus.ACTIVE))
    }

    @Test
    fun recommendsCompletedWhenActiveAndFunded() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1000),
            currentAmount = Cents(1000),
            status = GoalStatus.ACTIVE,
        )
        assertEquals(GoalStatus.COMPLETED, GoalTrackingEngine.recommendedStatus(goal))
    }

    @Test
    fun recommendsCompletedWhenPausedAndFunded() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1000),
            currentAmount = Cents(1200),
            status = GoalStatus.PAUSED,
        )
        assertEquals(GoalStatus.COMPLETED, GoalTrackingEngine.recommendedStatus(goal))
    }

    @Test
    fun noRecommendationWhenNotFunded() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1000),
            currentAmount = Cents(999),
            status = GoalStatus.ACTIVE,
        )
        assertNull(GoalTrackingEngine.recommendedStatus(goal))
    }

    @Test
    fun noRecommendationWhenAlreadyCompleted() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1000),
            currentAmount = Cents(1000),
            status = GoalStatus.COMPLETED,
        )
        assertNull(GoalTrackingEngine.recommendedStatus(goal))
    }

    @Test
    fun noRecommendationWhenCancelled() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1000),
            currentAmount = Cents(1000),
            status = GoalStatus.CANCELLED,
        )
        assertNull(GoalTrackingEngine.recommendedStatus(goal))
    }
}
