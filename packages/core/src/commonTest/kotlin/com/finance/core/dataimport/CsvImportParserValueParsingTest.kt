// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.*

class CsvImportParserValueParsingTest {

    // ═════════════════════════════════════════════════════════════════
    // parseCentsFromDisplay
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseCentsFromDisplay_simpleDecimal_usd() {
        val result = CsvImportParser.parseCentsFromDisplay("12.50", Currency.USD)
        assertEquals(Cents(1250), result)
    }

    @Test
    fun parseCentsFromDisplay_negative_usd() {
        val result = CsvImportParser.parseCentsFromDisplay("-3.50", Currency.USD)
        assertEquals(Cents(-350), result)
    }

    @Test
    fun parseCentsFromDisplay_wholeNumber_usd() {
        val result = CsvImportParser.parseCentsFromDisplay("100", Currency.USD)
        assertEquals(Cents(10000), result)
    }

    @Test
    fun parseCentsFromDisplay_zeroDecimals_jpy() {
        val result = CsvImportParser.parseCentsFromDisplay("1000", Currency.JPY)
        assertEquals(Cents(1000), result)
    }

    @Test
    fun parseCentsFromDisplay_null_returnsZero() {
        val result = CsvImportParser.parseCentsFromDisplay(null, Currency.USD)
        assertEquals(Cents.ZERO, result)
    }

    @Test
    fun parseCentsFromDisplay_blank_returnsZero() {
        val result = CsvImportParser.parseCentsFromDisplay("  ", Currency.USD)
        assertEquals(Cents.ZERO, result)
    }

    @Test
    fun parseCentsFromDisplay_singleDecimalPlace_padded() {
        val result = CsvImportParser.parseCentsFromDisplay("12.5", Currency.USD)
        assertEquals(Cents(1250), result)
    }

    @Test
    fun parseCentsFromDisplay_commasStripped() {
        val result = CsvImportParser.parseCentsFromDisplay("1,250.00", Currency.USD)
        assertEquals(Cents(125000), result)
    }

    // ═════════════════════════════════════════════════════════════════
    // parseAmountToCents
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseAmountToCents_dollarSign() {
        val result = CsvImportParser.parseAmountToCents("$25.99", Currency.USD)
        assertEquals(Cents(2599), result)
    }

    @Test
    fun parseAmountToCents_euroSign() {
        val result = CsvImportParser.parseAmountToCents("€10.00", Currency.EUR)
        assertEquals(Cents(1000), result)
    }

    @Test
    fun parseAmountToCents_parenthesesNegative() {
        val result = CsvImportParser.parseAmountToCents("(15.75)", Currency.USD)
        assertEquals(Cents(-1575), result)
    }

    @Test
    fun parseAmountToCents_invalidString_returnsNull() {
        val result = CsvImportParser.parseAmountToCents("not-a-number", Currency.USD)
        assertNull(result)
    }

    @Test
    fun parseAmountToCents_emptyString_returnsNull() {
        val result = CsvImportParser.parseAmountToCents("", Currency.USD)
        assertNull(result)
    }

    // ═════════════════════════════════════════════════════════════════
    // parseCurrency
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseCurrency_validCode() {
        val result = CsvImportParser.parseCurrency("USD")
        assertEquals(Currency.USD, result)
    }

    @Test
    fun parseCurrency_lowercaseNormalized() {
        val result = CsvImportParser.parseCurrency("eur")
        assertEquals(Currency.EUR, result)
    }

    @Test
    fun parseCurrency_null_returnsNull() {
        val result = CsvImportParser.parseCurrency(null)
        assertNull(result)
    }

    @Test
    fun parseCurrency_blank_returnsNull() {
        val result = CsvImportParser.parseCurrency("  ")
        assertNull(result)
    }

    @Test
    fun parseCurrency_invalidCode_returnsNull() {
        val result = CsvImportParser.parseCurrency("INVALID")
        assertNull(result)
    }

    // ═════════════════════════════════════════════════════════════════
    // buildColumnIndex
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun buildColumnIndex_createsLowercaseMap() {
        val index = CsvImportParser.buildColumnIndex(listOf("ID", "Name", "TYPE"))
        assertEquals(0, index["id"])
        assertEquals(1, index["name"])
        assertEquals(2, index["type"])
    }

    @Test
    fun buildColumnIndex_trimsWhitespace() {
        val index = CsvImportParser.buildColumnIndex(listOf(" id ", " name "))
        assertEquals(0, index["id"])
        assertEquals(1, index["name"])
    }

    @Test
    fun buildColumnIndex_emptyHeaders() {
        val index = CsvImportParser.buildColumnIndex(emptyList())
        assertTrue(index.isEmpty())
    }
}
