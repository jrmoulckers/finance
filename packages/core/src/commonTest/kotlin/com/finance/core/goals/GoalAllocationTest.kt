// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Tests for [GoalTrackingEngine.allocateContribution] (#3730). */
class GoalAllocationTest {

    private val asOf = LocalDate(2024, 1, 1)

    private fun goal(id: String, remaining: Long, deadline: LocalDate) = TestFixtures.createGoal(
        id = SyncId(id),
        targetAmount = Cents(remaining),
        currentAmount = Cents.ZERO,
        targetDate = deadline,
    )

    // Priority order below is driven by deadline (nearest first): a, b, c.
    private val goalA = goal("a", 200, LocalDate(2024, 1, 10))
    private val goalB = goal("b", 300, LocalDate(2024, 1, 20))
    private val goalC = goal("c", 500, LocalDate(2024, 1, 30))

    @Test
    fun amountLessThanFirstGoalRemaining() {
        val result = GoalTrackingEngine.allocateContribution(Cents(150), listOf(goalA, goalB, goalC), asOf)
        assertEquals(mapOf(SyncId("a") to Cents(150)), result)
    }

    @Test
    fun amountSpansSeveralGoals() {
        val result = GoalTrackingEngine.allocateContribution(Cents(600), listOf(goalA, goalB, goalC), asOf)
        assertEquals(
            mapOf(SyncId("a") to Cents(200), SyncId("b") to Cents(300), SyncId("c") to Cents(100)),
            result,
        )
        assertEquals(600, result.values.sumOf { it.amount })
    }

    @Test
    fun amountExceedsAllRemainingDropsLeftover() {
        val result = GoalTrackingEngine.allocateContribution(Cents(2000), listOf(goalA, goalB, goalC), asOf)
        assertEquals(
            mapOf(SyncId("a") to Cents(200), SyncId("b") to Cents(300), SyncId("c") to Cents(500)),
            result,
        )
        // Never exceeds total remaining (1000); leftover 1000 dropped.
        assertEquals(1000, result.values.sumOf { it.amount })
    }

    @Test
    fun singleGoal() {
        val result = GoalTrackingEngine.allocateContribution(Cents(120), listOf(goalA), asOf)
        assertEquals(mapOf(SyncId("a") to Cents(120)), result)
    }

    @Test
    fun emptyGoalList() {
        assertEquals(emptyMap(), GoalTrackingEngine.allocateContribution(Cents(500), emptyList(), asOf))
    }

    @Test
    fun zeroAmountYieldsEmpty() {
        assertEquals(emptyMap(), GoalTrackingEngine.allocateContribution(Cents.ZERO, listOf(goalA, goalB), asOf))
    }

    @Test
    fun negativeAmountRejected() {
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.allocateContribution(Cents(-100), listOf(goalA), asOf)
        }
    }

    @Test
    fun completedGoalsExcluded() {
        val completed = TestFixtures.createGoal(
            id = SyncId("done"),
            targetAmount = Cents(500),
            currentAmount = Cents(500),
            status = GoalStatus.COMPLETED,
            targetDate = LocalDate(2024, 1, 5),
        )
        val result = GoalTrackingEngine.allocateContribution(Cents(1000), listOf(completed, goalA), asOf)
        assertEquals(mapOf(SyncId("a") to Cents(200)), result)
    }

    @Test
    fun neverExceedsAmountOrTotalRemaining() {
        val result = GoalTrackingEngine.allocateContribution(Cents(450), listOf(goalA, goalB, goalC), asOf)
        val total = result.values.sumOf { it.amount }
        assertTrue(total <= 450)
        assertTrue(total <= 1000)
        assertEquals(450, total)
    }
}
