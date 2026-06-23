// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.domain.goals

import com.finance.models.Goal
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [GoalPlanPresenter] — formatting a [Goal] into render-ready
 * teen planner copy and numbers (#2207).
 */
class GoalPlanPresenterTest {

    private val today = LocalDate(2026, 1, 1)
    private val epoch = Instant.fromEpochSeconds(0)
    private val household = SyncId("household")

    private fun goal(
        target: Long,
        current: Long = 0,
        targetDate: LocalDate? = null,
        name: String = "Car",
        icon: String? = "🚗",
    ) = Goal(
        id = SyncId("goal-1"),
        householdId = household,
        ownerId = household,
        name = name,
        targetAmount = Cents(target),
        currentAmount = Cents(current),
        currency = Currency.USD,
        targetDate = targetDate,
        icon = icon,
        createdAt = epoch,
        updatedAt = epoch,
    )

    @Test
    fun `present formats money and builds the teen headline`() {
        val ui = GoalPlanPresenter.present(
            goal = goal(target = 500_000, current = 250_000, targetDate = LocalDate(2027, 8, 1)),
            today = today,
            currency = Currency.USD,
        )

        assertEquals("Car", ui.goalName)
        assertEquals("🚗", ui.icon)
        assertEquals("\$5,000.00", ui.targetFormatted)
        assertEquals("\$2,500.00", ui.currentFormatted)
        assertEquals("\$2,500.00", ui.remainingFormatted)
        assertEquals("Aug 2027", ui.buyByLabel)
        assertEquals(50, ui.progressPercentInt)
        assertTrue(ui.headline.startsWith("Save "))
        assertTrue(ui.headline.contains("Car"))
        assertTrue(ui.headline.contains("Aug 2027"))
        assertTrue(ui.hasPlan)
        assertFalse(ui.isBehind)
    }

    @Test
    fun `present marks a reached goal complete with no plan`() {
        val ui = GoalPlanPresenter.present(
            goal = goal(target = 100_000, current = 100_000),
            today = today,
            currency = Currency.USD,
        )
        assertTrue(ui.isComplete)
        assertFalse(ui.hasPlan)
        assertEquals(100, ui.milestonePercent)
        assertEquals(GoalPace.COMPLETE, ui.pace)
    }

    @Test
    fun `open-ended goal without a rate has no buy-by label`() {
        val ui = GoalPlanPresenter.present(
            goal = goal(target = 100_000, current = 10_000, targetDate = null),
            today = today,
            currency = Currency.USD,
        )
        assertNull(ui.buyByLabel)
        assertEquals(GoalPace.NO_DEADLINE, ui.pace)
        assertFalse(ui.hasPlan)
    }

    @Test
    fun `monthYearLabel abbreviates month and keeps year`() {
        assertEquals("Aug 2027", GoalPlanPresenter.monthYearLabel(LocalDate(2027, 8, 15)))
        assertEquals("Jan 2026", GoalPlanPresenter.monthYearLabel(LocalDate(2026, 1, 1)))
        assertEquals("Dec 2030", GoalPlanPresenter.monthYearLabel(LocalDate(2030, 12, 31)))
    }

    @Test
    fun `behind plan surfaces a formatted catch-up amount`() {
        val ui = GoalPlanPresenter.present(
            goal = goal(target = 130_000, current = 0, targetDate = LocalDate(2026, 4, 2)),
            today = today,
            currency = Currency.USD,
            actualPerWeekCents = 5_000,
        )
        assertTrue(ui.isBehind)
        assertNotNull(ui.catchUpPerWeekFormatted)
        assertTrue(ui.paceMessage.contains(ui.catchUpPerWeekFormatted!!))
    }
}
