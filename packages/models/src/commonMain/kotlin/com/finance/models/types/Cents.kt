package com.finance.models.types

import kotlinx.serialization.Serializable
import kotlin.math.abs

/**
 * Represents a monetary amount in the smallest currency unit (e.g., cents for USD).
 * All financial arithmetic uses Long to avoid floating-point precision errors.
 */
@JvmInline
@Serializable
value class Cents(val amount: Long) {
    operator fun plus(other: Cents): Cents = Cents(amount + other.amount)
    operator fun minus(other: Cents): Cents = Cents(amount - other.amount)
    operator fun times(factor: Int): Cents = Cents(amount * factor)
    operator fun unaryMinus(): Cents = Cents(-amount)
    operator fun compareTo(other: Cents): Int = amount.compareTo(other.amount)

    fun isPositive(): Boolean = amount > 0
    fun isNegative(): Boolean = amount < 0
    fun isZero(): Boolean = amount == 0L
    fun abs(): Cents = Cents(abs(amount))

    companion object {
        val ZERO = Cents(0L)

        /**
         * Converts a dollar amount to cents. Only use for display/input conversion —
         * all internal arithmetic should stay in [Cents].
         */
        fun fromDollars(dollars: Double): Cents = Cents((dollars * 100).toLong())
    }
}
