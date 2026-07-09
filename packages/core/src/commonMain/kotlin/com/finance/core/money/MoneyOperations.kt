// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import kotlin.math.abs
import kotlin.math.floor

/**
 * Extended money arithmetic operations with financial precision.
 * All operations use Long (cents) to avoid floating-point errors.
 */
object MoneyOperations {
    /**
     * Multiply cents by a decimal factor with banker's rounding.
     * Used for tax calculations, percentage-based budgets, etc.
     *
     * NOTE: this convenience overload routes through [Double] and therefore
     * loses precision for magnitudes above 2^53 minor units. For exact money
     * math prefer an integer basis — see [percentageExact] and [divide].
     */
    fun multiply(amount: Cents, factor: Double): Cents {
        val result = amount.amount.toDouble() * factor
        return Cents(bankersRound(result))
    }

    /**
     * Divide cents by an integer divisor with round-half-to-even.
     *
     * Uses exact `Long` arithmetic — never floating point — so there is no
     * precision loss regardless of magnitude. Used for splitting bills,
     * averaging, and run-rate projections.
     */
    fun divide(amount: Cents, divisor: Int): Cents {
        require(divisor != 0) { "Cannot divide by zero" }
        return Cents(roundedDiv(amount.amount, divisor.toLong()))
    }

    /**
     * Calculate percentage of an amount.
     * @param amount The base amount
     * @param percentage The percentage (e.g., 15.5 for 15.5%)
     *
     * NOTE: convenience overload — routes through [Double]. For exact results
     * (e.g. tax or budget splits at extreme magnitudes) use [percentageExact].
     */
    fun percentage(amount: Cents, percentage: Double): Cents {
        return multiply(amount, percentage / 100.0)
    }

    /**
     * Calculate a percentage of [amount] using an exact integer basis, with
     * round-half-to-even. No floating point is involved, so the result is exact
     * for every representable magnitude.
     *
     * Express the percentage as [numerator] / [denominator], e.g. 8.25% is
     * `percentageExact(amount, 825, 10000)` and 50% is
     * `percentageExact(amount, 50, 100)`.
     *
     * @throws IllegalArgumentException if [denominator] is zero.
     * @throws ArithmeticException if the intermediate product overflows `Long`.
     */
    fun percentageExact(amount: Cents, numerator: Long, denominator: Long): Cents {
        require(denominator != 0L) { "Percentage denominator cannot be zero" }
        val product = checkedMultiply(amount.amount, numerator)
        return Cents(roundedDiv(product, denominator))
    }

    /**
     * Sum a list of Cents values.
     */
    fun sum(amounts: List<Cents>): Cents {
        return Cents(amounts.sumOf { it.amount })
    }

    /**
     * Divide two [Long] values with round-half-to-even ("banker's rounding"),
     * using only integer arithmetic. Symmetric about zero: `roundedDiv(-n, d)`
     * equals `-roundedDiv(n, d)`.
     *
     * @throws IllegalArgumentException if [denominator] is zero.
     */
    internal fun roundedDiv(numerator: Long, denominator: Long): Long {
        require(denominator != 0L) { "Cannot divide by zero" }
        require(numerator != Long.MIN_VALUE && denominator != Long.MIN_VALUE) {
            "Value out of representable range for exact division"
        }
        val negative = (numerator < 0) != (denominator < 0)
        val n = abs(numerator)
        val d = abs(denominator)
        val quotient = n / d
        val remainder = n % d
        // Compare remainder against half of the divisor without overflow.
        val magnitude = when {
            remainder < d - remainder -> quotient
            remainder > d - remainder -> quotient + 1
            quotient % 2 == 0L -> quotient // exact half: round to even
            else -> quotient + 1
        }
        return if (negative) -magnitude else magnitude
    }

    /**
     * Multiply two [Long] values, throwing on overflow rather than silently
     * wrapping. Keeps exact-money helpers honest about their limits.
     */
    private fun checkedMultiply(a: Long, b: Long): Long {
        if (b == 0L) return 0L
        val result = a * b
        if (result / b != a) {
            throw ArithmeticException("Long overflow in multiplication")
        }
        return result
    }

    /**
     * Banker's rounding (round half to even).
     * Required for financial calculations to avoid systematic bias.
     */
    fun bankersRound(value: Double): Long {
        val floor = floor(value).toLong()
        val fraction = value - floor
        return when {
            fraction < 0.5 -> floor
            fraction > 0.5 -> floor + 1
            // Exactly 0.5: round to even
            floor % 2 == 0L -> floor
            else -> floor + 1
        }
    }

    /**
     * Allocate an amount into N equal parts, distributing remainder.
     * For example, $10.00 / 3 = [$3.34, $3.33, $3.33] (no cents lost).
     */
    fun allocate(amount: Cents, parts: Int): List<Cents> {
        require(parts > 0) { "Parts must be positive" }
        val base = amount.amount / parts
        val remainder = (amount.amount % parts).toInt()

        return (0 until parts).map { i ->
            if (i < abs(remainder)) {
                Cents(base + if (amount.amount >= 0) 1 else -1)
            } else {
                Cents(base)
            }
        }
    }

    /**
     * Allocate an amount by ratios (e.g., for weighted budget splits).
     * @param ratios List of weights (e.g., [50, 30, 20] for 50/30/20 rule)
     */
    fun allocateByRatio(amount: Cents, ratios: List<Int>): List<Cents> {
        require(ratios.isNotEmpty()) { "Ratios cannot be empty" }
        require(ratios.all { it > 0 }) { "All ratios must be positive" }

        val total = ratios.sum()
        val results = ratios.map { ratio ->
            Cents(amount.amount * ratio / total)
        }

        // Distribute remainder to largest ratio holders first
        val allocated = results.sumOf { it.amount }
        val remainder = amount.amount - allocated
        val sortedIndices = ratios.indices.sortedByDescending { ratios[it] }

        return results.toMutableList().also { list ->
            for (i in 0 until abs(remainder).toInt()) {
                val idx = sortedIndices[i % sortedIndices.size]
                list[idx] = Cents(list[idx].amount + if (remainder > 0) 1 else -1)
            }
        }
    }
}
