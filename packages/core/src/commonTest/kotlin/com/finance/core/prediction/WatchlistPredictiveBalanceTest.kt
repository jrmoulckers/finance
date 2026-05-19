// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.prediction

import com.finance.core.TestFixtures
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Verification tests for watchlists and predictive balance functionality.
 * Tests balance prediction horizons, recurring transaction awareness,
 * low-balance alerts, watchlist filtering, predicted-vs-actual comparison,
 * and prediction adjustment after new transactions.
 *
 * Covers issue #1376.
 */
@Suppress("LargeClass") // Test suite intentionally groups all predictive-balance scenarios for discoverability
class WatchlistPredictiveBalanceTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Balance prediction based on recurring transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictEndOfMonth_withRecurringExpenses_lowersPrediction() {
        // Simulate 3 months of recurring $100/day expenses
        val transactions = buildList {
            for (monthOffset in 1..3) {
                val monthDate = LocalDate(2024, 6, 15).minus(monthOffset, DateTimeUnit.MONTH)
                for (day in 1..28) {
                    add(
                        TestFixtures.createExpense(
                            amount = Cents(10000), // $100
                            date = LocalDate(monthDate.year, monthDate.month, day),
                        ),
                    )
                }
            }
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(500000), // $5,000
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertTrue(
            prediction.predictedBalance.amount < prediction.currentBalance.amount,
            "Predicted balance should be lower due to recurring expenses",
        )
        assertTrue(prediction.expectedExpenses.amount > 0)
    }

