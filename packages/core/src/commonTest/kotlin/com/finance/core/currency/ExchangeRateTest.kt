// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.currency

import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlin.test.*

class ExchangeRateTest {

    private val timestamp = Instant.parse("2024-06-15T12:00:00Z")

    // ═══════════════════════════════════════════════════════════════════
    // Valid creation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun create_validRate() {
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.EUR,
            rate = 0.92,
            timestamp = timestamp,
        )
        assertEquals(Currency.USD, rate.from)
        assertEquals(Currency.EUR, rate.to)
        assertEquals(0.92, rate.rate)
        assertEquals(timestamp, rate.timestamp)
    }

    @Test
    fun create_rateOfOne() {
        // Edge case: rate = 1.0 is valid (pegged currencies)
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.EUR,
            rate = 1.0,
            timestamp = timestamp,
        )
        assertEquals(1.0, rate.rate)
    }

    @Test
    fun create_verySmallRate() {
        // e.g., 1 JPY = 0.0067 USD
        val rate = ExchangeRate(
            from = Currency.JPY,
            to = Currency.USD,
            rate = 0.0067,
            timestamp = timestamp,
        )
        assertEquals(0.0067, rate.rate)
    }

    @Test
    fun create_veryLargeRate() {
        // e.g., 1 USD = 149.50 JPY
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.JPY,
            rate = 149.50,
            timestamp = timestamp,
        )
        assertEquals(149.50, rate.rate)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Invalid creation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun create_zeroRate_throws() {
        assertFailsWith<IllegalArgumentException> {
            ExchangeRate(
                from = Currency.USD,
                to = Currency.EUR,
                rate = 0.0,
                timestamp = timestamp,
            )
        }
    }

    @Test
    fun create_negativeRate_throws() {
        assertFailsWith<IllegalArgumentException> {
            ExchangeRate(
                from = Currency.USD,
                to = Currency.EUR,
                rate = -0.92,
                timestamp = timestamp,
            )
        }
    }

    @Test
    fun create_sameCurrency_throws() {
        assertFailsWith<IllegalArgumentException> {
            ExchangeRate(
                from = Currency.USD,
                to = Currency.USD,
                rate = 1.0,
                timestamp = timestamp,
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Inverse rate
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun inverse_swapsCurrencies() {
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.EUR,
            rate = 0.92,
            timestamp = timestamp,
        )
        val inv = rate.inverse
        assertEquals(Currency.EUR, inv.from)
        assertEquals(Currency.USD, inv.to)
    }

    @Test
    fun inverse_calculatesReciprocalRate() {
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.EUR,
            rate = 2.0,
            timestamp = timestamp,
        )
        val inv = rate.inverse
        assertEquals(0.5, inv.rate, 1e-10)
    }

    @Test
    fun inverse_preservesTimestamp() {
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.EUR,
            rate = 0.92,
            timestamp = timestamp,
        )
        assertEquals(timestamp, rate.inverse.timestamp)
    }

    @Test
    fun inverse_roundTrip() {
        // Inverting twice should get back close to original rate
        val rate = ExchangeRate(
            from = Currency.USD,
            to = Currency.EUR,
            rate = 0.92,
            timestamp = timestamp,
        )
        val roundTrip = rate.inverse.inverse
        assertEquals(rate.from, roundTrip.from)
        assertEquals(rate.to, roundTrip.to)
        assertEquals(rate.rate, roundTrip.rate, 1e-10)
    }

    @Test
    fun inverse_verySmallRate() {
        val rate = ExchangeRate(
            from = Currency.JPY,
            to = Currency.USD,
            rate = 0.0067,
            timestamp = timestamp,
        )
        val inv = rate.inverse
        assertEquals(1.0 / 0.0067, inv.rate, 1e-6)
    }
}
