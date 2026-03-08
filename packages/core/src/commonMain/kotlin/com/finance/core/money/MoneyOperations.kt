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
     */
    fun multiply(amount: Cents, factor: Double): Cents {
        val result = amount.amount.toDouble() * factor
        return Cents(bankersRound(result))
    }

    /**
     * Divide cents with banker's rounding.
     * Used for splitting bills, averaging, etc.
     */
    fun divide(amount: Cents, divisor: Int): Cents {
        require(divisor != 0) { "Cannot divide by zero" }
        val result = amount.amount.toDouble() / divisor
        return Cents(bankersRound(result))
    }

    /**
     * Calculate percentage of an amount.
     * @param amount The base amount
     * @param percentage The percentage (e.g., 15.5 for 15.5%)
     */
    fun percentage(amount: Cents, percentage: Double): Cents {
        return multiply(amount, percentage / 100.0)
    }

    /**
     * Sum a list of Cents values.
     */
    fun sum(amounts: List<Cents>): Cents {
        return Cents(amounts.sumOf { it.amount })
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