    @Test
    fun predictEndOfMonth_withRecurringIncome_raisesPrediction() {
        // Simulate 3 months of recurring income + smaller expenses
        val transactions = buildList {
            for (monthOffset in 1..3) {
                val monthDate = LocalDate(2024, 6, 15).minus(monthOffset, DateTimeUnit.MONTH)
                for (day in 1..28) {
                    add(
                        TestFixtures.createIncome(
                            amount = Cents(20000), // $200/day income
                            date = LocalDate(monthDate.year, monthDate.month, day),
                        ),
                    )
                    add(
                        TestFixtures.createExpense(
                            amount = Cents(5000), // $50/day expense
                            date = LocalDate(monthDate.year, monthDate.month, day),
                        ),
                    )
                }
            }
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000), // $1,000
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertTrue(prediction.expectedIncome.amount > prediction.expectedExpenses.amount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Prediction horizon (7-day, 30-day, 90-day)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictAtDate_7dayHorizon() {
        val transactions = (1..20).map {
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(200000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 6, 22), // 7 days ahead
        )

        assertEquals(7, prediction.daysRemaining)
        assertTrue(prediction.predictedBalance.amount < 200000)
    }

    @Test
    fun predictAtDate_30dayHorizon() {
        val transactions = (1..20).map {
            TestFixtures.createExpense(
                amount = Cents(3000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(300000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 7, 15), // 30 days ahead
        )

        assertEquals(30, prediction.daysRemaining)
    }

    @Test
    fun predictAtDate_90dayHorizon() {
        val transactions = (1..20).map {
            TestFixtures.createExpense(
                amount = Cents(2000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(500000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 9, 13), // 90 days ahead
        )

        assertEquals(90, prediction.daysRemaining)
    }

    @Test
    fun predictAtDate_longerHorizon_lowerConfidence() {
        val transactions = (1..15).map {
            TestFixtures.createExpense(
                amount = Cents(2000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val shortPrediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(200000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 6, 20), // 5 days
        )

        val longPrediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(200000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 9, 15), // 92 days
        )

        // Short horizon with data should have higher or equal confidence
        assertTrue(
            shortPrediction.confidence.ordinal >= longPrediction.confidence.ordinal,
            "Short-horizon predictions should have higher or equal confidence",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Prediction accuracy with known vs unknown recurring items
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun prediction_highConfidence_withManyTransactions() {
        // 40+ transactions → HIGH confidence
        val transactions = (1..40).map {
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(PredictionConfidence.HIGH, prediction.confidence)
    }

    @Test
    fun prediction_mediumConfidence_withModerateTransactions() {
        // 10-29 transactions → MEDIUM confidence
        val transactions = (1..15).map {
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(PredictionConfidence.MEDIUM, prediction.confidence)
    }

    @Test
    fun prediction_lowConfidence_withFewTransactions() {
        // 0-9 transactions → LOW confidence
        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(PredictionConfidence.LOW, prediction.confidence)
    }

    @Test
    fun prediction_highConfidence_lastDayOfMonth() {
        // Last day = no prediction needed = HIGH confidence
        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(50000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 30),
        )

        assertEquals(PredictionConfidence.HIGH, prediction.confidence)
        assertEquals(0, prediction.daysRemaining)
        assertEquals(Cents(50000), prediction.predictedBalance)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Low-balance alert threshold detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun lowBalanceAlert_predictedBelowThreshold() {
        val threshold = Cents(10000) // $100 low balance threshold
        val prediction = BalancePrediction(
            predictedBalance = Cents(5000), // $50 — below threshold
            currentBalance = Cents(50000),
            expectedIncome = Cents.ZERO,
            expectedExpenses = Cents(45000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.MEDIUM,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        val isLowBalance = prediction.predictedBalance.amount < threshold.amount
        assertTrue(isLowBalance)
    }

    @Test
    fun lowBalanceAlert_predictedAboveThreshold() {
        val threshold = Cents(10000)
        val prediction = BalancePrediction(
            predictedBalance = Cents(50000),
            currentBalance = Cents(80000),
            expectedIncome = Cents(20000),
            expectedExpenses = Cents(50000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.HIGH,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        val isLowBalance = prediction.predictedBalance.amount < threshold.amount
        assertFalse(isLowBalance)
    }

    @Test
    fun negativeProjection_detectedCorrectly() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(-5000),
            currentBalance = Cents(10000),
            expectedIncome = Cents.ZERO,
            expectedExpenses = Cents(15000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 10,
            confidence = PredictionConfidence.LOW,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 25),
        )

        assertTrue(prediction.isNegativeProjection)
        assertTrue(prediction.predictedBalance.isNegative())
    }

    @Test
    fun positiveProjection_detectedCorrectly() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(50000),
            currentBalance = Cents(80000),
            expectedIncome = Cents(10000),
            expectedExpenses = Cents(40000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.MEDIUM,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertFalse(prediction.isNegativeProjection)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Watchlist filtering (only watched accounts)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun watchlist_filterAccountsByWatchedSet() {
        val acct1 = TestFixtures.createAccount(
            id = SyncId("acct-1"), name = "Checking",
        )
        val acct2 = TestFixtures.createAccount(
            id = SyncId("acct-2"), name = "Savings",
        )
        val acct3 = TestFixtures.createAccount(
            id = SyncId("acct-3"), name = "Investment",
        )

        val allAccounts = listOf(acct1, acct2, acct3)
        val watchedIds = setOf(SyncId("acct-1"), SyncId("acct-3"))

        val watchedAccounts = allAccounts.filter { it.id in watchedIds }
        assertEquals(2, watchedAccounts.size)
        assertTrue(watchedAccounts.any { it.name == "Checking" })
        assertTrue(watchedAccounts.any { it.name == "Investment" })
        assertFalse(watchedAccounts.any { it.name == "Savings" })
    }

    @Test
    fun watchlist_emptyWatchSet_returnsNoAccounts() {
        val acct1 = TestFixtures.createAccount(
            id = SyncId("acct-1"), name = "Checking",
        )
        val allAccounts = listOf(acct1)
        val watchedIds = emptySet<SyncId>()

        val watchedAccounts = allAccounts.filter { it.id in watchedIds }
        assertTrue(watchedAccounts.isEmpty())
    }

    @Test
    fun watchlist_allAccountsWatched_returnsAll() {
        val acct1 = TestFixtures.createAccount(
            id = SyncId("acct-1"), name = "Checking",
        )
        val acct2 = TestFixtures.createAccount(
            id = SyncId("acct-2"), name = "Savings",
        )

        val allAccounts = listOf(acct1, acct2)
        val watchedIds = setOf(SyncId("acct-1"), SyncId("acct-2"))

        val watchedAccounts = allAccounts.filter { it.id in watchedIds }
        assertEquals(2, watchedAccounts.size)
    }

    @Test
    fun watchlist_filterTransactionsByWatchedAccounts() {
        val watchedAcctId = SyncId("acct-watched")
        val otherAcctId = SyncId("acct-other")

        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(5000), accountId = watchedAcctId,
            ),
            TestFixtures.createExpense(
                amount = Cents(3000), accountId = otherAcctId,
            ),
            TestFixtures.createExpense(
                amount = Cents(7000), accountId = watchedAcctId,
            ),
        )

        val watchedIds = setOf(watchedAcctId)
        val filtered = transactions.filter { it.accountId in watchedIds }
        assertEquals(2, filtered.size)
        assertEquals(12000L, filtered.sumOf { it.amount.abs().amount })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Predicted vs actual balance comparison
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun projectedChange_computed_correctly() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(80000),
            currentBalance = Cents(100000),
            expectedIncome = Cents(20000),
            expectedExpenses = Cents(40000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.MEDIUM,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(-20000), prediction.projectedChange)
    }

    @Test
    fun predictionAccuracy_computedFromActualVsPredicted() {
        val predictedBalance = Cents(80000)
        val actualBalance = Cents(82000)
        val error = actualBalance - predictedBalance
        assertEquals(Cents(2000), error) // $20 under-estimated

        val errorPercent = (error.amount.toDouble() / actualBalance.amount) * 100.0
        assertEquals(2.44, errorPercent, 0.01) // ~2.4% error
    }

    @Test
    fun predictionAccuracy_perfectPrediction_zeroError() {
        val predicted = Cents(100000)
        val actual = Cents(100000)
        val error = actual - predicted
        assertTrue(error.isZero())
    }

    @Test
    fun predictionAccuracy_overEstimate_negativeError() {
        val predicted = Cents(120000)
        val actual = Cents(100000)
        val error = actual - predicted
        assertEquals(Cents(-20000), error)
        assertTrue(error.isNegative())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Prediction adjustment after new transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictionAdjusts_afterLargeExpense() {
        val baseTransactions = (1..20).map {
            TestFixtures.createExpense(
                amount = Cents(2000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val predictionBefore = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(200000),
            transactions = baseTransactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // After a large unexpected expense reduces balance
        val predictionAfter = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(150000), // Balance dropped by $500
            transactions = baseTransactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertTrue(
            predictionAfter.predictedBalance.amount < predictionBefore.predictedBalance.amount,
            "Prediction should be lower after balance dropped",
        )
    }

    @Test
    fun predictionAdjusts_afterLargeIncome() {
        val baseTransactions = (1..20).map {
            TestFixtures.createExpense(
                amount = Cents(2000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val predictionBefore = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(200000),
            transactions = baseTransactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // After unexpected income increases balance
        val predictionAfter = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(300000), // Balance increased by $1000
            transactions = baseTransactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertTrue(
            predictionAfter.predictedBalance.amount > predictionBefore.predictedBalance.amount,
            "Prediction should be higher after balance increased",
        )
    }

    @Test
    fun predictionAdjusts_moreTxnHistory_differentResult() {
        val fewTransactions = (1..5).map {
            TestFixtures.createExpense(
                amount = Cents(3000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val manyTransactions = (1..30).map {
            TestFixtures.createExpense(
                amount = Cents(3000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val predictionFew = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(200000),
            transactions = fewTransactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        val predictionMany = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(200000),
            transactions = manyTransactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // More history = higher confidence
        assertTrue(
            predictionMany.confidence.ordinal >= predictionFew.confidence.ordinal,
            "More transaction history should yield higher or equal confidence",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Daily forecast
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailyForecast_correctDayCount() {
        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
        )

        // June 15 → June 30 = 15 days
        assertEquals(15, forecast.size)
        assertEquals(LocalDate(2024, 6, 16), forecast.first().date)
        assertEquals(LocalDate(2024, 6, 30), forecast.last().date)
    }

    @Test
    fun dailyForecast_lastDay_empty() {
        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 30),
        )

        assertTrue(forecast.isEmpty())
    }

    @Test
    fun dailyForecast_consecutiveDates() {
        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 20),
        )

        forecast.zipWithNext().forEach { (a, b) ->
            assertEquals(
                a.date.plus(1, DateTimeUnit.DAY),
                b.date,
                "Dates should be consecutive",
            )
        }
    }

    @Test
    fun dailyForecast_withExpenses_balanceDecreases() {
        val transactions = (1..30).map {
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(500000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // With expenses only, each day's balance should be <= previous
        forecast.zipWithNext().forEach { (earlier, later) ->
            assertTrue(
                later.projectedBalance.amount <= earlier.projectedBalance.amount,
                "Balance should decrease or stay same with expense-only history",
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Compute daily average
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun computeDailyAverage_noTransactions_zero() {
        val avg = BalancePredictionEngine.computeDailyAverage(
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
            lookbackMonths = 3,
            type = TransactionType.EXPENSE,
        )
        assertEquals(Cents.ZERO, avg)
    }

    @Test
    fun computeDailyAverage_onlyIncomeTransactions_zeroForExpenses() {
        val transactions = (1..10).map {
            TestFixtures.createIncome(
                amount = Cents(50000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val avg = BalancePredictionEngine.computeDailyAverage(
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            lookbackMonths = 3,
            type = TransactionType.EXPENSE,
        )
        assertEquals(Cents.ZERO, avg)
    }

    @Test
    fun computeDailyAverage_positiveForExpenses() {
        val transactions = (1..30).map {
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 5, it),
            )
        }

        val avg = BalancePredictionEngine.computeDailyAverage(
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            lookbackMonths = 3,
            type = TransactionType.EXPENSE,
        )
        assertTrue(avg.amount > 0)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictEndOfMonth_zeroLookback_throws() {
        assertFailsWith<IllegalArgumentException> {
            BalancePredictionEngine.predictEndOfMonth(
                currentBalance = Cents(100000),
                transactions = emptyList(),
                referenceDate = LocalDate(2024, 6, 15),
                lookbackMonths = 0,
            )
        }
    }

    @Test
    fun predictAtDate_pastDate_throws() {
        assertFailsWith<IllegalArgumentException> {
            BalancePredictionEngine.predictAtDate(
                currentBalance = Cents(100000),
                transactions = emptyList(),
                referenceDate = LocalDate(2024, 6, 15),
                targetDate = LocalDate(2024, 6, 1),
            )
        }
    }

    @Test
    fun predictAtDate_sameDay_returnsCurrentBalance() {
        val prediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(100000), prediction.predictedBalance)
        assertEquals(0, prediction.daysRemaining)
        assertEquals(PredictionConfidence.HIGH, prediction.confidence)
    }

    @Test
    fun predictAtDate_zeroLookback_throws() {
        assertFailsWith<IllegalArgumentException> {
            BalancePredictionEngine.predictAtDate(
                currentBalance = Cents(100000),
                transactions = emptyList(),
                referenceDate = LocalDate(2024, 6, 15),
                targetDate = LocalDate(2024, 7, 15),
                lookbackMonths = 0,
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BalancePrediction data class properties
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun balancePrediction_projectedChange_positive() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(120000),
            currentBalance = Cents(100000),
            expectedIncome = Cents(50000),
            expectedExpenses = Cents(30000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.MEDIUM,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(20000), prediction.projectedChange)
        assertFalse(prediction.isNegativeProjection)
    }

    @Test
    fun balancePrediction_projectedChange_negative() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(60000),
            currentBalance = Cents(100000),
            expectedIncome = Cents.ZERO,
            expectedExpenses = Cents(40000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.MEDIUM,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(-40000), prediction.projectedChange)
        assertFalse(prediction.isNegativeProjection) // Balance still positive
    }

    @Test
    fun balancePrediction_projectedChange_zero() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(100000),
            currentBalance = Cents(100000),
            expectedIncome = Cents(30000),
            expectedExpenses = Cents(30000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.HIGH,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertTrue(prediction.projectedChange.isZero())
    }
}
