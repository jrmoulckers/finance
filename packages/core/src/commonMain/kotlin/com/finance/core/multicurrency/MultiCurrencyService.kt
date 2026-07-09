// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.core.money.MoneyOperations
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Service for multi-currency transaction handling, conversion at entry,
 * offline rate caching, and multi-currency report aggregation.
 *
 * This service encapsulates the business rules for how multi-currency
 * transactions are processed:
 *
 * 1. **Conversion at entry**: When a user enters a transaction in a foreign
 *    currency, convert to the account's base currency using the rate at
 *    the time of entry.
 *
 * 2. **Offline conversion**: Use cached rates when the device is offline.
 *    The cache has a configurable TTL; stale rates are still usable but
 *    flagged in the result.
 *
 * 3. **Multi-currency reporting**: Aggregate transactions across currencies
 *    using current (or cached) rates into a single display currency.
 *
 * All monetary operations use [Cents] (Long) — never floating-point.
 * All timestamps use kotlinx-datetime [Instant].
 */
object MultiCurrencyService {

    /**
     * Convert a transaction amount from one currency to another at entry time.
     *
     * This captures the exchange rate at the moment of entry and returns
     * both the converted amount and metadata about the rate used.
     *
     * @param amount The original amount in the source currency.
     * @param fromCurrency The source currency (transaction currency).
     * @param toCurrency The target currency (account base currency).
     * @param rateCache The exchange rate cache to look up rates.
     * @param now Current timestamp for cache staleness check.
     * @return [ConversionAtEntryResult] or `null` if no rate is available.
     */
    @Suppress("ReturnCount")
    fun convertAtEntry(
        amount: Cents,
        fromCurrency: Currency,
        toCurrency: Currency,
        rateCache: MultiCurrencyEngine.ExchangeRateCache,
        now: Instant = Clock.System.now(),
    ): ConversionAtEntryResult? {
        if (fromCurrency == toCurrency) {
            return ConversionAtEntryResult(
                convertedAmount = amount,
                rateUsed = 1.0,
                rateTimestamp = now,
                isOfflineRate = false,
            )
        }

        val lookup = rateCache.lookup(fromCurrency, toCurrency, now) ?: return null
        val converted = MoneyOperations.multiply(amount, lookup.rate)

        return ConversionAtEntryResult(
            convertedAmount = converted,
            rateUsed = lookup.rate,
            rateTimestamp = lookup.asOf,
            isOfflineRate = lookup.isStale,
        )
    }

    /**
     * Build [TransactionCurrencyInfo] for a transaction being entered
     * in a foreign currency.
     *
     * @param originalAmount Amount in the transaction's currency.
     * @param originalCurrency The currency the transaction was made in.
     * @param accountBaseCurrency The account's base currency.
     * @param exchangeRate The rate to apply (original → base).
     * @param rateTimestamp When the rate was captured.
     * @return A fully populated [TransactionCurrencyInfo].
     */
    fun buildCurrencyInfo(
        originalAmount: Cents,
        originalCurrency: Currency,
        accountBaseCurrency: Currency,
        exchangeRate: Double,
        rateTimestamp: Instant,
    ): TransactionCurrencyInfo {
        val converted = if (originalCurrency == accountBaseCurrency) {
            originalAmount
        } else {
            MoneyOperations.multiply(originalAmount, exchangeRate)
        }

        return TransactionCurrencyInfo(
            originalAmount = originalAmount,
            originalCurrency = originalCurrency,
            convertedAmount = converted,
            baseCurrency = accountBaseCurrency,
            exchangeRate = if (originalCurrency == accountBaseCurrency) 1.0 else exchangeRate,
            rateTimestamp = rateTimestamp,
        )
    }

