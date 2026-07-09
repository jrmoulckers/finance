// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.core.money.MoneyOperations
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Robust multi-currency report aggregation with **partial coverage**.
 *
 * Where [MultiCurrencyService.aggregateForReport] and
 * [MultiCurrencyEngine.aggregate] fail with `null` as soon as a single currency
 * lacks a rate to the display currency, this aggregator sums everything it *can*
 * convert and reports the currencies it could not, mirroring the pattern already
 * used by `FinancialAggregator.netWorth(accounts, baseCurrency, rates)` /
 * `NetWorthResult` for net worth (#3282, #3723).
 *
 * Callers can then disclose partial coverage ("total excludes CHF, NOK — no
 * rate available") instead of showing nothing. Stale cached rates are still
 * used and flagged via [PartialCurrencyReport.hasStaleRates].
 *
 * All monetary values use [Cents] (Long-backed); rates are the only [Double]s.
 */
object MultiCurrencyReportAggregator {

    /**
     * Aggregate [amounts] into [displayCurrency], converting each with the best
     * available cached rate and collecting any currencies that cannot be
     * converted.
     *
     * - Amounts already in [displayCurrency] need no rate.
     * - Amounts whose currency has a cached rate (fresh or stale) are converted
     *   with banker's rounding and added to the total; stale conversions are
     *   flagged on the line item and in [PartialCurrencyReport.hasStaleRates].
     * - Amounts whose currency has no cached rate at all are skipped and their
     *   currency is recorded in [PartialCurrencyReport.unconvertedCurrencies].
     *
     * @param amounts List of (amount, currency) pairs to aggregate.
     * @param displayCurrency Target currency for the total.
     * @param rateCache Exchange rate cache.
     * @param now Reference time for staleness evaluation.
     * @return A [PartialCurrencyReport]; never `null`, even when nothing converts.
     */
    fun aggregate(
        amounts: List<CurrencyAmount>,
        displayCurrency: Currency,
        rateCache: MultiCurrencyEngine.ExchangeRateCache,
        now: Instant = Clock.System.now(),
    ): PartialCurrencyReport {
        val lineItems = mutableListOf<ReportLineItem>()
        val converted = mutableSetOf<Currency>()
        val unconverted = mutableSetOf<Currency>()
        var total = Cents.ZERO
        var anyStale = false

        for (ca in amounts) {
            if (ca.currency == displayCurrency) {
                total = total + ca.amount
                converted += ca.currency
                lineItems.add(
                    ReportLineItem(
                        sourceAmount = ca.amount,
                        sourceCurrency = ca.currency,
                        convertedAmount = ca.amount,
                        rateUsed = 1.0,
                        isStale = false,
                    ),
                )
                continue
            }

            val lookup = rateCache.lookup(ca.currency, displayCurrency, now)
            if (lookup == null) {
                unconverted += ca.currency
                continue
            }

            val convertedAmount = MoneyOperations.multiply(ca.amount, lookup.rate)
            total = total + convertedAmount
            converted += ca.currency
            if (lookup.isStale) anyStale = true
            lineItems.add(
                ReportLineItem(
                    sourceAmount = ca.amount,
                    sourceCurrency = ca.currency,
                    convertedAmount = convertedAmount,
                    rateUsed = lookup.rate,
                    isStale = lookup.isStale,
                ),
            )
        }

        return PartialCurrencyReport(
            totalInDisplayCurrency = total,
            displayCurrency = displayCurrency,
            lineItems = lineItems,
            convertedCurrencies = converted,
            unconvertedCurrencies = unconverted,
            hasStaleRates = anyStale,
        )
    }
}

/**
 * Result of a partial-coverage multi-currency aggregation.
 *
 * @property totalInDisplayCurrency Sum of every *convertible* amount.
 * @property displayCurrency The currency the total is expressed in.
 * @property lineItems Per-amount conversion detail for the convertible amounts.
 * @property convertedCurrencies Currencies that were successfully converted
 *   (includes [displayCurrency] when present in the input).
 * @property unconvertedCurrencies Currencies excluded from the total because no
 *   rate was available.
 * @property hasStaleRates `true` when at least one converted amount used a stale rate.
 */
data class PartialCurrencyReport(
    val totalInDisplayCurrency: Cents,
    val displayCurrency: Currency,
    val lineItems: List<ReportLineItem>,
    val convertedCurrencies: Set<Currency>,
    val unconvertedCurrencies: Set<Currency>,
    val hasStaleRates: Boolean,
) {
    /** `true` when at least one amount could not be converted for lack of a rate. */
    val hasUnconvertedAmounts: Boolean get() = unconvertedCurrencies.isNotEmpty()

    /** Total distinct source currencies seen (converted plus unconverted). */
    val currencyCount: Int get() = (convertedCurrencies + unconvertedCurrencies).size
}
