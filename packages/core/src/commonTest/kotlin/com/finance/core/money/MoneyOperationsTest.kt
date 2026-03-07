package com.finance.core.money

import com.finance.models.types.Cents
import kotlin.test.*

class MoneyOperationsTest {

    // ═══════════════════════════════════════════════════════════════════
    // multiply() — banker's rounding
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multiply_wholeNumberResult() {
        // 1000 * 1.5 = 1500.0 — no rounding needed
        assertEquals(Cents(1500), MoneyOperations.multiply(Cents(1000), 1.5))
    }

    @Test
    fun multiply_roundsDownBelowHalf() {
        // 100 * 1.004 = 100.4 → floor = 100
        assertEquals(Cents(100), MoneyOperations.multiply(Cents(100), 1.004))
    }

    @Test
    fun multiply_roundsUpAboveHalf() {
        // 100 * 1.006 = 100.6 → 101
        assertEquals(Cents(101), MoneyOperations.multiply(Cents(100), 1.006))
    }

    @Test
    fun multiply_bankersRoundHalfToEven_evenFloor() {
        // 4 * 0.5 = 2.0 → exactly 2 (already even, no rounding needed)
        assertEquals(Cents(2), MoneyOperations.multiply(Cents(4), 0.5))
    }

    @Test
    fun multiply_bankersRoundHalfToEven_oddFloor() {
        // 3 * 0.5 = 1.5 → floor=1 (odd) → rounds to 2 (even)
        assertEquals(Cents(2), MoneyOperations.multiply(Cents(3), 0.5))
    }

    @Test
    fun multiply_bankersRoundHalfToEven_2point5() {
        // 5 * 0.5 = 2.5 → floor=2 (even) → stays 2
        assertEquals(Cents(2), MoneyOperations.multiply(Cents(5), 0.5))
    }

    @Test
    fun multiply_bankersRoundHalfToEven_3point5() {
        // 7 * 0.5 = 3.5 → floor=3 (odd) → rounds to 4 (even)
        assertEquals(Cents(4), MoneyOperations.multiply(Cents(7), 0.5))
    }

    @Test
    fun multiply_bankersRoundHalfToEven_4point5() {
        // 9 * 0.5 = 4.5 → floor=4 (even) → stays 4
        assertEquals(Cents(4), MoneyOperations.multiply(Cents(9), 0.5))
    }

    @Test
    fun multiply_negativeAmount() {
        // -1000 * 1.5 = -1500.0
        assertEquals(Cents(-1500), MoneyOperations.multiply(Cents(-1000), 1.5))
    }

    @Test
    fun multiply_zeroAmount() {
        assertEquals(Cents(0), MoneyOperations.multiply(Cents(0), 1.5))
    }

    @Test
    fun multiply_zeroFactor() {
        assertEquals(Cents(0), MoneyOperations.multiply(Cents(1000), 0.0))
    }

    @Test
    fun multiply_byOne() {
        assertEquals(Cents(12345), MoneyOperations.multiply(Cents(12345), 1.0))
    }

    @Test
    fun multiply_negativeFactor() {
        // 1000 * -0.5 = -500.0
        assertEquals(Cents(-500), MoneyOperations.multiply(Cents(1000), -0.5))
    }

    @Test
    fun multiply_taxCalculation_realistic() {
        // $100.00 * 8.25% = $8.25
        assertEquals(Cents(825), MoneyOperations.multiply(Cents(10000), 0.0825))
    }

