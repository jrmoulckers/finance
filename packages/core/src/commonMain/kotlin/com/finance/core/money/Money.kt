// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.serialization.Serializable

/**
 * A currency-aware monetary amount.
 *
 * Unlike the raw [Cents] type — which is a currency-agnostic Long count of
 * minor units — [Money] always pairs an amount with its [Currency]. This makes
 * it impossible to silently add USD to EUR, and it carries the per-currency
 * minor-unit scale (2 for USD, 0 for JPY/KRW/VND, 3 for BHD/KWD/OMR) needed for
 * correct entry, display, and conversion of foreign spend.
 *
 * The stored [cents] are always in the *minor units* of [currency]:
 *  - `$12.34` → `Money(Cents(1234), USD)`
 *  - `¥500`   → `Money(Cents(500), JPY)`   (0 decimal places)
 *  - `1.234 BD` → `Money(Cents(1234), BHD)` (3 decimal places)
 *
 * All arithmetic stays in `Long` minor units — never floating point — and
 * same-currency operations are enforced at runtime.
 *
 * @property cents The amount in the minor units of [currency].
 * @property currency The ISO 4217 currency of this amount.
 */
@Serializable
data class Money(
    val cents: Cents,
    val currency: Currency,
) : Comparable<Money> {

    /** Number of minor-unit decimal places for this money's currency. */
    val decimalPlaces: Int get() = currency.decimalPlaces

    /** Raw minor-unit amount (e.g. cents for USD). */
    val minorUnits: Long get() = cents.amount

    /** `true` when the amount is greater than zero. */
    fun isPositive(): Boolean = cents.isPositive()

    /** `true` when the amount is less than zero. */
    fun isNegative(): Boolean = cents.isNegative()

    /** `true` when the amount is exactly zero. */
    fun isZero(): Boolean = cents.isZero()

    /** Absolute value, preserving currency. */
    fun abs(): Money = Money(cents.abs(), currency)

    /** Negated amount, preserving currency. */
    operator fun unaryMinus(): Money = Money(-cents, currency)

    /**
     * Add two amounts of the **same** currency.
     * @throws IllegalArgumentException when currencies differ.
     */
    operator fun plus(other: Money): Money {
        requireSameCurrency(other)
        return Money(cents + other.cents, currency)
    }

    /**
     * Subtract an amount of the **same** currency.
     * @throws IllegalArgumentException when currencies differ.
     */
    operator fun minus(other: Money): Money {
        requireSameCurrency(other)
        return Money(cents - other.cents, currency)
    }

    /** Scale by an integer factor (e.g. quantity), preserving currency. */
    operator fun times(factor: Int): Money = Money(cents * factor, currency)

    /**
     * Compare two amounts of the **same** currency.
     * @throws IllegalArgumentException when currencies differ.
     */
    override fun compareTo(other: Money): Int {
        requireSameCurrency(other)
        return cents.compareTo(other.cents)
    }

    /**
     * Render the amount as a plain, locale-neutral decimal string with the
     * correct number of fractional digits for the currency, e.g. `"12.34"`,
     * `"500"` (JPY), `"1.234"` (BHD). No symbol or grouping separators —
     * presentation belongs to the formatting layer.
     */
    fun toPlainString(): String {
        val negative = cents.amount < 0
        val absMinor = if (negative) {
            // Guard against Long.MIN_VALUE overflow on negation.
            if (cents.amount == Long.MIN_VALUE) {
                return "-" + buildPlain(Long.MIN_VALUE.toULong().toString())
            }
            -cents.amount
        } else {
            cents.amount
        }
        val body = buildPlain(absMinor.toString())
        return if (negative) "-$body" else body
    }

    private fun buildPlain(absDigits: String): String {
        if (decimalPlaces == 0) return absDigits
        val padded = absDigits.padStart(decimalPlaces + 1, '0')
        val splitAt = padded.length - decimalPlaces
        val whole = padded.substring(0, splitAt)
        val frac = padded.substring(splitAt)
        return "$whole.$frac"
    }

    private fun requireSameCurrency(other: Money) {
        require(currency == other.currency) {
            "Currency mismatch: ${currency.code} vs ${other.currency.code}"
        }
    }

    companion object {
        /** Zero amount in the given currency. */
        fun zero(currency: Currency): Money = Money(Cents.ZERO, currency)

        /**
         * Construct from a raw minor-unit amount in [currency].
         * @param minorUnits Amount in minor units (cents, yen, fils, …).
         */
        fun ofMinor(minorUnits: Long, currency: Currency): Money =
            Money(Cents(minorUnits), currency)

        /**
         * Construct from separated whole and fractional components.
         *
         * The [fraction] is interpreted as digits of the currency's minor unit
         * and must be in `0 until 10^decimalPlaces`. For zero-decimal currencies
         * (e.g. JPY) [fraction] must be `0`.
         *
         * Examples:
         *  - `ofMajor(12, 34, USD)` → `$12.34`
         *  - `ofMajor(500, 0, JPY)` → `¥500`
         *  - `ofMajor(1, 234, BHD)` → `1.234 BD`
         *
         * @throws IllegalArgumentException for a negative [fraction] or one that
         *   does not fit the currency's decimal places.
         */
        fun ofMajor(whole: Long, fraction: Long, currency: Currency): Money {
            val decimals = currency.decimalPlaces
            val scale = pow10(decimals)
            require(fraction in 0 until maxOf(scale, 1L)) {
                "Fraction $fraction out of range for ${currency.code} " +
                    "($decimals decimal place(s))"
            }
            val sign = if (whole < 0) -1L else 1L
            val magnitude = kotlin.math.abs(whole) * scale + fraction
            return Money(Cents(sign * magnitude), currency)
        }

        /**
         * Construct from a whole major-unit amount with no fractional part,
         * e.g. `ofWholeMajor(20, USD)` → `$20.00`, `ofWholeMajor(500, JPY)` → `¥500`.
         */
        fun ofWholeMajor(whole: Long, currency: Currency): Money =
            ofMajor(whole, 0, currency)

        internal fun pow10(n: Int): Long {
            var result = 1L
            repeat(n) { result *= 10 }
            return result
        }
    }
}
