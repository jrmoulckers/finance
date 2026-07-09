// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals

/**
 * Tests for the exact, integer-only money helpers added to eliminate the
 * floating-point precision loss in [MoneyOperations.divide] / [percentage].
 */
class MoneyExactMathTest {

    // ── divide() is now exact integer round-half-to-even ─────────────

    @Test
    fun divide_roundsHalfToEven_oddQuotient() {
        // 3 / 2 = 1.5 -> quotient 1 (odd) -> 2
        assertEquals(Cents(2), MoneyOperations.divide(Cents(3), 2))
    }

    @Test
    fun divide_roundsHalfToEven_evenQuotient() {
        // 1 / 2 = 0.5 -> quotient 0 (even) -> 0
        assertEquals(Cents(0), MoneyOperations.divide(Cents(1), 2))
        // 5 / 2 = 2.5 -> quotient 2 (even) -> 2
        assertEquals(Cents(2), MoneyOperations.divide(Cents(5), 2))
    }

    @Test
    fun divide_negativeIsSymmetric() {
        assertEquals(Cents(-2), MoneyOperations.divide(Cents(-3), 2))
        assertEquals(Cents(-2), MoneyOperations.divide(Cents(-5), 2))
        assertEquals(Cents(0), MoneyOperations.divide(Cents(-1), 2))
    }

    @Test
    fun divide_negativeDivisor() {
        assertEquals(Cents(-500), MoneyOperations.divide(Cents(1000), -2))
        assertEquals(Cents(500), MoneyOperations.divide(Cents(-1000), -2))
    }

    @Test
    fun divide_byZero_throws() {
        assertFailsWith<IllegalArgumentException> { MoneyOperations.divide(Cents(1), 0) }
    }

    // ── roundedDiv() direct ──────────────────────────────────────────

    @Test
    fun roundedDiv_belowAndAboveHalf() {
        assertEquals(3L, MoneyOperations.roundedDiv(10L, 3L)) // 3.33 -> 3
        assertEquals(4L, MoneyOperations.roundedDiv(11L, 3L)) // 3.67 -> 4
    }

    @Test
    fun roundedDiv_exactHalfToEven() {
        assertEquals(2L, MoneyOperations.roundedDiv(5L, 2L))  // 2.5 -> 2 (even)
        assertEquals(2L, MoneyOperations.roundedDiv(3L, 2L))  // 1.5 -> 2 (even)
        assertEquals(4L, MoneyOperations.roundedDiv(7L, 2L))  // 3.5 -> 4 (even)
    }

    // ── percentageExact() ────────────────────────────────────────────

    @Test
    fun percentageExact_basicPercentages() {
        assertEquals(Cents(500), MoneyOperations.percentageExact(Cents(1000), 50, 100))
        assertEquals(Cents(1000), MoneyOperations.percentageExact(Cents(1000), 100, 100))
        assertEquals(Cents(0), MoneyOperations.percentageExact(Cents(1000), 0, 100))
    }

    @Test
    fun percentageExact_salesTaxBasisPoints() {
        // $49.99 * 8.875% (887.5 bps) = 443.66125 -> 444 (round half to even not triggered)
        assertEquals(Cents(444), MoneyOperations.percentageExact(Cents(4999), 8875, 100_000))
    }

    @Test
    fun percentageExact_zeroDenominator_throws() {
        assertFailsWith<IllegalArgumentException> {
            MoneyOperations.percentageExact(Cents(1000), 50, 0)
        }
    }

    /**
     * Regression guard: for magnitudes above 2^53 minor units the `Double` path
     * silently loses precision, but the exact path is correct. 2^53 + 1 is the
     * smallest integer a `Double` cannot represent.
     */
    @Test
    fun percentageExact_isExactAboveDoublePrecision() {
        val huge = Cents(9_007_199_254_740_993L) // 2^53 + 1

        // 100% of the value must equal the value exactly.
        assertEquals(huge, MoneyOperations.percentageExact(huge, 100, 100))

        // The legacy Double-based path cannot represent this and drifts by 1 cent,
        // which is exactly why the exact path exists.
        assertNotEquals(huge, MoneyOperations.percentage(huge, 100.0))
    }
}
