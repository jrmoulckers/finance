// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * An exchange rate quoted in **major units**: one major unit of [from] equals
 * [rate] major units of [to] (e.g. `1 EUR = 1.085 USD`).
 *
 * Quoting in major units matches how users read FX rates and how rate feeds
 * publish them. The minor-unit scale difference between currencies (e.g.
 * JPY has 0 decimals, USD has 2) is handled by [MoneyConverter], not by the
 * caller, so the same rate value works regardless of either currency's decimals.
 *
 * @property from Source currency.
 * @property to Target currency.
 * @property rate Major-unit multiplier (`1 from = rate to`). Must be > 0.
 * @property asOf Timestamp the rate was observed/quoted.
 */
@Serializable
data class MoneyRate(
    val from: Currency,
    val to: Currency,
    val rate: Double,
    val asOf: Instant,
) {
    init {
        require(rate > 0.0) { "Exchange rate must be positive, was $rate" }
    }

    /** The inverse quote (`1 to = 1/rate from`), preserving [asOf]. */
    val inverse: MoneyRate get() = MoneyRate(to, from, 1.0 / rate, asOf)
}

/**
 * Pure abstraction over a source of exchange rates.
 *
 * Implementations live outside `commonMain` business logic (network client,
 * on-device cache, user-supplied rate, …). The domain layer never hardcodes
 * rates or API keys — it only depends on this interface.
 *
 * Implementations should return `null` when no rate is available for the
 * requested pair/time rather than throwing, so callers can decide how to
 * degrade (e.g. ask the user for a manual rate).
 */
fun interface MoneyRateProvider {
    /**
     * @param from Source currency.
     * @param to Target currency.
     * @param at Point in time the rate is needed for (entry time).
     * @return A [MoneyRate] for `from → to`, or `null` if unavailable.
     */
    fun rateFor(from: Currency, to: Currency, at: Instant): MoneyRate?
}

/**
 * Decimal-place-aware currency conversion.
 *
 * The critical correctness rule for foreign spend: a [Money] amount is stored
 * in the *minor units of its own currency*, but currencies have different
 * minor-unit scales. Converting minor units directly with a major-unit rate is
 * only correct when both currencies share the same number of decimal places.
 *
 * For the general case we rescale by `10^(targetDecimals - sourceDecimals)`:
 *
 * ```
 * targetMinor = round_half_even( sourceMinor * rate * 10^(targetDec - sourceDec) )
 * ```
 *
 * Worked examples:
 *  - `€100.00 → USD @ 1.085` : `10000 * 1.085 * 10^0   = 10850` → `$108.50`
 *  - `¥1000   → USD @ 0.0067`: `1000  * 0.0067 * 10^2  = 670`   → `$6.70`
 *  - `$6.70   → JPY @ 149.25`: `670   * 149.25 * 10^-2 ≈ 1000`  → `¥1000`
 */
object MoneyConverter {

    /**
     * Convert [amount] into [target] using a major-unit [rate], applying the
     * minor-unit rescale and banker's rounding (round half to even).
     *
     * When [amount] is already in [target] the original amount is returned
     * unchanged (rate is treated as the identity).
     *
     * @throws IllegalArgumentException when [rate] is not positive.
     */
    fun convert(amount: Money, target: Currency, rate: Double): Money {
        if (amount.currency == target) return amount
        require(rate > 0.0) { "Exchange rate must be positive, was $rate" }

        val sourceDecimals = amount.currency.decimalPlaces
        val targetDecimals = target.decimalPlaces
        val scaleDiff = targetDecimals - sourceDecimals

        val scaled = amount.cents.amount.toDouble() * rate * pow10(scaleDiff)
        return Money(Cents(MoneyOperations.bankersRound(scaled)), target)
    }

    /**
     * Convert [amount] using a [MoneyRate]. The rate's [MoneyRate.from] must
     * match the amount's currency.
     *
     * @throws IllegalArgumentException when the rate's source currency does not
     *   match [amount]'s currency.
     */
    fun convert(amount: Money, rate: MoneyRate): Money {
        require(rate.from == amount.currency) {
            "Rate source ${rate.from.code} does not match amount currency ${amount.currency.code}"
        }
        return convert(amount, rate.to, rate.rate)
    }

    private fun pow10(exponent: Int): Double {
        var result = 1.0
        val magnitude = kotlin.math.abs(exponent)
        repeat(magnitude) { result *= 10.0 }
        return if (exponent < 0) 1.0 / result else result
    }
}

/**
 * Source of the exchange rate captured on a foreign transaction.
 */
@Serializable
enum class RateSource {
    /** Rate obtained from a [MoneyRateProvider] (live or cached feed). */
    PROVIDER,

    /** Rate entered/overridden by the user (e.g. the rate printed on a receipt). */
    MANUAL,

    /** Both currencies were identical; no conversion was needed. */
    NONE,
}

