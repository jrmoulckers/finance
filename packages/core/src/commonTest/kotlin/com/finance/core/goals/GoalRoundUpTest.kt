// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** Tests for the round-up (spare-change) primitive of [GoalTrackingEngine] (#3716). */
class GoalRoundUpTest {

    @Test
    fun exactMultipleYieldsZero() {
        assertEquals(Cents.ZERO, GoalTrackingEngine.roundUpContribution(Cents(500)))
    }

    @Test
    fun oneCentOver() {
        assertEquals(Cents(99), GoalTrackingEngine.roundUpContribution(Cents(501)))
    }

    @Test
    fun ninetyNineCentsOver() {
        assertEquals(Cents(1), GoalTrackingEngine.roundUpContribution(Cents(599)))
    }

    @Test
    fun roundsToNearestFiveDollars() {
        // $4.30 -> next $5 multiple is $5.00, spare change $0.70.
        assertEquals(Cents(70), GoalTrackingEngine.roundUpContribution(Cents(430), Cents(500)))
    }

    @Test
    fun exactFiveDollarMultipleYieldsZero() {
        assertEquals(Cents.ZERO, GoalTrackingEngine.roundUpContribution(Cents(1000), Cents(500)))
    }

    @Test
    fun zeroAmountYieldsZero() {
        assertEquals(Cents.ZERO, GoalTrackingEngine.roundUpContribution(Cents.ZERO))
    }

    @Test
    fun negativeAmountRoundsTowardNextMultiple() {
        // Next multiple of 100 that is >= -150 is -100; difference is 50.
        assertEquals(Cents(50), GoalTrackingEngine.roundUpContribution(Cents(-150)))
    }

    @Test
    fun nonPositiveNearestRejected() {
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.roundUpContribution(Cents(501), Cents.ZERO)
        }
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.roundUpContribution(Cents(501), Cents(-100))
        }
    }

    @Test
    fun totalSumsRoundUps() {
        // 0.75 + 0.10 + 1.00 -> 0.25 + 0.90 + 0.00
        val amounts = listOf(Cents(325), Cents(510), Cents(700))
        assertEquals(Cents(75 + 90 + 0), GoalTrackingEngine.roundUpTotal(amounts))
    }

    @Test
    fun totalOfEmptyListIsZero() {
        assertEquals(Cents.ZERO, GoalTrackingEngine.roundUpTotal(emptyList()))
    }

    @Test
    fun totalRejectsInvalidNearest() {
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.roundUpTotal(listOf(Cents(101)), Cents.ZERO)
        }
    }
}
