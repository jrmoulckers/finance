package com.finance.models.types

import kotlinx.serialization.Serializable

/**
 * ISO 4217 currency code. Enforces a 3-letter uppercase format at construction time.
 */
@JvmInline
@Serializable
value class Currency(val code: String) {
    init {
        require(code.length == 3 && code.all { it.isUpperCase() }) {
            "Currency code must be a 3-letter uppercase ISO 4217 code, got: $code"
        }
    }

    /** Number of decimal places for this currency's minor unit. */
    val decimalPlaces: Int get() = when (code) {
        "JPY", "KRW", "VND" -> 0
        "BHD", "KWD", "OMR" -> 3
        else -> 2
    }

    companion object {
        val USD = Currency("USD")
        val EUR = Currency("EUR")
        val GBP = Currency("GBP")
        val JPY = Currency("JPY")
        val CAD = Currency("CAD")
    }
}
