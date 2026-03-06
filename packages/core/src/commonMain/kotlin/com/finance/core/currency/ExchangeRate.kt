package com.finance.core.currency

import com.finance.models.types.Currency
import kotlinx.datetime.Instant

/**
 * An exchange rate between two currencies at a point in time.
 */
data class ExchangeRate(
    val from: Currency,
    val to: Currency,
    val rate: Double,
    val timestamp: Instant,
) {
    init {
        require(rate > 0) { "Exchange rate must be positive" }
        require(from != to) { "Cannot have exchange rate between same currency" }
    }

    /** The inverse rate (e.g., USD->EUR becomes EUR->USD) */
    val inverse: ExchangeRate get() = ExchangeRate(
        from = to,
        to = from,
        rate = 1.0 / rate,
        timestamp = timestamp,
    )
}
