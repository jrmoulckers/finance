// SPDX-License-Identifier: BUSL-1.1

package com.finance.models.types

import kotlin.jvm.JvmInline
import kotlinx.serialization.Serializable

/**
 * Represents a monetary amount in the smallest currency unit (e.g., cents for USD).
 * All financial arithmetic uses Long to avoid floating-point precision errors.
 */
@JvmInline
@Serializable
value class Cents(val amount: Long) {
    operator fun plus(other: Cents): Cents {
        val result = amount + other.amount
        // Overflow: signs match but result sign differs
        if ((amount xor other.amount) >= 0 && (amount xor result) < 0) {
            throw ArithmeticException("Long overflow in Cents addition")
        }
        return Cents(result)
    }

    operator fun minus(other: Cents): Cents {
        val result = amount - other.amount
        // Overflow: signs differ and result sign differs from left operand
        if ((amount xor other.amount) < 0 && (amount xor result) < 0) {
            throw ArithmeticException("Long overflow in Cents subtraction")
        }
        return Cents(result)
    }

    operator fun times(factor: Int): Cents {
        val result = amount * factor.toLong()
        if (factor.toLong() != 0L && result / factor.toLong() != amount) {
            throw ArithmeticException("Long overflow in Cents multiplication")
        }
        return Cents(result)
    }

    operator fun unaryMinus(): Cents {
        if (amount == Long.MIN_VALUE) {
            throw ArithmeticException("Long overflow in Cents negation")
        }
        return Cents(-amount)
    }

    operator fun compareTo(other: Cents): Int = amount.compareTo(other.amount)

    fun isPositive(): Boolean = amount > 0
    fun isNegative(): Boolean = amount < 0
    fun isZero(): Boolean = amount == 0L
    fun abs(): Cents = if (amount >= 0) this else -this

    companion object {
        val ZERO = Cents(0L)

        /**
         * Converts a dollar amount to cents. Only use for display/input conversion —
         * all internal arithmetic should stay in [Cents].
         * @throws IllegalArgumentException if the result would overflow Long
         */
        fun fromDollars(dollars: Double): Cents {
            val cents = dollars * 100
            require(cents >= Long.MIN_VALUE.toDouble() && cents <= Long.MAX_VALUE.toDouble()) {
                "Dollar amount $dollars exceeds representable range in cents"
            }
            return Cents(cents.toLong())
        }
    }
}