    // ═══════════════════════════════════════════════════════════════════
    // divide()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun divide_evenDivision() {
        assertEquals(Cents(500), MoneyOperations.divide(Cents(1000), 2))
    }

    @Test
    fun divide_withRounding() {
        // 1000 / 3 = 333.333... → 333
        assertEquals(Cents(333), MoneyOperations.divide(Cents(1000), 3))
    }

    @Test
    fun divide_bankersRound_halfToEven() {
        // 1 / 2 = 0.5 → floor=0 (even) → stays 0
        assertEquals(Cents(0), MoneyOperations.divide(Cents(1), 2))
    }

    @Test
    fun divide_bankersRound_halfToEven_oddFloor() {
        // 3 / 2 = 1.5 → floor=1 (odd) → rounds to 2
        assertEquals(Cents(2), MoneyOperations.divide(Cents(3), 2))
    }

    @Test
    fun divide_negativeAmount() {
        assertEquals(Cents(-500), MoneyOperations.divide(Cents(-1000), 2))
    }

    @Test
    fun divide_byOne() {
        assertEquals(Cents(42), MoneyOperations.divide(Cents(42), 1))
    }

    @Test
    fun divide_zeroAmount() {
        assertEquals(Cents(0), MoneyOperations.divide(Cents(0), 5))
    }

    @Test
    fun divide_byZero_throws() {
        assertFailsWith<IllegalArgumentException>("Cannot divide by zero") {
            MoneyOperations.divide(Cents(1000), 0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // percentage()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun percentage_fiftyPercent() {
        assertEquals(Cents(500), MoneyOperations.percentage(Cents(1000), 50.0))
    }

    @Test
    fun percentage_hundredPercent() {
        assertEquals(Cents(1000), MoneyOperations.percentage(Cents(1000), 100.0))
    }

    @Test
    fun percentage_zeroPercent() {
        assertEquals(Cents(0), MoneyOperations.percentage(Cents(1000), 0.0))
    }

    @Test
    fun percentage_fractional() {
        // 10000 * 15.5 / 100 = 1550
        assertEquals(Cents(1550), MoneyOperations.percentage(Cents(10000), 15.5))
    }

    @Test
    fun percentage_overHundred() {
        // 1000 * 200% = 2000
        assertEquals(Cents(2000), MoneyOperations.percentage(Cents(1000), 200.0))
    }

    @Test
    fun percentage_negativeAmount() {
        assertEquals(Cents(-250), MoneyOperations.percentage(Cents(-500), 50.0))
    }

    @Test
    fun percentage_salesTax() {
        // $49.99 * 8.875% = 443.66125 → banker's round = 444
        assertEquals(Cents(444), MoneyOperations.percentage(Cents(4999), 8.875))
    }

    // ═══════════════════════════════════════════════════════════════════
    // sum()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun sum_emptyList() {
        assertEquals(Cents(0), MoneyOperations.sum(emptyList()))
    }

    @Test
    fun sum_singleItem() {
        assertEquals(Cents(500), MoneyOperations.sum(listOf(Cents(500))))
    }

    @Test
    fun sum_multipleItems() {
        assertEquals(Cents(1500), MoneyOperations.sum(listOf(Cents(500), Cents(300), Cents(700))))
    }

    @Test
    fun sum_withNegativeValues() {
        assertEquals(Cents(200), MoneyOperations.sum(listOf(Cents(500), Cents(-300))))
    }

    @Test
    fun sum_allZero() {
        assertEquals(Cents(0), MoneyOperations.sum(listOf(Cents(0), Cents(0), Cents(0))))
    }

    @Test
    fun sum_largeList() {
        val amounts = (1..100).map { Cents(100) }
        assertEquals(Cents(10000), MoneyOperations.sum(amounts))
    }

    // ═══════════════════════════════════════════════════════════════════
    // bankersRound() — direct tests
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun bankersRound_exactHalf_evenFloor() {
        // 0.5 → floor=0 (even) → 0
        assertEquals(0L, MoneyOperations.bankersRound(0.5))
        // 2.5 → floor=2 (even) → 2
        assertEquals(2L, MoneyOperations.bankersRound(2.5))
        // 4.5 → floor=4 (even) → 4
        assertEquals(4L, MoneyOperations.bankersRound(4.5))
    }

    @Test
    fun bankersRound_exactHalf_oddFloor() {
        // 1.5 → floor=1 (odd) → 2
        assertEquals(2L, MoneyOperations.bankersRound(1.5))
        // 3.5 → floor=3 (odd) → 4
        assertEquals(4L, MoneyOperations.bankersRound(3.5))
        // 5.5 → floor=5 (odd) → 6
        assertEquals(6L, MoneyOperations.bankersRound(5.5))
    }

    @Test
    fun bankersRound_belowHalf() {
        assertEquals(3L, MoneyOperations.bankersRound(3.2))
        assertEquals(7L, MoneyOperations.bankersRound(7.499))
    }

    @Test
    fun bankersRound_aboveHalf() {
        assertEquals(4L, MoneyOperations.bankersRound(3.7))
        assertEquals(8L, MoneyOperations.bankersRound(7.501))
    }

    @Test
    fun bankersRound_wholeNumber() {
        assertEquals(5L, MoneyOperations.bankersRound(5.0))
    }

    @Test
    fun bankersRound_zero() {
        assertEquals(0L, MoneyOperations.bankersRound(0.0))
    }

    @Test
    fun bankersRound_negativeValues() {
        // -2.5 → floor(-2.5) = -3, fraction = 0.5, -3 % 2 = -1 (odd) → -3 + 1 = -2
        assertEquals(-2L, MoneyOperations.bankersRound(-2.5))
        // -3.5 → floor(-3.5) = -4, fraction = 0.5, -4 % 2 = 0 (even) → -4
        assertEquals(-4L, MoneyOperations.bankersRound(-3.5))
    }

    // ═══════════════════════════════════════════════════════════════════
    // allocate() — even splits with remainder distribution
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allocate_evenSplit() {
        val result = MoneyOperations.allocate(Cents(1000), 2)
        assertEquals(listOf(Cents(500), Cents(500)), result)
    }

    @Test
    fun allocate_unevenSplit_remainderOnFirst() {
        // 1000 / 3 = 333 remainder 1
        val result = MoneyOperations.allocate(Cents(1000), 3)
        assertEquals(listOf(Cents(334), Cents(333), Cents(333)), result)
        // No cents lost
        assertEquals(1000L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_largerRemainder() {
        // 100 / 3 = 33 remainder 1
        val result = MoneyOperations.allocate(Cents(100), 3)
        assertEquals(listOf(Cents(34), Cents(33), Cents(33)), result)
        assertEquals(100L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_moreRemainderSlots() {
        // 10 / 3 = 3 remainder 1
        val result = MoneyOperations.allocate(Cents(10), 3)
        assertEquals(listOf(Cents(4), Cents(3), Cents(3)), result)
        assertEquals(10L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_singlePart() {
        val result = MoneyOperations.allocate(Cents(999), 1)
        assertEquals(listOf(Cents(999)), result)
    }

    @Test
    fun allocate_amountLessThanParts() {
        // 2 / 5 = 0 remainder 2
        val result = MoneyOperations.allocate(Cents(2), 5)
        assertEquals(listOf(Cents(1), Cents(1), Cents(0), Cents(0), Cents(0)), result)
        assertEquals(2L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_zeroAmount() {
        val result = MoneyOperations.allocate(Cents(0), 3)
        assertEquals(listOf(Cents(0), Cents(0), Cents(0)), result)
    }

    @Test
    fun allocate_negativeAmount() {
        // -1000 / 3 = -333 remainder -1
        val result = MoneyOperations.allocate(Cents(-1000), 3)
        assertEquals(listOf(Cents(-334), Cents(-333), Cents(-333)), result)
        assertEquals(-1000L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_zeroParts_throws() {
        assertFailsWith<IllegalArgumentException> {
            MoneyOperations.allocate(Cents(1000), 0)
        }
    }

    @Test
    fun allocate_preservesTotalAmount() {
        // Large uneven split
        val amount = Cents(9999)
        val parts = 7
        val result = MoneyOperations.allocate(amount, parts)
        assertEquals(parts, result.size)
        assertEquals(amount.amount, result.sumOf { it.amount })
    }

    // ═══════════════════════════════════════════════════════════════════
    // allocateByRatio()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allocateByRatio_50_30_20_split() {
        // $100.00 split 50/30/20
        val result = MoneyOperations.allocateByRatio(Cents(10000), listOf(50, 30, 20))
        assertEquals(listOf(Cents(5000), Cents(3000), Cents(2000)), result)
        assertEquals(10000L, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_equalRatios() {
        // $100.00 split 3 ways equally
        val result = MoneyOperations.allocateByRatio(Cents(10000), listOf(1, 1, 1))
        // 10000 * 1/3 = 3333 each, total 9999, remainder 1 → first gets extra
        assertEquals(10000L, result.sumOf { it.amount })
        assertEquals(Cents(3334), result[0])
        assertEquals(Cents(3333), result[1])
        assertEquals(Cents(3333), result[2])
    }

    @Test
    fun allocateByRatio_singleRatio() {
        val result = MoneyOperations.allocateByRatio(Cents(5000), listOf(1))
        assertEquals(listOf(Cents(5000)), result)
    }

    @Test
    fun allocateByRatio_preservesTotalAmount() {
        val amount = Cents(9999)
        val result = MoneyOperations.allocateByRatio(amount, listOf(30, 25, 25, 20))
        assertEquals(amount.amount, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_remainderGoesToLargestRatioFirst() {
        // 1000 split by [3, 1] → total = 4
        // 1000 * 3/4 = 750, 1000 * 1/4 = 250 → total 1000, no remainder
        val result = MoneyOperations.allocateByRatio(Cents(1000), listOf(3, 1))
        assertEquals(listOf(Cents(750), Cents(250)), result)
    }

    @Test
    fun allocateByRatio_withRemainder() {
        // 1001 split by [1, 1] → 500, 500 → remainder 1 → first gets it
        val result = MoneyOperations.allocateByRatio(Cents(1001), listOf(1, 1))
        assertEquals(1001L, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_emptyRatios_throws() {
        assertFailsWith<IllegalArgumentException> {
            MoneyOperations.allocateByRatio(Cents(1000), emptyList())
        }
    }

    @Test
    fun allocateByRatio_zeroRatio_throws() {
        assertFailsWith<IllegalArgumentException> {
            MoneyOperations.allocateByRatio(Cents(1000), listOf(1, 0, 2))
        }
    }

    @Test
    fun allocateByRatio_negativeRatio_throws() {
        assertFailsWith<IllegalArgumentException> {
            MoneyOperations.allocateByRatio(Cents(1000), listOf(1, -1))
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Cents value class — basic arithmetic
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun cents_addition() {
        assertEquals(Cents(300), Cents(100) + Cents(200))
    }

    @Test
    fun cents_subtraction() {
        assertEquals(Cents(100), Cents(300) - Cents(200))
    }

    @Test
    fun cents_subtraction_negative() {
        assertEquals(Cents(-100), Cents(200) - Cents(300))
    }

    @Test
    fun cents_multiplication_byInt() {
        assertEquals(Cents(300), Cents(100) * 3)
    }

    @Test
    fun cents_unaryMinus() {
        assertEquals(Cents(-100), -Cents(100))
        assertEquals(Cents(100), -Cents(-100))
    }

    @Test
    fun cents_abs() {
        assertEquals(Cents(100), Cents(-100).abs())
        assertEquals(Cents(100), Cents(100).abs())
        assertEquals(Cents(0), Cents(0).abs())
    }

    @Test
    fun cents_isPositive_isNegative_isZero() {
        assertTrue(Cents(1).isPositive())
        assertFalse(Cents(1).isNegative())
        assertFalse(Cents(1).isZero())

        assertTrue(Cents(-1).isNegative())
        assertFalse(Cents(-1).isPositive())

        assertTrue(Cents(0).isZero())
        assertFalse(Cents(0).isPositive())
        assertFalse(Cents(0).isNegative())
    }

    @Test
    fun cents_compareTo() {
        assertTrue(Cents(200) > Cents(100))
        assertTrue(Cents(100) < Cents(200))
        assertTrue(Cents(100).compareTo(Cents(100)) == 0)
    }

    @Test
    fun cents_fromDollars() {
        assertEquals(Cents(1250), Cents.fromDollars(12.5))
        assertEquals(Cents(0), Cents.fromDollars(0.0))
        assertEquals(Cents(-500), Cents.fromDollars(-5.0))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multiply_largeAmount() {
        // $10,000,000.00 = 1_000_000_000 cents * 1.0 should not overflow
        val result = MoneyOperations.multiply(Cents(1_000_000_000), 1.0)
        assertEquals(Cents(1_000_000_000), result)
    }

    @Test
    fun allocate_largeParts() {
        val result = MoneyOperations.allocate(Cents(1_000_000), 100)
        assertEquals(100, result.size)
        assertEquals(1_000_000L, result.sumOf { it.amount })
        assertTrue(result.all { it.amount == 10_000L })
    }
}
