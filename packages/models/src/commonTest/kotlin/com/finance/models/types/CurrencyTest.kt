// SPDX-License-Identifier: BUSL-1.1

package com.finance.models.types

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Tests for [Currency] — ISO 4217 currency code wrapper.
 *
 * Validates code format enforcement, decimal-place lookup, and companion constants.
 */
class CurrencyTest {

    // ── Construction — valid codes ──────────────────────────────────────

    @Test
    fun constructWithValidThreeLetterCode() {
        val currency = Currency("USD")
        assertEquals("USD", currency.code)
    }

    @Test
    fun constructWithEUR() {
        assertEquals("EUR", Currency("EUR").code)
    }

    @Test
    fun constructWithGBP() {
        assertEquals("GBP", Currency("GBP").code)
    }

    @Test
    fun constructWithJPY() {
        assertEquals("JPY", Currency("JPY").code)
    }

    @Test
    fun constructWithBHD() {
        assertEquals("BHD", Currency("BHD").code)
    }

    @Test
    fun constructWithCAD() {
        assertEquals("CAD", Currency("CAD").code)
    }

    // ── Construction — invalid codes ────────────────────────────────────

    @Test
    fun rejectLowercaseCode() {
        assertFailsWith<IllegalArgumentException> {
            Currency("usd")
        }
    }

    @Test
    fun rejectMixedCaseCode() {
        assertFailsWith<IllegalArgumentException> {
            Currency("Usd")
        }
    }

    @Test
    fun rejectTwoLetterCode() {
        assertFailsWith<IllegalArgumentException> {
            Currency("US")
        }
    }

    @Test
    fun rejectFourLetterCode() {
        assertFailsWith<IllegalArgumentException> {
            Currency("USDT")
        }
    }

    @Test
    fun rejectEmptyString() {
        assertFailsWith<IllegalArgumentException> {
            Currency("")
        }
    }

    @Test
    fun rejectSingleCharacter() {
        assertFailsWith<IllegalArgumentException> {
            Currency("U")
        }
    }

    @Test
    fun rejectCodeWithDigits() {
        assertFailsWith<IllegalArgumentException> {
            Currency("US1")
        }
    }

    @Test
    fun rejectCodeWithSpaces() {
        assertFailsWith<IllegalArgumentException> {
            Currency("U S")
        }
    }

    @Test
    fun rejectCodeWithSpecialChars() {
        assertFailsWith<IllegalArgumentException> {
            Currency("US$")
        }
    }

    // ── Decimal places ──────────────────────────────────────────────────

    @Test
    fun usdHasTwoDecimalPlaces() {
        assertEquals(2, Currency.USD.decimalPlaces)
    }

    @Test
    fun eurHasTwoDecimalPlaces() {
        assertEquals(2, Currency.EUR.decimalPlaces)
    }

    @Test
    fun gbpHasTwoDecimalPlaces() {
        assertEquals(2, Currency.GBP.decimalPlaces)
    }

    @Test
    fun cadHasTwoDecimalPlaces() {
        assertEquals(2, Currency.CAD.decimalPlaces)
    }

    @Test
    fun jpyHasZeroDecimalPlaces() {
        assertEquals(0, Currency.JPY.decimalPlaces)
    }

    @Test
    fun krwHasZeroDecimalPlaces() {
        assertEquals(0, Currency("KRW").decimalPlaces)
    }

    @Test
    fun vndHasZeroDecimalPlaces() {
        assertEquals(0, Currency("VND").decimalPlaces)
    }

    @Test
    fun bhdHasThreeDecimalPlaces() {
        assertEquals(3, Currency("BHD").decimalPlaces)
    }

    @Test
    fun kwdHasThreeDecimalPlaces() {
        assertEquals(3, Currency("KWD").decimalPlaces)
    }

    @Test
    fun omrHasThreeDecimalPlaces() {
        assertEquals(3, Currency("OMR").decimalPlaces)
    }

    @Test
    fun unknownCurrencyDefaultsToTwoDecimalPlaces() {
        // Any valid 3-letter code not in the explicit lists defaults to 2
        assertEquals(2, Currency("XYZ").decimalPlaces)
    }

    // ── Companion constants ─────────────────────────────────────────────

    @Test
    fun companionUsd() {
        assertEquals(Currency("USD"), Currency.USD)
    }

    @Test
    fun companionEur() {
        assertEquals(Currency("EUR"), Currency.EUR)
    }

    @Test
    fun companionGbp() {
        assertEquals(Currency("GBP"), Currency.GBP)
    }

    @Test
    fun companionJpy() {
        assertEquals(Currency("JPY"), Currency.JPY)
    }

    @Test
    fun companionCad() {
        assertEquals(Currency("CAD"), Currency.CAD)
    }

    // ── Equality (value class) ──────────────────────────────────────────

    @Test
    fun equalityByCode() {
        assertEquals(Currency("USD"), Currency("USD"))
    }

    @Test
    fun inequalityByCode() {
        assertTrue(Currency("USD") != Currency("EUR"))
    }
}
