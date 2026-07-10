// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.BudgetPeriod
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Regression tests for #3595 — budget period anchoring must honour `startDate`
 * for WEEKLY / MONTHLY / QUARTERLY / YEARLY, not just BIWEEKLY.
 */
class BudgetPeriodAnchoringTest {

    // ── WEEKLY anchored to startDate's day-of-week (not ISO Monday) ────

    @Test
    fun weekly_anchorsOnStartDayOfWeek_notMonday() {
        // 2024-06-06 is a Thursday. A weekly budget anchored here should run
        // Thu → Wed, NOT Mon → Sun.
        val start = LocalDate(2024, 6, 6)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.WEEKLY, start, LocalDate(2024, 6, 10))

        assertEquals(LocalDate(2024, 6, 6), period.start, "week anchored on the Thursday startDate")
        assertEquals(LocalDate(2024, 6, 12), period.end, "week ends the following Wednesday")
        assertEquals(7, period.daysTotal)
    }

    @Test
    fun weekly_secondWeekFromStart() {
        val start = LocalDate(2024, 6, 6) // Thursday
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.WEEKLY, start, LocalDate(2024, 6, 15))

        assertEquals(LocalDate(2024, 6, 13), period.start)
        assertEquals(LocalDate(2024, 6, 19), period.end)
    }

    // ── MONTHLY anchored to startDate's day-of-month ───────────────────

    @Test
    fun monthly_anchorsOnStartDayOfMonth_15th() {
        // Pay-cycle budget: the 15th to the 14th.
        val start = LocalDate(2024, 1, 15)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.MONTHLY, start, LocalDate(2024, 6, 20))

        assertEquals(LocalDate(2024, 6, 15), period.start)
        assertEquals(LocalDate(2024, 7, 14), period.end)
    }

    @Test
    fun monthly_referenceBeforeAnchorDay_fallsInPriorPeriod() {
        val start = LocalDate(2024, 1, 15)
        // June 10 is before the 15th, so it belongs to the May 15 – Jun 14 period.
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.MONTHLY, start, LocalDate(2024, 6, 10))

        assertEquals(LocalDate(2024, 5, 15), period.start)
        assertEquals(LocalDate(2024, 6, 14), period.end)
    }

    @Test
    fun monthly_onExactAnchorDay() {
        val start = LocalDate(2024, 1, 15)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.MONTHLY, start, LocalDate(2024, 6, 15))

        assertEquals(LocalDate(2024, 6, 15), period.start)
        assertEquals(LocalDate(2024, 7, 14), period.end)
    }

    @Test
    fun monthly_endOfMonthAnchor_clampsForShortMonths() {
        // Anchored on Jan 31: February has no 31st, so the Feb period starts on
        // the clamped Feb 29 (2024 is a leap year).
        val start = LocalDate(2024, 1, 31)
        val febPeriod = BudgetCalculator.getCurrentPeriod(BudgetPeriod.MONTHLY, start, LocalDate(2024, 2, 15))

        assertEquals(LocalDate(2024, 1, 31), febPeriod.start)
        assertEquals(LocalDate(2024, 2, 28), febPeriod.end)
    }

    // ── QUARTERLY anchored to startDate ────────────────────────────────

    @Test
    fun quarterly_anchorsOnStartDate() {
        // Starts Feb 15 → quarters are Feb15–May14, May15–Aug14, ...
        val start = LocalDate(2024, 2, 15)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.QUARTERLY, start, LocalDate(2024, 3, 1))

        assertEquals(LocalDate(2024, 2, 15), period.start)
        assertEquals(LocalDate(2024, 5, 14), period.end)
    }

    @Test
    fun quarterly_secondQuarterFromStart() {
        val start = LocalDate(2024, 2, 15)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.QUARTERLY, start, LocalDate(2024, 6, 1))

        assertEquals(LocalDate(2024, 5, 15), period.start)
        assertEquals(LocalDate(2024, 8, 14), period.end)
    }

    // ── YEARLY anchored to startDate ───────────────────────────────────

    @Test
    fun yearly_anchorsOnStartDate() {
        // Fiscal year starting Apr 6.
        val start = LocalDate(2023, 4, 6)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.YEARLY, start, LocalDate(2024, 1, 1))

        assertEquals(LocalDate(2023, 4, 6), period.start)
        assertEquals(LocalDate(2024, 4, 5), period.end)
    }

    @Test
    fun yearly_referenceAfterAnchor_nextYear() {
        val start = LocalDate(2023, 4, 6)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.YEARLY, start, LocalDate(2024, 6, 1))

        assertEquals(LocalDate(2024, 4, 6), period.start)
        assertEquals(LocalDate(2025, 4, 5), period.end)
    }

    // ── Calendar-aligned budgets remain on the calendar grid ───────────

    @Test
    fun monthly_calendarAlignedStart_unchanged() {
        // startDate on the 1st still yields calendar months.
        val start = LocalDate(2024, 1, 1)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.MONTHLY, start, LocalDate(2024, 6, 15))

        assertEquals(LocalDate(2024, 6, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
    }
}
