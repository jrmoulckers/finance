// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import com.finance.core.aggregation.FinancialAggregator
import com.finance.desktop.ai.BalancePredictor
import com.finance.desktop.ai.PredictionInput
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.first
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Builds [AiSpendWidgetSnapshot]s for the AI spend/forecast widget.
 *
 * Responsibilities:
 * 1. Read accounts and transactions from the **local** repositories (no network).
 * 2. Derive today's spend and a trailing per-day spend history.
 * 3. Feed those on-device features into a [BalancePredictor] for the
 *    short-horizon balance projection.
 *
 * All inference inputs are computed here from on-device data and never leave
 * the machine, satisfying the issue's privacy requirement. The injected
 * [predictor] is itself on-device (heuristic today, ONNX/Windows ML later).
 */
class AiFinanceWidgetProvider(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val predictor: BalancePredictor,
    private val clock: Clock = Clock.System,
) {
    companion object {
        private val logger: Logger =
            Logger.getLogger(AiFinanceWidgetProvider::class.java.name)

        /** Trailing window of daily spend totals fed to the predictor. */
        const val HISTORY_DAYS = 14

        private val DEFAULT_HOUSEHOLD = SyncId("d1")
    }

    /**
     * Produces a fresh snapshot from current on-device data.
     *
     * On any failure this returns a safe zeroed snapshot flagged
     * [WidgetConnectivity.OFFLINE] so the widget can render fallback messaging
     * rather than crash.
     */
    suspend fun snapshot(connectivity: WidgetConnectivity = WidgetConnectivity.ONLINE): AiSpendWidgetSnapshot {
        @Suppress("TooGenericExceptionCaught") // Widget provider error boundary
        return try {
            val accounts = accountRepository.observeActive(DEFAULT_HOUSEHOLD).first()
            val transactions = transactionRepository.observeAll(DEFAULT_HOUSEHOLD).first()

            val today = clock.now()
                .toLocalDateTime(TimeZone.currentSystemDefault())
                .date

            val currentBalance = FinancialAggregator.netWorth(accounts)
            val todaySpend = FinancialAggregator.totalSpending(transactions, today, today)

            // Trailing per-day spend history (excludes today so partial-day
            // spend does not skew the burn-rate estimate).
            val recentDailySpend = (1..HISTORY_DAYS).map { daysAgo ->
                val day = LocalDate.fromEpochDays(today.toEpochDays() - daysAgo)
                FinancialAggregator.totalSpending(transactions, day, day)
            }

            val input = PredictionInput(
                currentBalance = currentBalance,
                todaySpend = todaySpend,
                recentDailySpend = recentDailySpend,
                upcomingBills = Cents.ZERO,
                horizonDays = PredictionInput.DEFAULT_HORIZON_DAYS,
            )

            AiSpendWidgetSnapshot(
                todaySpend = todaySpend,
                prediction = predictor.predict(input),
                generatedAtEpochMs = clock.now().toEpochMilliseconds(),
                connectivity = connectivity,
            )
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Failed to build AI widget snapshot — returning offline fallback", e)
            fallbackSnapshot()
        }
    }

    /** Zeroed, offline-flagged snapshot used as an error boundary. */
    private fun fallbackSnapshot(): AiSpendWidgetSnapshot {
        val input = PredictionInput(
            currentBalance = Cents.ZERO,
            todaySpend = Cents.ZERO,
            recentDailySpend = emptyList(),
        )
        return AiSpendWidgetSnapshot(
            todaySpend = Cents.ZERO,
            prediction = predictor.predict(input),
            generatedAtEpochMs = clock.now().toEpochMilliseconds(),
            connectivity = WidgetConnectivity.OFFLINE,
        )
    }
}
