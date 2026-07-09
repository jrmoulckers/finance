// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * Tests for [CashflowTrendAnalyzer] month-over-month deltas (#3740).
 */
class CashflowTrendAnalyzerTest {

    private val reference = LocalDate(2024, 6, 15)

    @Test
    fun analyze_twoMonths_computesDeltasAndCumulative() {
        val transactions = listOf(
            // May: net = 100000 - 60000 = 40000
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(60000), date = LocalDate(2024, 5, 12)),
            // June: net = 120000 - 50000 = 70000
            TestFixtures.createIncome(amount = Cents(120000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10)),
        )

        val result = CashflowTrendAnalyzer.analyze(transactions, months = 2, referenceDate = reference)

        assertEquals(2, result.size)

        val may = result[0]
        assertEquals(Cents(40000), may.net)
        assertEquals(Cents(40000), may.momNetDelta, "First month's delta equals its own net")
        assertNull(may.momNetChangePercent, "First month has no percent change")
        assertEquals(Cents(40000), may.cumulativeNet)

        val june = result[1]
        assertEquals(Cents(70000), june.net)
        assertEquals(Cents(30000), june.momNetDelta) // 70000 - 40000
        assertEquals(75.0, june.momNetChangePercent!!, 1e-9) // 30000 / 40000 * 100
        assertEquals(Cents(110000), june.cumulativeNet) // 40000 + 70000
    }

    @Test
    fun analyze_priorNetZero_percentIsNull() {
        val transactions = listOf(
            // May: net = 50000 - 50000 = 0
            TestFixtures.createIncome(amount = Cents(50000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 5, 12)),
            // June: net = 70000
            TestFixtures.createIncome(amount = Cents(70000), date = LocalDate(2024, 6, 5)),
        )

        val result = CashflowTrendAnalyzer.analyze(transactions, months = 2, referenceDate = reference)

        assertEquals(Cents.ZERO, result[0].net)
        val june = result[1]
        assertEquals(Cents(70000), june.momNetDelta) // 70000 - 0
        assertNull(june.momNetChangePercent, "Percent is undefined when prior net is zero")
    }

    @Test
    fun analyze_singleMonth_hasNoPriorComparison() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(80000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 10)),
        )

        val result = CashflowTrendAnalyzer.analyze(transactions, months = 1, referenceDate = reference)

        assertEquals(1, result.size)
        val june = result[0]
        assertEquals(Cents(50000), june.net)
        assertEquals(Cents(50000), june.momNetDelta)
        assertNull(june.momNetChangePercent)
        assertEquals(Cents(50000), june.cumulativeNet)
    }

    @Test
    fun analyze_orderedOldestFirst() {
        val result = CashflowTrendAnalyzer.analyze(emptyList(), months = 3, referenceDate = reference)
        assertEquals(3, result.size)
        // Oldest first: April, May, June
        assertEquals(kotlinx.datetime.Month.APRIL, result[0].month)
        assertEquals(kotlinx.datetime.Month.MAY, result[1].month)
        assertEquals(kotlinx.datetime.Month.JUNE, result[2].month)
    }

    @Test
    fun analyze_invalidMonths_throws() {
        assertFailsWith<IllegalArgumentException> {
            CashflowTrendAnalyzer.analyze(emptyList(), months = 0, referenceDate = reference)
        }
    }
}