/**
 * An immutable record of a transaction entered in a (possibly foreign) currency.
 *
 * This separates the **entered amount** — what the user actually paid in the
 * local currency — from the **base amount** in the account/home currency, while
 * preserving every input needed to audit or recompute the conversion: the rate,
 * its timestamp, its source, and any explicit fee.
 *
 * Invariants:
 *  - [enteredAmount] and [baseAmount] always carry their own currency.
 *  - When [enteredAmount] is already in [baseAmount]'s currency the rate is
 *    `1.0`, [rateSource] is [RateSource.NONE], and the two amounts match
 *    (plus any [feeAmount]).
 *  - [feeAmount], when present, is expressed in the base currency and is **not**
 *    folded into [baseAmount]; it is tracked separately so totals and the FX
 *    markup remain transparent.
 *
 * @property enteredAmount Amount in the currency the user actually paid in.
 * @property baseAmount Converted amount in the account/home base currency.
 * @property exchangeRate Major-unit rate applied (entered → base); `1.0` when same currency.
 * @property rateTimestamp When the applied rate was observed.
 * @property rateSource Where [exchangeRate] came from.
 * @property feeAmount Optional explicit FX/card fee, in the base currency.
 */
@Serializable
data class ForeignTransactionEntry(
    val enteredAmount: Money,
    val baseAmount: Money,
    val exchangeRate: Double,
    val rateTimestamp: Instant,
    val rateSource: RateSource,
    val feeAmount: Money? = null,
) {
    init {
        require(exchangeRate > 0.0) { "Exchange rate must be positive, was $exchangeRate" }
        feeAmount?.let {
            require(it.currency == baseAmount.currency) {
                "Fee currency ${it.currency.code} must match base currency ${baseAmount.currency.code}"
            }
            require(!it.isNegative()) { "Fee amount must not be negative" }
        }
    }

    /** `true` when the entry was made directly in the base currency (no FX). */
    val isSameCurrency: Boolean get() = enteredAmount.currency == baseAmount.currency

    /**
     * Total impact on the base currency: the converted amount plus any explicit
     * fee. When no fee is recorded this equals [baseAmount].
     */
    val baseTotalWithFee: Money
        get() = feeAmount?.let { baseAmount + it } ?: baseAmount
}

/**
 * Builds [ForeignTransactionEntry] records from an entered [Money] amount,
 * resolving the rate via a [MoneyRateProvider] (or an explicit manual override)
 * and recording everything needed to reproduce the conversion.
 *
 * Pure and stateless — all inputs are passed explicitly so the same call always
 * yields the same result.
 */
object ForeignTransactionEntryBuilder {

    /**
     * Build an entry, fetching the rate from [provider] at [at].
     *
     * @param entered The amount the user paid, in its local currency.
     * @param baseCurrency The account/home currency to convert into.
     * @param provider Rate source for `entered.currency → baseCurrency`.
     * @param at Entry timestamp used to query and stamp the rate.
     * @param fee Optional explicit FX/card fee, expressed in [baseCurrency].
     * @return A populated [ForeignTransactionEntry], or `null` when [provider]
     *   has no rate for the pair (caller may then prompt for a manual rate).
     */
    @Suppress("ReturnCount")
    fun build(
        entered: Money,
        baseCurrency: Currency,
        provider: MoneyRateProvider,
        at: Instant,
        fee: Money? = null,
    ): ForeignTransactionEntry? {
        if (entered.currency == baseCurrency) {
            return sameCurrencyEntry(entered, at, fee)
        }
        val rate = provider.rateFor(entered.currency, baseCurrency, at) ?: return null
        val base = MoneyConverter.convert(entered, rate)
        return ForeignTransactionEntry(
            enteredAmount = entered,
            baseAmount = base,
            exchangeRate = rate.rate,
            rateTimestamp = rate.asOf,
            rateSource = RateSource.PROVIDER,
            feeAmount = fee,
        )
    }

    /**
     * Build an entry using a user-supplied [rate] (e.g. the rate printed on a
     * receipt). Records [RateSource.MANUAL].
     *
     * @param entered The amount the user paid, in its local currency.
     * @param baseCurrency The account/home currency to convert into.
     * @param rate Major-unit rate (`1 entered = rate base`). Must be > 0.
     * @param at Entry timestamp used to stamp the manual rate.
     * @param fee Optional explicit FX/card fee, expressed in [baseCurrency].
     */
    fun buildWithManualRate(
        entered: Money,
        baseCurrency: Currency,
        rate: Double,
        at: Instant,
        fee: Money? = null,
    ): ForeignTransactionEntry {
        require(rate > 0.0) { "Exchange rate must be positive, was $rate" }
        if (entered.currency == baseCurrency) {
            return sameCurrencyEntry(entered, at, fee)
        }
        val base = MoneyConverter.convert(entered, baseCurrency, rate)
        return ForeignTransactionEntry(
            enteredAmount = entered,
            baseAmount = base,
            exchangeRate = rate,
            rateTimestamp = at,
            rateSource = RateSource.MANUAL,
            feeAmount = fee,
        )
    }

    private fun sameCurrencyEntry(
        entered: Money,
        at: Instant,
        fee: Money?,
    ): ForeignTransactionEntry = ForeignTransactionEntry(
        enteredAmount = entered,
        baseAmount = entered,
        exchangeRate = 1.0,
        rateTimestamp = at,
        rateSource = RateSource.NONE,
        feeAmount = fee,
    )
}
