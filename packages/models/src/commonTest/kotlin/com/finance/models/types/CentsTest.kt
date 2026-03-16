// SPDX-License-Identifier: BUSL-1.1

package com.finance.models.types

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Comprehensive tests for [Cents] — the foundational monetary value type.
 *
 * Financial precision is critical: every arithmetic operation, overflow boundary,
 * and comparison must be verified. A bug here silently corrupts balances.
 */
class CentsTest {

    // ── Construction ────────────────────────────────────────────────────

    @Test
    fun constructWithPositiveAmount() {
        val cents = Cents(1500L)
        assertEquals(1500L, cents.amount)
    }

    @Test
    fun constructWithNegativeAmount() {
        val cents = Cents(-750L)
        assertEquals(-750L, cents.amount)
    }

    @Test
    fun constructWithZero() {
        val cents = Cents(0L)
        assertEquals(0L, cents.amount)
    }

    @Test
    fun zeroConstantIsZero() {
        assertEquals(0L, Cents.ZERO.amount)
    }

    @Test
    fun constructWithLongMaxValue() {
        val cents = Cents(Long.MAX_VALUE)
        assertEquals(Long.MAX_VALUE, cents.amount)
    }

    @Test
    fun constructWithLongMinValue() {
        val cents = Cents(Long.MIN_VALUE)
        assertEquals(Long.MIN_VALUE, cents.amount)
    }

    // ── Addition ────────────────────────────────────────────────────────

    @Test
    fun addTwoPositiveAmounts() {
        val result = Cents(1000L) + Cents(2500L)
        assertEquals(Cents(3500L), result)
    }

    @Test
    fun addPositiveAndNegative() {
        val result = Cents(1000L) + Cents(-300L)
        assertEquals(Cents(700L), result)
    }

    @Test
    fun addNegativeAndPositive() {
        val result = Cents(-1000L) + Cents(300L)
        assertEquals(Cents(-700L), result)
    }

    @Test
    fun addTwoNegativeAmounts() {
        val result = Cents(-100L) + Cents(-200L)
        assertEquals(Cents(-300L), result)
    }

    @Test
    fun addZeroToAmount() {
        val result = Cents(500L) + Cents.ZERO
        assertEquals(Cents(500L), result)
    }

    @Test
    fun addAmountToZero() {
        val result = Cents.ZERO + Cents(500L)
        assertEquals(Cents(500L), result)
    }

