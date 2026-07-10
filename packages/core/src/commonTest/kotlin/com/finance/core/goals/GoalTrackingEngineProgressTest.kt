// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Tests for the core progress primitives of [GoalTrackingEngine] — the shared
 * foundation (#3673) and its integer permille basis (#3737).
 */
class GoalTrackingEngineProgressTest {

    @Test
    fun remainingAmountAtZero() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents.ZERO)
        assertEquals(Cents(100_000), GoalTrackingEngine.remainingAmount(goal))
    }

    @Test
    fun remainingAmountPartial() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents(30_000))
        assertEquals(Cents(70_000), GoalTrackingEngine.remainingAmount(goal))
    }

    @Test
    fun remainingAmountAtComplete() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents(100_000))
        assertEquals(Cents.ZERO, GoalTrackingEngine.remainingAmount(goal))
    }

    @Test
    fun remainingAmountClampedWhenOverTarget() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents(150_000))
        assertEquals(Cents.ZERO, GoalTrackingEngine.remainingAmount(goal))
    }

    @Test
    fun remainingAmountSingleCent() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1), currentAmount = Cents.ZERO)
        assertEquals(Cents(1), GoalTrackingEngine.remainingAmount(goal))
    }

    @Test
    fun progressPermilleAtZero() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents.ZERO)
        assertEquals(0, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleAt250() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents(250))
        assertEquals(250, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleFloorsAt333() {
        // 1/3 = 0.333... floored to 333 permille via integer math
        val goal = TestFixtures.createGoal(targetAmount = Cents(3), currentAmount = Cents(1))
        assertEquals(333, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleAt500() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents(500))
        assertEquals(500, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleAt999() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents(999))
        assertEquals(999, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleAt1000() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents(1000))
        assertEquals(1000, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleClampedWhenOverTarget() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents(1500))
        assertEquals(1000, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleSingleCentComplete() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1), currentAmount = Cents(1))
        assertEquals(1000, GoalTrackingEngine.progressPermille(goal))
    }

    @Test
    fun progressPermilleNeverNegative() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(1000), currentAmount = Cents(-500))
        assertEquals(0, GoalTrackingEngine.progressPermille(goal))
    }
}