    /**
     * Aggregate multiple currency amounts into a single display currency
     * for reporting purposes.
     *
     * Uses current cached rates. If any rate is missing, returns `null`.
     * Stale rates (older than cache TTL) are still used but flagged.
     *
     * @param amounts List of (amount, currency) pairs to aggregate.
     * @param displayCurrency The target currency for the total.
     * @param rateCache Exchange rate cache.
     * @param now Current timestamp for staleness checks.
     * @return [MultiCurrencyReportResult] or `null` if rates are unavailable.
     */
    fun aggregateForReport(
        amounts: List<CurrencyAmount>,
        displayCurrency: Currency,
        rateCache: MultiCurrencyEngine.ExchangeRateCache,
        now: Instant = Clock.System.now(),
    ): MultiCurrencyReportResult? {
        val lineItems = mutableListOf<ReportLineItem>()
        var total = Cents.ZERO
        var anyStale = false

        for (ca in amounts) {
            if (ca.currency == displayCurrency) {
                total = total + ca.amount
                lineItems.add(
                    ReportLineItem(
                        sourceAmount = ca.amount,
                        sourceCurrency = ca.currency,
                        convertedAmount = ca.amount,
                        rateUsed = 1.0,
                        isStale = false,
                    ),
                )
            } else {
                val lookup = rateCache.lookup(ca.currency, displayCurrency, now) ?: return null
                val converted = MoneyOperations.multiply(ca.amount, lookup.rate)
                total = total + converted
                if (lookup.isStale) anyStale = true
                lineItems.add(
                    ReportLineItem(
                        sourceAmount = ca.amount,
                        sourceCurrency = ca.currency,
                        convertedAmount = converted,
                        rateUsed = lookup.rate,
                        isStale = lookup.isStale,
                    ),
                )
            }
        }

        return MultiCurrencyReportResult(
            totalInDisplayCurrency = total,
            displayCurrency = displayCurrency,
            lineItems = lineItems,
            hasStaleRates = anyStale,
        )
    }

    /**
     * Aggregate with offline fallback — uses cached rates regardless of age,
     * flagging any rate observed before [staleCutoff] as stale.
     *
     * Unlike [aggregateForReport] (which judges staleness by the cache TTL),
     * this variant judges staleness by comparing each rate's observation time
     * against an explicit [staleCutoff]. A rate is always used when present;
     * `null` is returned only when a required pair has no cached rate at all.
     *
     * @param amounts List of (amount, currency) pairs.
     * @param displayCurrency Target display currency.
     * @param rateCache Exchange rate cache (may contain stale entries).
     * @param staleCutoff Rates observed before this instant are flagged stale.
     * @return [MultiCurrencyReportResult] or `null` if a rate is entirely absent.
     */
    fun aggregateOffline(
        amounts: List<CurrencyAmount>,
        displayCurrency: Currency,
        rateCache: MultiCurrencyEngine.ExchangeRateCache,
        staleCutoff: Instant,
    ): MultiCurrencyReportResult? {
        val lineItems = mutableListOf<ReportLineItem>()
        var total = Cents.ZERO
        var anyStale = false

        for (ca in amounts) {
            if (ca.currency == displayCurrency) {
                total = total + ca.amount
                lineItems.add(
                    ReportLineItem(
                        sourceAmount = ca.amount,
                        sourceCurrency = ca.currency,
                        convertedAmount = ca.amount,
                        rateUsed = 1.0,
                        isStale = false,
                    ),
                )
            } else {
                // Pass staleCutoff as `now` only to satisfy the signature; the
                // returned rate is used regardless of the cache's own TTL and we
                // judge staleness ourselves from the rate's observation time.
                val lookup = rateCache.lookup(ca.currency, displayCurrency, staleCutoff)
                    ?: return null
                val stale = lookup.asOf < staleCutoff
                val converted = MoneyOperations.multiply(ca.amount, lookup.rate)
                total = total + converted
                if (stale) anyStale = true
                lineItems.add(
                    ReportLineItem(
                        sourceAmount = ca.amount,
                        sourceCurrency = ca.currency,
                        convertedAmount = converted,
                        rateUsed = lookup.rate,
                        isStale = stale,
                    ),
                )
            }
        }

        return MultiCurrencyReportResult(
            totalInDisplayCurrency = total,
            displayCurrency = displayCurrency,
            lineItems = lineItems,
            hasStaleRates = anyStale,
        )
    }
}
