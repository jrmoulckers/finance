// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.subscription

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Tests for the expanded frequency bands (semi-monthly, every-three-weeks, bimonthly) and the
 * round-half-up integer-Cents money math added in #3738.
 */
class SubscriptionFrequencyRoundingTest {

    // ── New contiguous frequency bands ───────────────────────────────

    @Test
    fun classifiesSemiMonthlyCadence() {
        assertEquals(SubscriptionFrequency.SEMI_MONTHLY, SubscriptionDetector.classifyFrequency(15.0))
        assertEquals(SubscriptionFrequency.SEMI_MONTHLY, SubscriptionDetector.classifyFrequency(16.5))
    }

    @Test
    fun classifiesEveryThreeWeeksCadence() {
        assertEquals(SubscriptionFrequency.EVERY_THREE_WEEKS, SubscriptionDetector.classifyFrequency(21.0))
    }

    @Test
    fun classifiesBimonthlyCadence() {
        assertEquals(SubscriptionFrequency.BIMONTHLY, SubscriptionDetector.classifyFrequency(60.0))
    }

    @Test
    fun bandsAreContiguous_noGapsBetweenBiweeklyAndQuarterly() {
        // Every whole-day interval from 12..100 resolves to a cadence (no dropped gaps inside this
        // supported span), and true out-of-range values stay null.
        for (days in 12..100) {
            val label = "interval=$days"
            kotlin.test.assertNotNull(SubscriptionDetector.classifyFrequency(days.toDouble()), label)
        }
        kotlin.test.assertNull(SubscriptionDetector.classifyFrequency(4.0))
        kotlin.test.assertNull(SubscriptionDetector.classifyFrequency(120.0))
    }

    // ── Detection no longer drops these cadences ─────────────────────

    @Test
    fun detectsEveryThreeWeeksSubscription() {
        val transactions = listOf(0, 21, 42, 63).map { offset ->
            TestFixtures.createExpense(
                amount = Cents(500),
                date = LocalDate(2024, 1, 1).plus(offset, DateTimeUnit.DAY),
            ).copy(payee = "Weekly Box")
        }
        val sub = SubscriptionDetector.detect(transactions).single()
        assertEquals(SubscriptionFrequency.EVERY_THREE_WEEKS, sub.frequency)
    }

    @Test
    fun detectsSemiMonthlySubscription() {
        // 1st and 16th of consecutive months → ~15–16 day intervals.
        val dates = listOf(
            LocalDate(2024, 1, 1),
            LocalDate(2024, 1, 16),
            LocalDate(2024, 2, 1),
            LocalDate(2024, 2, 16),
        )
        val transactions = dates.map { d ->
            TestFixtures.createExpense(amount = Cents(2000), date = d).copy(payee = "Gym")
        }
        val sub = SubscriptionDetector.detect(transactions).single()
        assertEquals(SubscriptionFrequency.SEMI_MONTHLY, sub.frequency)
    }

    // ── Round-half-up average (integer Cents) ────────────────────────

    @Test
    fun averageAmountUsesRoundHalfUp() {
        // Two occurrences 21 days apart; sum 2001 / 2 = 1000.5 → 1001 (round-half-up), not 1000.
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 1)),
            TestFixtures.createExpense(amount = Cents(1001), date = LocalDate(2024, 1, 22)),
        ).map { it.copy(payee = "Rounding Co") }

        val sub = SubscriptionDetector.detect(transactions).single()
        assertEquals(Cents(1001), sub.averageAmount)
    }

    @Test
    fun roundHalfUp_roundsHalvesUpAndStaysInteger() {
        assertEquals(1L, SubscriptionDetector.roundHalfUp(1, 2)) // 0.5 → 1
        assertEquals(2L, SubscriptionDetector.roundHalfUp(3, 2)) // 1.5 → 2
        assertEquals(2L, SubscriptionDetector.roundHalfUp(5, 3)) // 1.67 → 2
        assertEquals(1L, SubscriptionDetector.roundHalfUp(4, 3)) // 1.33 → 1
        assertEquals(1001L, SubscriptionDetector.roundHalfUp(2001, 2))
    }

    // ── Cost conversions for the new frequencies ─────────────────────

    @Test
    fun semiMonthlyCostConversions() {
        val amount = Cents(1000)
        assertEquals(Cents(2000), SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.SEMI_MONTHLY))
        assertEquals(Cents(24000), SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.SEMI_MONTHLY))
    }

    @Test
    fun everyThreeWeeksCostConversions() {
        val amount = Cents(1000)
        // Annual: 1000 * 365 / 21 = 17381.0 → round-half-up 17381.
        assertEquals(Cents(17381), SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.EVERY_THREE_WEEKS))
        // Monthly: 1000 * 365 / 252 = 1448.4 → 1448.
        assertEquals(Cents(1448), SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.EVERY_THREE_WEEKS))
    }

    @Test
    fun bimonthlyCostConversions() {
        val amount = Cents(1000)
        assertEquals(Cents(500), SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.BIMONTHLY))
        assertEquals(Cents(6000), SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.BIMONTHLY))
    }
}
