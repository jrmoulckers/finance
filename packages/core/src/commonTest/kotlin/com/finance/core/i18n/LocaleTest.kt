// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

import kotlin.test.*

class LocaleTest {

    @Test
    fun languageOnlyLocaleIsValid() {
        val locale = Locale("en")
        assertEquals("en", locale.language)
        assertNull(locale.region)
        assertEquals("en", locale.tag)
    }

    @Test
    fun languageAndRegionLocaleIsValid() {
        val locale = Locale("en-US")
        assertEquals("en", locale.language)
        assertEquals("US", locale.region)
    }

    @Test
    fun languageIsNormalizedToLowercase() {
        val locale = Locale("EN")
        assertEquals("en", locale.language)
    }

    @Test
    fun regionIsNormalizedToUppercase() {
        val locale = Locale("en-us")
        assertEquals("en", locale.language)
        assertEquals("US", locale.region)
    }

    @Test
    fun blankTagIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            Locale("")
        }
    }

    @Test
    fun singleCharTagIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            Locale("e")
        }
    }

    @Test
    fun threePartTagIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            Locale("en-US-CA")
        }
    }

    @Test
    fun numericTagIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            Locale("12")
        }
    }

    @Test
    fun languageOnlyReturnsItselfWhenNoRegion() {
        val locale = Locale("es")
        assertSame(locale, locale.languageOnly())
    }

    @Test
    fun languageOnlyStripsRegion() {
        val locale = Locale("es-MX")
        val langOnly = locale.languageOnly()
        assertEquals("es", langOnly.tag)
        assertNull(langOnly.region)
    }

    @Test
    fun predefinedLocalesExist() {
        assertEquals("en", Locale.EN.tag)
        assertEquals("en-US", Locale.EN_US.tag)
        assertEquals("es-MX", Locale.ES_MX.tag)
        assertEquals("pt-BR", Locale.PT_BR.tag)
        assertEquals("ja", Locale.JA.tag)
    }

    @Test
    fun toStringReturnsTag() {
        assertEquals("fr-CA", Locale.FR_CA.toString())
    }
}

class StringKeyTest {

    @Test
    fun validKeyIsAccepted() {
        val key = StringKey("budget.remaining")
        assertEquals("budget.remaining", key.value)
    }

    @Test
    fun keyWithUnderscoreIsAccepted() {
        val key = StringKey("account.type.credit_card")
        assertEquals("account.type.credit_card", key.value)
    }

    @Test
    fun blankKeyIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            StringKey("")
        }
    }

    @Test
    fun keyStartingWithDotIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            StringKey(".budget")
        }
    }

    @Test
    fun keyWithUppercaseIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            StringKey("Budget.remaining")
        }
    }

    @Test
    fun keyStartingWithNumberIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            StringKey("1budget")
        }
    }
}
