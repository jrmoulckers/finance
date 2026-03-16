// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import kotlin.test.*

/**
 * Edge case tests for [MoneyOperations] covering financial-risk scenarios:
 * banker's rounding boundaries, allocation remainder distribution,
 * sub-cent precision, and negative-amount handling.
 */
class MoneyOperationsEdgeCaseTest {

    // ═══════════════════════════════════════════════════════════════════
    // bankersRound() — exhaustive edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun bankersRound_largeEvenFloorAtHalf() {
        // 100.5 → floor=100 (even) → stays 100
        assertEquals(100L, MoneyOperations.bankersRound(100.5))
    }

    @Test
    fun bankersRound_largeOddFloorAtHalf() {
        // 101.5 → floor=101 (odd) → rounds to 102
        assertEquals(102L, MoneyOperations.bankersRound(101.5))
    }

    @Test
    fun bankersRound_negativeOddFloorAtHalf() {
        // -0.5 → floor(-0.5) = -1, fraction = 0.5, -1 % 2 = -1 (odd) → -1 + 1 = 0
        assertEquals(0L, MoneyOperations.bankersRound(-0.5))
    }

    @Test
    fun bankersRound_negativeAboveHalf() {
        // -1.7 → floor(-1.7) = -2, fraction = -1.7 - (-2) = 0.3 → < 0.5 → -2
        assertEquals(-2L, MoneyOperations.bankersRound(-1.7))
    }

    @Test
    fun bankersRound_negativeAboveHalfFraction() {
        // -1.3 → floor(-1.3) = -2, fraction = -1.3 - (-2) = 0.7 → > 0.5 → -2 + 1 = -1
        assertEquals(-1L, MoneyOperations.bankersRound(-1.3))
    }

    @Test
    fun bankersRound_verySmallFractionAboveHalf() {
        // 10.500001 → slightly above 0.5 → rounds up to 11
        assertEquals(11L, MoneyOperations.bankersRound(10.500001))
    }

    @Test
    fun bankersRound_verySmallFractionBelowHalf() {
        // 10.499999 → slightly below 0.5 → stays 10
        assertEquals(10L, MoneyOperations.bankersRound(10.499999))
    }

    // ═══════════════════════════════════════════════════════════════════
    // multiply() — financial rounding edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multiply_resultExactlyAtHalfCent_evenFloor() {
        // 1 * 2.5 = 2.5 → floor=2 (even) → stays 2
        assertEquals(Cents(2), MoneyOperations.multiply(Cents(1), 2.5))
    }

    @Test
    fun multiply_resultExactlyAtHalfCent_oddFloor() {
        // 1 * 3.5 = 3.5 → floor=3 (odd) → rounds to 4
        assertEquals(Cents(4), MoneyOperations.multiply(Cents(1), 3.5))
    }

    @Test
    fun multiply_verySmallFactor() {
        // $100.00 * 0.001 = 10 * 0.001 = 0.01 → banker's round = 0 (even floor)
        // Wait: 10000 * 0.001 = 10.0 → exactly 10
        assertEquals(Cents(10), MoneyOperations.multiply(Cents(10000), 0.001))
    }

    @Test
    fun multiply_factorProducingSubCentResult() {
        // 1 cent * 0.3 = 0.3 → banker's round floor 0 → 0
        assertEquals(Cents(0), MoneyOperations.multiply(Cents(1), 0.3))
    }

    @Test
    fun multiply_factorProducingSubCentRoundsUp() {
        // 1 cent * 0.7 = 0.7 → above half → 1
        assertEquals(Cents(1), MoneyOperations.multiply(Cents(1), 0.7))
    }

    @Test
    fun multiply_negativeAmountAndNegativeFactor() {
        // -500 * -2.0 = 1000.0 → positive result
        assertEquals(Cents(1000), MoneyOperations.multiply(Cents(-500), -2.0))
    }

    @Test
    fun multiply_tipCalculation_18percent() {
        // $47.83 tip at 18% = 4783 * 0.18 = 860.94 → 861
        assertEquals(Cents(861), MoneyOperations.multiply(Cents(4783), 0.18))
    }

    @Test
    fun multiply_tipCalculation_20percent() {
        // $33.33 tip at 20% = 3333 * 0.20 = 666.6 → above half → 667
        assertEquals(Cents(667), MoneyOperations.multiply(Cents(3333), 0.20))
    }

    // ═══════════════════════════════════════════════════════════════════
    // divide() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun divide_negativeDivisor() {
        // 1000 / -2 = -500.0
        assertEquals(Cents(-500), MoneyOperations.divide(Cents(1000), -2))
    }

    @Test
    fun divide_negativeAmountAndNegativeDivisor() {
        // -1000 / -2 = 500.0
        assertEquals(Cents(500), MoneyOperations.divide(Cents(-1000), -2))
    }

    @Test
    fun divide_resultExactlyHalf_evenFloor() {
        // 5 / 2 = 2.5 → floor=2 (even) → stays 2
        assertEquals(Cents(2), MoneyOperations.divide(Cents(5), 2))
    }

    @Test
    fun divide_resultExactlyHalf_oddFloor() {
        // 7 / 2 = 3.5 → floor=3 (odd) → rounds to 4
        assertEquals(Cents(4), MoneyOperations.divide(Cents(7), 2))
    }

    @Test
    fun divide_oneCentByLargeNumber() {
        // 1 / 100 = 0.01 → 0
        assertEquals(Cents(0), MoneyOperations.divide(Cents(1), 100))
    }

    @Test
    fun divide_splitBillThreeWays() {
        // $100.00 / 3 = 3333.33... → 3333
        assertEquals(Cents(3333), MoneyOperations.divide(Cents(10000), 3))
    }

    @Test
    fun divide_splitBillSevenWays() {
        // $100.00 / 7 = 1428.571... → 1429 (above half)
        assertEquals(Cents(1429), MoneyOperations.divide(Cents(10000), 7))
    }

    // ═══════════════════════════════════════════════════════════════════
    // percentage() — rounding edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun percentage_verySmallPercentage() {
        // 1000 * 0.01% = 1000 * 0.0001 = 0.1 → 0
        assertEquals(Cents(0), MoneyOperations.percentage(Cents(1000), 0.01))
    }

    @Test
    fun percentage_resultAtExactHalf() {
        // 100 * 0.5% = 100 * 0.005 = 0.5 → floor=0 (even) → 0
        assertEquals(Cents(0), MoneyOperations.percentage(Cents(100), 0.5))
    }

    @Test
    fun percentage_oneThirdPercent() {
        // 300 * 33.333...% = 300 * 0.33333... = 99.999... → banker's round → 100
        assertEquals(Cents(100), MoneyOperations.percentage(Cents(300), 100.0 / 3.0))
    }

    @Test
    fun percentage_negativePercentage() {
        // 1000 * -10% = 1000 * -0.1 = -100
        assertEquals(Cents(-100), MoneyOperations.percentage(Cents(1000), -10.0))
    }

    @Test
    fun percentage_compoundTaxCalculation() {
        // $99.99 at 7.25% = 9999 * 0.0725 = 724.9275 → 725
        assertEquals(Cents(725), MoneyOperations.percentage(Cents(9999), 7.25))
    }

    // ═══════════════════════════════════════════════════════════════════
    // allocate() — financial splitting scenarios
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allocate_oneDollarAmongThree() {
        // $1.00 / 3 = 33 remainder 1. First person gets extra cent.
        val result = MoneyOperations.allocate(Cents(100), 3)
        assertEquals(listOf(Cents(34), Cents(33), Cents(33)), result)
        assertEquals(100L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_oneCentAmongTwo() {
        // 1 cent / 2 = 0 remainder 1. First person gets the cent.
        val result = MoneyOperations.allocate(Cents(1), 2)
        assertEquals(listOf(Cents(1), Cents(0)), result)
        assertEquals(1L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_oneCentAmongTen() {
        // 1 cent / 10 = 0 remainder 1. First person gets the cent, rest get 0.
        val result = MoneyOperations.allocate(Cents(1), 10)
        assertEquals(1, result.count { it.amount == 1L })
        assertEquals(9, result.count { it.amount == 0L })
        assertEquals(1L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_negativeAmountAmongThree() {
        // -100 / 3 = -33 remainder -1. First person gets extra -1.
        val result = MoneyOperations.allocate(Cents(-100), 3)
        assertEquals(listOf(Cents(-34), Cents(-33), Cents(-33)), result)
        assertEquals(-100L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_twoCentsAmongThree() {
        // 2 / 3 = 0 remainder 2. First two get 1, last gets 0.
        val result = MoneyOperations.allocate(Cents(2), 3)
        assertEquals(listOf(Cents(1), Cents(1), Cents(0)), result)
        assertEquals(2L, result.sumOf { it.amount })
    }

    @Test
    fun allocate_negativeParts_throws() {
        assertFailsWith<IllegalArgumentException> {
            MoneyOperations.allocate(Cents(100), -1)
        }
    }

    @Test
    fun allocate_largeUnevenSplit_preservesTotal() {
        // $123,456.78 / 7 = 17636.68... → must sum to original
        val amount = Cents(12345678)
        val result = MoneyOperations.allocate(amount, 7)
        assertEquals(7, result.size)
        assertEquals(amount.amount, result.sumOf { it.amount })
    }

    @Test
    fun allocate_primeNumberParts_preservesTotal() {
        val amount = Cents(10000)
        val result = MoneyOperations.allocate(amount, 13)
        assertEquals(13, result.size)
        assertEquals(amount.amount, result.sumOf { it.amount })
    }

    // ═══════════════════════════════════════════════════════════════════
    // allocateByRatio() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allocateByRatio_negativeAmount_preservesTotal() {
        // -$100.00 split 50/30/20
        val result = MoneyOperations.allocateByRatio(Cents(-10000), listOf(50, 30, 20))
        assertEquals(-10000L, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_zeroAmount() {
        val result = MoneyOperations.allocateByRatio(Cents(0), listOf(50, 30, 20))
        assertEquals(3, result.size)
        assertTrue(result.all { it.isZero() })
        assertEquals(0L, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_unequalRatios_remainderDistribution() {
        // 1000 split by [1, 1, 1, 1, 1, 1, 1] = 7 equal parts
        // 1000 * 1/7 = 142 each → total 994 → remainder 6
        // Remainder distributed to first 6 (all same priority)
        val result = MoneyOperations.allocateByRatio(Cents(1000), listOf(1, 1, 1, 1, 1, 1, 1))
        assertEquals(1000L, result.sumOf { it.amount })
        assertEquals(7, result.size)
    }

    @Test
    fun allocateByRatio_highlySkewedRatios() {
        // 1000 split by [99, 1] → 99% and 1%
        // 1000 * 99/100 = 990, 1000 * 1/100 = 10 → total 1000
        val result = MoneyOperations.allocateByRatio(Cents(1000), listOf(99, 1))
        assertEquals(Cents(990), result[0])
        assertEquals(Cents(10), result[1])
        assertEquals(1000L, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_veryLargeRatios() {
        // Large ratios should still work — 10000 split by [1000, 500, 500]
        val result = MoneyOperations.allocateByRatio(Cents(10000), listOf(1000, 500, 500))
        assertEquals(Cents(5000), result[0])
        assertEquals(Cents(2500), result[1])
        assertEquals(Cents(2500), result[2])
        assertEquals(10000L, result.sumOf { it.amount })
    }

    @Test
    fun allocateByRatio_oneCentWithMultipleRatios() {
        // 1 cent split by [1, 1, 1] — only 1 cent to distribute
        val result = MoneyOperations.allocateByRatio(Cents(1), listOf(1, 1, 1))
        assertEquals(1L, result.sumOf { it.amount })
    }

    // ═══════════════════════════════════════════════════════════════════
    // sum() — additional edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun sum_allNegative() {
        val amounts = listOf(Cents(-100), Cents(-200), Cents(-300))
        assertEquals(Cents(-600), MoneyOperations.sum(amounts))
    }

    @Test
    fun sum_cancellingValues() {
        val amounts = listOf(Cents(500), Cents(-500))
        assertEquals(Cents(0), MoneyOperations.sum(amounts))
    }

    @Test
    fun sum_singleNegativeItem() {
        assertEquals(Cents(-42), MoneyOperations.sum(listOf(Cents(-42))))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Financial scenario: allocation never loses cents
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allocate_stressTest_manyPrimeParts() {
        // Split various amounts by various prime-numbered parts
        val testCases = listOf(
            Cents(1) to 2,
            Cents(1) to 3,
            Cents(100) to 7,
            Cents(9999) to 11,
            Cents(12345) to 17,
            Cents(99999) to 23,
        )
        for ((amount, parts) in testCases) {
            val result = MoneyOperations.allocate(amount, parts)
            assertEquals(
                amount.amount,
                result.sumOf { it.amount },
                "allocate($amount, $parts) lost cents",
            )
        }
    }

    @Test
    fun allocateByRatio_stressTest_variousRatios() {
        val testCases = listOf(
            Cents(10000) to listOf(1, 1, 1, 1, 1),
            Cents(9999) to listOf(3, 2, 1),
            Cents(1) to listOf(7, 3),
            Cents(12345) to listOf(40, 30, 20, 10),
        )
        for ((amount, ratios) in testCases) {
            val result = MoneyOperations.allocateByRatio(amount, ratios)
            assertEquals(
                amount.amount,
                result.sumOf { it.amount },
                "allocateByRatio($amount, $ratios) lost cents",
            )
        }
    }
}