    @Test
    fun additionOverflowThrows() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) + Cents(1L)
        }
    }

    @Test
    fun additionOverflowWithLargePositives() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE - 10) + Cents(20L)
        }
    }

    @Test
    fun additionNegativeOverflowThrows() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE) + Cents(-1L)
        }
    }

    @Test
    fun additionOfOppositeSignsNeverOverflows() {
        // Opposite signs cannot overflow — this must succeed
        val result = Cents(Long.MAX_VALUE) + Cents(-1L)
        assertEquals(Cents(Long.MAX_VALUE - 1), result)
    }

    @Test
    fun additionAtMaxBoundaryNoOverflow() {
        val result = Cents(Long.MAX_VALUE - 1) + Cents(1L)
        assertEquals(Cents(Long.MAX_VALUE), result)
    }

    // ── Subtraction ─────────────────────────────────────────────────────

    @Test
    fun subtractSmallerFromLarger() {
        val result = Cents(3000L) - Cents(1000L)
        assertEquals(Cents(2000L), result)
    }

    @Test
    fun subtractLargerFromSmaller() {
        val result = Cents(1000L) - Cents(3000L)
        assertEquals(Cents(-2000L), result)
    }

    @Test
    fun subtractNegativeFromPositive() {
        // 1000 - (-500) = 1500
        val result = Cents(1000L) - Cents(-500L)
        assertEquals(Cents(1500L), result)
    }

    @Test
    fun subtractPositiveFromNegative() {
        // -1000 - 500 = -1500
        val result = Cents(-1000L) - Cents(500L)
        assertEquals(Cents(-1500L), result)
    }

    @Test
    fun subtractZero() {
        val result = Cents(500L) - Cents.ZERO
        assertEquals(Cents(500L), result)
    }

    @Test
    fun subtractFromZero() {
        val result = Cents.ZERO - Cents(500L)
        assertEquals(Cents(-500L), result)
    }

    @Test
    fun subtractSameAmount() {
        val result = Cents(1234L) - Cents(1234L)
        assertEquals(Cents.ZERO, result)
    }

    @Test
    fun subtractionOverflowPositiveThrows() {
        // MAX_VALUE - (-1) would exceed MAX_VALUE
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) - Cents(-1L)
        }
    }

    @Test
    fun subtractionOverflowNegativeThrows() {
        // MIN_VALUE - 1 would go below MIN_VALUE
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE) - Cents(1L)
        }
    }

    @Test
    fun subtractionSameSignNeverOverflows() {
        // Same-sign subtraction cannot overflow
        val result = Cents(Long.MIN_VALUE) - Cents(-1L)
        assertEquals(Cents(Long.MIN_VALUE + 1), result)
    }

    // ── Multiplication ──────────────────────────────────────────────────

    @Test
    fun multiplyByPositiveInt() {
        val result = Cents(500L) * 3
        assertEquals(Cents(1500L), result)
    }

    @Test
    fun multiplyByZero() {
        val result = Cents(999L) * 0
        assertEquals(Cents.ZERO, result)
    }

    @Test
    fun multiplyByOne() {
        val result = Cents(1234L) * 1
        assertEquals(Cents(1234L), result)
    }

    @Test
    fun multiplyByNegativeInt() {
        val result = Cents(500L) * -2
        assertEquals(Cents(-1000L), result)
    }

    @Test
    fun multiplyNegativeByNegative() {
        val result = Cents(-500L) * -2
        assertEquals(Cents(1000L), result)
    }

    @Test
    fun multiplicationOverflowThrows() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) * 2
        }
    }

    @Test
    fun multiplicationNegativeOverflowThrows() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE) * 2
        }
    }

    @Test
    fun multiplicationOverflowWithLargeFactorThrows() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE / 2 + 1) * 2
        }
    }

    // ── Unary Minus (Negation) ──────────────────────────────────────────

    @Test
    fun negatePositive() {
        val result = -Cents(500L)
        assertEquals(Cents(-500L), result)
    }

    @Test
    fun negateNegative() {
        val result = -Cents(-500L)
        assertEquals(Cents(500L), result)
    }

    @Test
    fun negateZero() {
        val result = -Cents.ZERO
        assertEquals(Cents.ZERO, result)
    }

    @Test
    fun negateMinValueOverflowThrows() {
        // Long.MIN_VALUE has no positive counterpart in Long
        assertFailsWith<ArithmeticException> {
            -Cents(Long.MIN_VALUE)
        }
    }

    @Test
    fun negateMaxValue() {
        val result = -Cents(Long.MAX_VALUE)
        assertEquals(Cents(-Long.MAX_VALUE), result)
    }

    // ── Comparison ──────────────────────────────────────────────────────

    @Test
    fun compareGreaterThan() {
        assertTrue(Cents(100L) > Cents(50L))
    }

    @Test
    fun compareLessThan() {
        assertTrue(Cents(50L) < Cents(100L))
    }

    @Test
    fun compareEqual() {
        assertTrue(Cents(100L).compareTo(Cents(100L)) == 0)
    }

    @Test
    fun compareNegativeValues() {
        assertTrue(Cents(-50L) > Cents(-100L))
    }

    @Test
    fun comparePositiveAndNegative() {
        assertTrue(Cents(1L) > Cents(-1L))
    }

    @Test
    fun compareWithZero() {
        assertTrue(Cents(1L) > Cents.ZERO)
        assertTrue(Cents(-1L) < Cents.ZERO)
    }

    // ── Predicates ──────────────────────────────────────────────────────

    @Test
    fun isPositiveWithPositiveAmount() {
        assertTrue(Cents(1L).isPositive())
    }

    @Test
    fun isPositiveWithZero() {
        assertFalse(Cents.ZERO.isPositive())
    }

    @Test
    fun isPositiveWithNegativeAmount() {
        assertFalse(Cents(-1L).isPositive())
    }

    @Test
    fun isNegativeWithNegativeAmount() {
        assertTrue(Cents(-1L).isNegative())
    }

    @Test
    fun isNegativeWithZero() {
        assertFalse(Cents.ZERO.isNegative())
    }

    @Test
    fun isNegativeWithPositiveAmount() {
        assertFalse(Cents(1L).isNegative())
    }

    @Test
    fun isZeroWithZero() {
        assertTrue(Cents.ZERO.isZero())
    }

    @Test
    fun isZeroWithNonZero() {
        assertFalse(Cents(1L).isZero())
        assertFalse(Cents(-1L).isZero())
    }

    // ── Absolute Value ──────────────────────────────────────────────────

    @Test
    fun absOfPositive() {
        assertEquals(Cents(500L), Cents(500L).abs())
    }

    @Test
    fun absOfNegative() {
        assertEquals(Cents(500L), Cents(-500L).abs())
    }

    @Test
    fun absOfZero() {
        assertEquals(Cents.ZERO, Cents.ZERO.abs())
    }

    @Test
    fun absOfMinValueThrows() {
        // abs(MIN_VALUE) requires negation, which overflows
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE).abs()
        }
    }

    // ── fromDollars ─────────────────────────────────────────────────────

    @Test
    fun fromDollarsWholeDollar() {
        assertEquals(Cents(1000L), Cents.fromDollars(10.0))
    }

    @Test
    fun fromDollarsWithCents() {
        assertEquals(Cents(1099L), Cents.fromDollars(10.99))
    }

    @Test
    fun fromDollarsZero() {
        assertEquals(Cents.ZERO, Cents.fromDollars(0.0))
    }

    @Test
    fun fromDollarsNegative() {
        assertEquals(Cents(-1500L), Cents.fromDollars(-15.0))
    }

    @Test
    fun fromDollarsSmallAmount() {
        assertEquals(Cents(1L), Cents.fromDollars(0.01))
    }

    // ── Equality (value class) ──────────────────────────────────────────

    @Test
    fun equalityByValue() {
        assertEquals(Cents(100L), Cents(100L))
    }

    @Test
    fun inequalityByValue() {
        assertTrue(Cents(100L) != Cents(200L))
    }

    // ── Combined operations ─────────────────────────────────────────────

    @Test
    fun chainedArithmetic() {
        // (100 + 200) - 50 = 250
        val result = (Cents(100L) + Cents(200L)) - Cents(50L)
        assertEquals(Cents(250L), result)
    }

    @Test
    fun multiplyThenAdd() {
        // (10 * 5) + 3 = 53
        val result = (Cents(10L) * 5) + Cents(3L)
        assertEquals(Cents(53L), result)
    }

    @Test
    fun negateThenAdd() {
        val result = -Cents(100L) + Cents(150L)
        assertEquals(Cents(50L), result)
    }
}
