// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import kotlin.test.*

/**
 * Comprehensive integer cents arithmetic edge case tests covering:
 * - Overflow protection on addition, subtraction, multiplication, negation
 * - Int32 boundary amounts ($21,474,836.47)
 * - Int64 extreme amounts
 * - Negative amounts (expenses, refunds, negative balances)
 * - Zero amounts (zero-cent transactions, zero balances)
 * - Currency conversion via multiply (exchange rate application)
 * - Split calculations (remainder handling)
 * - Percentage calculations (tax: 7.25% on $99.99)
 * - Budget rollover arithmetic
 * - Banker's rounding at boundaries
 *
 * Issues: #1366, #1372
 */
class CentsArithmeticEdgeCaseTest {

    private fun maxCents(a: Cents, b: Cents): Cents = if (a > b) a else b

    // ═══════════════════════════════════════════════════════════════════
    // Overflow protection — addition
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun addition_maxLongPlusOne_throws() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) + Cents(1)
        }
    }

    @Test
    fun addition_maxLongPlusMaxLong_throws() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) + Cents(Long.MAX_VALUE)
        }
    }

    @Test
    fun addition_minLongPlusNegativeOne_throws() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE) + Cents(-1)
        }
    }

    @Test
    fun addition_oppositeSignsNeverOverflow() {
        // MAX + MIN should not overflow: result is -1
        val result = Cents(Long.MAX_VALUE) + Cents(Long.MIN_VALUE)
        assertEquals(Cents(-1), result)
    }

    @Test
    fun addition_largePositiveValues_noOverflow() {
        // Half of Long.MAX_VALUE + half — should not overflow
        val half = Long.MAX_VALUE / 2
        val result = Cents(half) + Cents(half)
        assertEquals(Cents(half * 2), result)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Overflow protection — subtraction
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun subtraction_maxLongMinusNegativeOne_throws() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) - Cents(-1)
        }
    }

    @Test
    fun subtraction_minLongMinusOne_throws() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE) - Cents(1)
        }
    }

    @Test
    fun subtraction_sameSignNeverOverflows() {
        // MAX - MAX = 0
        val result = Cents(Long.MAX_VALUE) - Cents(Long.MAX_VALUE)
        assertEquals(Cents.ZERO, result)
    }

    @Test
    fun subtraction_minLongMinusMinLong_isZero() {
        val result = Cents(Long.MIN_VALUE) - Cents(Long.MIN_VALUE)
        assertEquals(Cents.ZERO, result)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Overflow protection — multiplication
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multiplication_maxLongTimesTwo_throws() {
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE) * 2
        }
    }

    @Test
    fun multiplication_largeAmountTimesLargeFactor_throws() {
        // A value that would overflow: (MAX/2 + 1) * 2
        assertFailsWith<ArithmeticException> {
            Cents(Long.MAX_VALUE / 2 + 1) * 2
        }
    }

    @Test
    fun multiplication_maxLongTimesOne_noOverflow() {
        val result = Cents(Long.MAX_VALUE) * 1
        assertEquals(Cents(Long.MAX_VALUE), result)
    }

    @Test
    fun multiplication_anyAmountTimesZero_isZero() {
        assertEquals(Cents.ZERO, Cents(Long.MAX_VALUE) * 0)
        assertEquals(Cents.ZERO, Cents(Long.MIN_VALUE + 1) * 0)
    }

    @Test
    fun multiplication_negativeTimesNegative_positive() {
        assertEquals(Cents(600), Cents(-200) * -3)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Overflow protection — negation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun negation_minLong_throws() {
        // Long.MIN_VALUE has no positive counterpart in Long
        assertFailsWith<ArithmeticException> {
            -Cents(Long.MIN_VALUE)
        }
    }

    @Test
    fun negation_maxLong_succeeds() {
        val result = -Cents(Long.MAX_VALUE)
        assertEquals(Cents(-Long.MAX_VALUE), result)
    }

    @Test
    fun negation_zero_isZero() {
        assertEquals(Cents.ZERO, -Cents.ZERO)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Overflow protection — abs
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun abs_minLong_throws() {
        // abs(Long.MIN_VALUE) overflows because it calls unaryMinus
        assertFailsWith<ArithmeticException> {
            Cents(Long.MIN_VALUE).abs()
        }
    }

    @Test
    fun abs_negativeMaxLong_succeeds() {
        assertEquals(Cents(Long.MAX_VALUE), Cents(-Long.MAX_VALUE).abs())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Int32 boundary amounts — $21,474,836.47
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun int32Max_storesCorrectly() {
        val maxInt32Cents = Cents(Int.MAX_VALUE.toLong()) // 2,147,483,647 cents = $21,474,836.47
        assertEquals(2_147_483_647L, maxInt32Cents.amount)
    }

    @Test
    fun int32Max_addition_exceedsInt32ButFitsLong() {
        val maxInt32 = Cents(Int.MAX_VALUE.toLong())
        val result = maxInt32 + Cents(1)
        assertEquals(Cents(2_147_483_648L), result) // Exceeds Int32 but fits in Long
    }

    @Test
    fun int32Max_multiplication_exceedsInt32ButFitsLong() {
        val maxInt32 = Cents(Int.MAX_VALUE.toLong())
        val result = maxInt32 * 2
        assertEquals(Cents(4_294_967_294L), result) // ~$42.9M
    }

    @Test
    fun int32Max_canDoArithmeticBeyondInt32Range() {
        // $100,000,000.00 = 10,000,000,000 cents — beyond Int32 range
        val hundredMillion = Cents(10_000_000_000L)
        val result = hundredMillion + Cents(1)
        assertEquals(Cents(10_000_000_001L), result)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Int64 extreme amounts — Long.MAX_VALUE
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun int64Max_representsHugeAmount() {
        // Long.MAX_VALUE = 9,223,372,036,854,775,807 cents ≈ $92.2 quadrillion
        val max = Cents(Long.MAX_VALUE)
        assertTrue(max.isPositive())
        assertEquals(Long.MAX_VALUE, max.amount)
    }

    @Test
    fun int64_largeRealisticAmount() {
        // $1 trillion = 100,000,000,000,000 cents — fits in Long
        val trillionDollars = Cents(100_000_000_000_000L)
        assertTrue(trillionDollars.isPositive())
        assertEquals(100_000_000_000_000L, trillionDollars.amount)
    }

    @Test
    fun int64_largeAmountSubtraction() {
        val a = Cents(100_000_000_000_000L) // $1T
        val b = Cents(99_999_999_999_999L)  // $1T minus 1 cent
        assertEquals(Cents(1), a - b)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Negative amounts — expenses, refunds, negative balances
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun negative_expense_representation() {
        val expense = Cents(-4999L) // -$49.99
        assertTrue(expense.isNegative())
        assertFalse(expense.isZero())
        assertEquals(Cents(4999), expense.abs())
    }

    @Test
    fun negative_refund_appliedToBalance() {
        val balance = Cents(10000L)  // $100.00
        val expense = Cents(-2500L)  // -$25.00 expense
        val refund = Cents(2500L)    // $25.00 refund
        val result = balance + expense + refund
        assertEquals(Cents(10000), result) // Back to $100
    }

    @Test
    fun negative_balance_goesNegative() {
        val balance = Cents(500L)    // $5.00
        val expense = Cents(-1000L)  // -$10.00
        val result = balance + expense
        assertEquals(Cents(-500), result) // -$5.00 overdraft
        assertTrue(result.isNegative())
    }

    @Test
    fun negative_multiply_negativeRate() {
        // Loss of -$100.00 at 150% = -$150.00
        val loss = Cents(-10000)
        val result = MoneyOperations.multiply(loss, 1.5)
        assertEquals(Cents(-15000), result)
    }

    @Test
    fun negative_divide() {
        // -$10.00 split among 3 people
        val debt = Cents(-1000)
        val perPerson = MoneyOperations.divide(debt, 3)
        assertEquals(Cents(-333), perPerson)
    }

    @Test
    fun negative_allocate_preservesTotal() {
        // -$10.00 split among 3 people, remainder handled
        val debt = Cents(-1000)
        val parts = MoneyOperations.allocate(debt, 3)
        assertEquals(-1000L, parts.sumOf { it.amount })
        assertEquals(3, parts.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Zero amounts — zero-cent transactions, zero balances
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun zero_isNeither_positiveNorNegative() {
        val zero = Cents.ZERO
        assertTrue(zero.isZero())
        assertFalse(zero.isPositive())
        assertFalse(zero.isNegative())
    }

    @Test
    fun zero_addedToAnything_isIdentity() {
        assertEquals(Cents(12345), Cents(12345) + Cents.ZERO)
        assertEquals(Cents(-999), Cents(-999) + Cents.ZERO)
    }

    @Test
    fun zero_subtracted_isIdentity() {
        assertEquals(Cents(12345), Cents(12345) - Cents.ZERO)
    }

    @Test
    fun zero_multiplied_isZero() {
        assertEquals(Cents.ZERO, MoneyOperations.multiply(Cents.ZERO, 999.99))
        assertEquals(Cents.ZERO, Cents.ZERO * 999)
    }

    @Test
    fun zero_divided_isZero() {
        assertEquals(Cents.ZERO, MoneyOperations.divide(Cents.ZERO, 7))
    }

    @Test
    fun zero_percentage_isZero() {
        assertEquals(Cents.ZERO, MoneyOperations.percentage(Cents.ZERO, 99.9))
    }

    @Test
    fun zero_allocated_allZero() {
        val parts = MoneyOperations.allocate(Cents.ZERO, 5)
        assertTrue(parts.all { it.isZero() })
        assertEquals(5, parts.size)
    }

    @Test
    fun zero_sum_emptyList() {
        assertEquals(Cents.ZERO, MoneyOperations.sum(emptyList()))
    }

    @Test
    fun zero_comparison() {
        assertTrue(Cents.ZERO.compareTo(Cents(1)) < 0)
        assertTrue(Cents.ZERO.compareTo(Cents(-1)) > 0)
        assertTrue(Cents.ZERO.compareTo(Cents.ZERO) == 0)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Large amounts — MoneyOperations with big values
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multiply_largeAmount_bySmallFactor() {
        // $1,000,000,000.00 = 100_000_000_000 cents * 1.005 (exchange rate)
        val result = MoneyOperations.multiply(Cents(100_000_000_000L), 1.005)
        assertEquals(Cents(100_500_000_000L), result)
    }

    @Test
    fun multiply_largeAmount_preservesPrecision() {
        // $999,999,999.99 * 1.0 should be exactly the same
        val amount = Cents(99_999_999_999L)
        assertEquals(amount, MoneyOperations.multiply(amount, 1.0))
    }

    @Test
    fun sum_manyLargeValues_noOverflow() {
        // 1000 transactions of $1,000,000.00 = $1 billion
        val amounts = List(1000) { Cents(100_000_000L) }
        val result = MoneyOperations.sum(amounts)
        assertEquals(Cents(100_000_000_000L), result)
    }

    @Test
    fun allocate_largeAmount_preservesTotal() {
        // $1,000,000.00 split among 7 people
        val amount = Cents(100_000_000L)
        val parts = MoneyOperations.allocate(amount, 7)
        assertEquals(amount.amount, parts.sumOf { it.amount })
        assertEquals(7, parts.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Currency conversion — multiply by exchange rate
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun currencyConversion_usdToEur() {
        // $100.00 at 0.92 EUR/USD = €92.00
        val usd = Cents(10000)
        val eur = MoneyOperations.multiply(usd, 0.92)
        assertEquals(Cents(9200), eur)
    }

    @Test
    fun currencyConversion_usdToJpy_largeRate() {
        // $100.00 at 149.50 JPY/USD = ¥1,495,000 (in yen minor units)
        val usd = Cents(10000)
        val jpy = MoneyOperations.multiply(usd, 149.50)
        assertEquals(Cents(1_495_000), jpy)
    }

    @Test
    fun currencyConversion_jpyToUsd_smallRate() {
        // ¥10,000 at 0.0067 USD/JPY = $67.00 in cents = 67
        val jpy = Cents(10000)
        val usd = MoneyOperations.multiply(jpy, 0.0067)
        assertEquals(Cents(67), usd)
    }

    @Test
    fun currencyConversion_oneCent_roundingMatter() {
        // 1 cent * 0.92 = 0.92 → rounds to 1 (above half)
        assertEquals(Cents(1), MoneyOperations.multiply(Cents(1), 0.92))
        // 1 cent * 0.49 = 0.49 → rounds to 0 (below half)
        assertEquals(Cents(0), MoneyOperations.multiply(Cents(1), 0.49))
        // 1 cent * 0.5 = 0.5 → banker's round, floor=0 (even) → 0
        assertEquals(Cents(0), MoneyOperations.multiply(Cents(1), 0.5))
    }

    @Test
    fun currencyConversion_roundTrip_acceptableError() {
        // USD → EUR → USD should be close but may not be exact due to rounding
        val original = Cents(10000) // $100.00
        val rate = 0.92
        val inverseRate = 1.0 / rate

        val inEur = MoneyOperations.multiply(original, rate) // 9200
        val backToUsd = MoneyOperations.multiply(inEur, inverseRate) // 9200 * 1.0869565... = 9999.99...

        // Accept ±1 cent difference due to rounding
        val diff = kotlin.math.abs(original.amount - backToUsd.amount)
        assertTrue(diff <= 1, "Round-trip conversion should be within 1 cent, got diff=$diff")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Split calculations — $10.00 among 3 people
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun split_tenDollarsAmongThree() {
        // $10.00 = 1000 cents / 3 = 333 remainder 1
        // First person gets 334, others get 333
        val parts = MoneyOperations.allocate(Cents(1000), 3)
        assertEquals(listOf(Cents(334), Cents(333), Cents(333)), parts)
        assertEquals(1000L, parts.sumOf { it.amount })
    }

    @Test
    fun split_oneCentAmongThree() {
        // 1 / 3 = 0 remainder 1 → first person gets 1 cent
        val parts = MoneyOperations.allocate(Cents(1), 3)
        assertEquals(listOf(Cents(1), Cents(0), Cents(0)), parts)
        assertEquals(1L, parts.sumOf { it.amount })
    }

    @Test
    fun split_ninetyNineCentsAmongSeven() {
        // 99 / 7 = 14 remainder 1 → first person gets 15
        val parts = MoneyOperations.allocate(Cents(99), 7)
        assertEquals(99L, parts.sumOf { it.amount })
        assertEquals(Cents(15), parts[0])
        assertTrue(parts.drop(1).all { it.amount == 14L })
    }

    @Test
    fun split_exactDivision() {
        // $12.00 / 4 = $3.00 each, no remainder
        val parts = MoneyOperations.allocate(Cents(1200), 4)
        assertEquals(listOf(Cents(300), Cents(300), Cents(300), Cents(300)), parts)
    }

    @Test
    fun split_dinnerBill_realWorld() {
        // $87.53 among 4 people: 8753 / 4 = 2188 remainder 1
        val parts = MoneyOperations.allocate(Cents(8753), 4)
        assertEquals(8753L, parts.sumOf { it.amount })
        assertEquals(Cents(2189), parts[0])
        assertTrue(parts.drop(1).all { it.amount == 2188L })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Percentage calculations — tax
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun tax_7_25_percent_on_99_99() {
        // $99.99 at 7.25% = 9999 * 0.0725 = 724.9275
        // Banker's round: 724.9275 → fraction 0.9275 > 0.5 → 725
        val tax = MoneyOperations.percentage(Cents(9999), 7.25)
        assertEquals(Cents(725), tax)
    }

    @Test
    fun tax_8_875_percent_on_49_99() {
        // $49.99 at 8.875% = 4999 * 0.08875 = 443.66125
        // Banker's round: 443.66125 → fraction 0.66125 > 0.5 → 444
        val tax = MoneyOperations.percentage(Cents(4999), 8.875)
        assertEquals(Cents(444), tax)
    }

    @Test
    fun tax_zeroPercent() {
        assertEquals(Cents.ZERO, MoneyOperations.percentage(Cents(9999), 0.0))
    }

    @Test
    fun tax_100_percent() {
        assertEquals(Cents(9999), MoneyOperations.percentage(Cents(9999), 100.0))
    }

    @Test
    fun tax_addedToSubtotal() {
        // $99.99 + 7.25% tax = $99.99 + $7.25 = $107.24
        val subtotal = Cents(9999)
        val tax = MoneyOperations.percentage(subtotal, 7.25)
        val total = subtotal + tax
        assertEquals(Cents(10724), total)
    }

    @Test
    fun discount_15_percent() {
        // $200.00 - 15% discount = 20000 - 3000 = 17000
        val price = Cents(20000)
        val discount = MoneyOperations.percentage(price, 15.0)
        assertEquals(Cents(3000), discount)
        assertEquals(Cents(17000), price - discount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Budget rollover arithmetic
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun budgetRollover_unusedBudget_carriedForward() {
        val baseBudget = Cents(50000)  // $500.00
        val spent = Cents(35000)       // $350.00
        val unused = baseBudget - spent // $150.00
        val nextPeriodBudget = baseBudget + maxCents(unused, Cents.ZERO)
        assertEquals(Cents(65000), nextPeriodBudget) // $650.00
    }

    @Test
    fun budgetRollover_overBudget_noNegativeCarry() {
        val baseBudget = Cents(50000)  // $500.00
        val spent = Cents(60000)       // $600.00 (over budget)
        val unused = baseBudget - spent // -$100.00
        val nextPeriodBudget = baseBudget + maxCents(unused, Cents.ZERO)
        assertEquals(Cents(50000), nextPeriodBudget) // Still $500.00, no negative carry
    }

    @Test
    fun budgetRollover_exactBudget_noChange() {
        val baseBudget = Cents(50000)
        val spent = Cents(50000) // Exactly at budget
        val unused = baseBudget - spent
        val nextPeriodBudget = baseBudget + maxCents(unused, Cents.ZERO)
        assertEquals(Cents(50000), nextPeriodBudget)
    }

    @Test
    fun budgetRollover_noSpending_doublesBudget() {
        val baseBudget = Cents(50000)
        val spent = Cents.ZERO
        val unused = baseBudget - spent
        val nextPeriodBudget = baseBudget + maxCents(unused, Cents.ZERO)
        assertEquals(Cents(100000), nextPeriodBudget) // $1000 = double
    }

    @Test
    fun budgetRollover_oneCentUnused() {
        val baseBudget = Cents(50000)
        val spent = Cents(49999)
        val unused = baseBudget - spent
        val nextPeriodBudget = baseBudget + maxCents(unused, Cents.ZERO)
        assertEquals(Cents(50001), nextPeriodBudget)
    }

    @Test
    fun budgetRollover_multiplePeriodsAccumulate() {
        val baseBudget = Cents(50000)
        var accumulated = baseBudget

        // Period 1: spend $400
        val unused1 = accumulated - Cents(40000) // $100 unused
        accumulated = baseBudget + maxCents(unused1, Cents.ZERO) // $600

        // Period 2: spend $300
        val unused2 = accumulated - Cents(30000) // $300 unused
        accumulated = baseBudget + maxCents(unused2, Cents.ZERO) // $800

        assertEquals(Cents(80000), accumulated)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Banker's rounding — additional boundary cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun bankersRound_sequence_0_5_to_5_5() {
        // 0.5 → 0 (even), 1.5 → 2 (even), 2.5 → 2 (even),
        // 3.5 → 4 (even), 4.5 → 4 (even), 5.5 → 6 (even)
        assertEquals(0L, MoneyOperations.bankersRound(0.5))
        assertEquals(2L, MoneyOperations.bankersRound(1.5))
        assertEquals(2L, MoneyOperations.bankersRound(2.5))
        assertEquals(4L, MoneyOperations.bankersRound(3.5))
        assertEquals(4L, MoneyOperations.bankersRound(4.5))
        assertEquals(6L, MoneyOperations.bankersRound(5.5))
    }

    @Test
    fun bankersRound_eliminatesBias() {
        // Over many .5 values, banker's rounding should produce roughly equal
        // numbers of round-ups and round-downs
        var ups = 0
        var downs = 0
        for (i in 0..99) {
            val value = i + 0.5
            val rounded = MoneyOperations.bankersRound(value)
            if (rounded > i) ups++ else downs++
        }
        // With perfect banker's rounding, ups == downs == 50
        assertEquals(50, ups, "Half of values should round up")
        assertEquals(50, downs, "Half of values should round down")
    }

    @Test
    fun bankersRound_veryCloseToHalf_above() {
        // 10.5000000001 — just above 0.5, rounds up
        assertEquals(11L, MoneyOperations.bankersRound(10.5000000001))
    }

    @Test
    fun bankersRound_veryCloseToHalf_below() {
        // 10.4999999999 — just below 0.5, rounds down
        assertEquals(10L, MoneyOperations.bankersRound(10.4999999999))
    }

    // ═══════════════════════════════════════════════════════════════════
    // fromDollars — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun fromDollars_wholeNumber() {
        assertEquals(Cents(10000), Cents.fromDollars(100.0))
    }

    @Test
    fun fromDollars_negative() {
        assertEquals(Cents(-500), Cents.fromDollars(-5.0))
    }

    @Test
    fun fromDollars_zero() {
        assertEquals(Cents.ZERO, Cents.fromDollars(0.0))
    }

    @Test
    fun fromDollars_halfCent() {
        // $12.50 → 1250 cents
        assertEquals(Cents(1250), Cents.fromDollars(12.5))
    }

    @Test
    fun fromDollars_commonAmount_19_99() {
        // $19.99 → should be 1999 cents
        // This tests floating-point precision: 19.99 * 100 = 1998.9999... in IEEE 754
        assertEquals(Cents(1999), Cents.fromDollars(19.99))
    }

    @Test
    fun fromDollars_commonAmount_9_99() {
        assertEquals(Cents(999), Cents.fromDollars(9.99))
    }

    @Test
    fun fromDollars_commonAmount_0_01() {
        assertEquals(Cents(1), Cents.fromDollars(0.01))
    }

    @Test
    fun fromDollars_commonAmount_0_10() {
        assertEquals(Cents(10), Cents.fromDollars(0.10))
    }

    @Test
    fun fromDollars_largeAmount() {
        // $1,000,000.00
        assertEquals(Cents(100_000_000), Cents.fromDollars(1_000_000.0))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Real-world financial scenarios
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun scenario_paycheck_withholding() {
        // Gross: $3,250.00
        // Federal tax: 22% = $715.00
        // State tax: 5.5% = $178.75
        // Social Security: 6.2% = $201.50
        // Medicare: 1.45% = $47.13 (4712.5 → banker's round → 4712? Let's check)
        val gross = Cents(325000)
        val federal = MoneyOperations.percentage(gross, 22.0) // 71500
        val state = MoneyOperations.percentage(gross, 5.5)    // 17875
        val ss = MoneyOperations.percentage(gross, 6.2)       // 20150
        val medicare = MoneyOperations.percentage(gross, 1.45) // 4712.5 → floor=4712 (even) → 4712

        assertEquals(Cents(71500), federal)
        assertEquals(Cents(17875), state)
        assertEquals(Cents(20150), ss)
        assertEquals(Cents(4712), medicare) // Banker's round: 4712.5 → 4712 (even)

        val net = gross - federal - state - ss - medicare
        assertEquals(Cents(210763), net)
    }

    @Test
    fun scenario_splitDinnerWithTip() {
        // Subtotal: $127.43
        // Tax: 8.5% = $10.83 (10831.55 → 10832 → hmm let me compute)
        // Actually: 12743 * 0.085 = 1083.155
        // bankersRound(1083.155): floor=1083, fraction=0.155 < 0.5 → 1083
        val subtotal = Cents(12743)
        val tax = MoneyOperations.percentage(subtotal, 8.5) // 1083.155 → 1083
        assertEquals(Cents(1083), tax)

        val afterTax = subtotal + tax // 13826
        val tip = MoneyOperations.percentage(afterTax, 20.0) // 2765.2 → 2765
        assertEquals(Cents(2765), tip)

        val total = afterTax + tip // 16591
        assertEquals(Cents(16591), total)

        // Split among 4 people: 16591 / 4 = 4147 remainder 3
        val parts = MoneyOperations.allocate(total, 4)
        assertEquals(total.amount, parts.sumOf { it.amount })
        assertEquals(Cents(4148), parts[0])
        assertEquals(Cents(4148), parts[1])
        assertEquals(Cents(4148), parts[2])
        assertEquals(Cents(4147), parts[3])
    }

    @Test
    fun scenario_monthlyBudget_50_30_20() {
        // Income: $5,000.00 = 500000 cents
        // 50% needs, 30% wants, 20% savings
        val income = Cents(500000)
        val allocation = MoneyOperations.allocateByRatio(income, listOf(50, 30, 20))

        assertEquals(Cents(250000), allocation[0]) // $2500 needs
        assertEquals(Cents(150000), allocation[1]) // $1500 wants
        assertEquals(Cents(100000), allocation[2]) // $1000 savings
        assertEquals(income.amount, allocation.sumOf { it.amount })
    }

    @Test
    fun scenario_internationalTransfer() {
        // Send $1,000.00 USD at 0.92 EUR/USD, then convert back
        val usdAmount = Cents(100000)
        val eurAmount = MoneyOperations.multiply(usdAmount, 0.92) // 92000

        // Receiving side converts back at slightly different rate
        val backToUsd = MoneyOperations.multiply(eurAmount, 1.087) // 92000 * 1.087 = 100004
        assertEquals(Cents(100004), backToUsd) // Slight gain due to rate spread
    }
}
