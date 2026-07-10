// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Currency
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Regression guard for #3736: the app previously carried **three** divergent
 * sources of currency decimal-place metadata (Currency.decimalPlaces, the
 * MultiCurrencyEngine catalog, and CurrencyFormatter's own map), which drifted
 * out of sync (e.g. CLP was treated as 2-decimal in some paths and 0 in
 * others). These tests pin every source to the single canonical
 * [Currency.decimalPlaces].
 */
class CurrencyMetadataConsistencyTest {

    @Test
    fun catalog_decimalPlaces_matchCanonicalCurrency() {
        for ((code, def) in CurrencyCatalog.all) {
            assertEquals(
                Currency(code).decimalPlaces,
                def.decimalPlaces,
                "CurrencyCatalog[$code].decimalPlaces disagrees with Currency.decimalPlaces",
            )
        }
    }

    @Test
    fun engineCatalog_decimalPlaces_matchCanonicalCurrency() {
        for ((code, info) in MultiCurrencyEngine.currencyCatalog) {
            assertEquals(
                Currency(code).decimalPlaces,
                info.decimalPlaces,
                "MultiCurrencyEngine.currencyCatalog[$code].decimalPlaces disagrees with Currency",
            )
        }
    }

    @Test
    fun engineCatalog_isDerivedFromCanonicalCatalog() {
        // The engine catalog must expose exactly the canonical catalog's codes
        // (it is derived from it), so nothing can silently fall out of sync.
        assertEquals(CurrencyCatalog.all.keys, MultiCurrencyEngine.currencyCatalog.keys)
    }

    @Test
    fun clp_isZeroDecimal_everywhere() {
        // CLP (Chilean Peso) has no minor unit; this was the concrete drift bug.
        assertEquals(0, Currency("CLP").decimalPlaces)
        assertEquals(0, CurrencyCatalog.get("CLP")!!.decimalPlaces)
        assertEquals(0, MultiCurrencyEngine.currencyCatalog["CLP"]!!.decimalPlaces)
    }

    @Test
    fun zeroDecimalCurrencies_areConsistent() {
        for (code in listOf("JPY", "KRW", "CLP", "VND")) {
            assertEquals(0, Currency(code).decimalPlaces, "$code should be zero-decimal")
        }
    }

    @Test
    fun threeDecimalCurrencies_areConsistent() {
        for (code in listOf("BHD", "KWD", "OMR")) {
            assertEquals(3, Currency(code).decimalPlaces, "$code should be three-decimal")
            assertEquals(3, CurrencyCatalog.get(code)!!.decimalPlaces)
        }
    }

    @Test
    fun catalog_hasNoBlankSymbolsOrNames() {
        for ((code, def) in CurrencyCatalog.all) {
            assertTrue(def.symbol.isNotBlank(), "$code has a blank symbol")
            assertTrue(def.name.isNotBlank(), "$code has a blank name")
        }
    }
}
