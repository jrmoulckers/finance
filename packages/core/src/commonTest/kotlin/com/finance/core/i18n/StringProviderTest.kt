// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

import kotlin.test.*

class StringProviderTest {

    private lateinit var provider: StringProvider

    private val enBundle = StringBundle(
        locale = Locale.EN,
        strings = mapOf(
            StringKey("general.ok") to "OK",
            StringKey("general.cancel") to "Cancel",
            StringKey("budget.remaining_fmt") to "{0} remaining in {1}",
            StringKey("error.network") to "Network error",
        ),
    )

    private val esBundle = StringBundle(
        locale = Locale.ES,
        strings = mapOf(
            StringKey("general.ok") to "Aceptar",
            StringKey("general.cancel") to "Cancelar",
            StringKey("budget.remaining_fmt") to "{0} restante en {1}",
        ),
    )

    private val esMxBundle = StringBundle(
        locale = Locale.ES_MX,
        strings = mapOf(
            StringKey("general.ok") to "OK",
            // cancel not overridden — should fall back to "es"
        ),
    )

    @BeforeTest
    fun setUp() {
        provider = StringProvider()
        provider.registerBundle(enBundle)
        provider.registerBundle(esBundle)
        provider.registerBundle(esMxBundle)
    }

    // ── Basic resolution ─────────────────────────────────────────────

    @Test
    fun resolveFromDefaultLocale() {
        provider.setLocale(Locale.EN)
        assertEquals("OK", provider.get(StringKey("general.ok")))
        assertEquals("Cancel", provider.get(StringKey("general.cancel")))
    }

    @Test
    fun resolveFromExactLocale() {
        provider.setLocale(Locale.ES)
        assertEquals("Aceptar", provider.get(StringKey("general.ok")))
    }

    // ── Fallback chain ───────────────────────────────────────────────

    @Test
    fun fallbackFromRegionToLanguage() {
        provider.setLocale(Locale.ES_MX)
        // "general.cancel" not in es-MX bundle, falls back to es bundle
        assertEquals("Cancelar", provider.get(StringKey("general.cancel")))
    }

    @Test
    fun fallbackFromLanguageToDefault() {
        provider.setLocale(Locale.ES)
        // "error.network" not in es bundle, falls back to en (default)
        assertEquals("Network error", provider.get(StringKey("error.network")))
    }

    @Test
    fun fallbackFromRegionToLanguageToDefault() {
        provider.setLocale(Locale.ES_MX)
        // "error.network" not in es-MX or es, falls back to en
        assertEquals("Network error", provider.get(StringKey("error.network")))
    }

    @Test
    fun missingKeyReturnsKeyValue() {
        provider.setLocale(Locale.EN)
        val key = StringKey("missing.key")
        assertEquals("missing.key", provider.get(key))
    }

    // ── Argument substitution ────────────────────────────────────────

    @Test
    fun argumentSubstitutionWorks() {
        provider.setLocale(Locale.EN)
        val result = provider.get(
            StringKey("budget.remaining_fmt"),
            "$45.00",
            "Groceries",
        )
        assertEquals("$45.00 remaining in Groceries", result)
    }

    @Test
    fun argumentSubstitutionWithLocalizedString() {
        provider.setLocale(Locale.ES)
        val result = provider.get(
            StringKey("budget.remaining_fmt"),
            "$45.00",
            "Comestibles",
        )
        assertEquals("$45.00 restante en Comestibles", result)
    }

    // ── getForLocale ─────────────────────────────────────────────────

    @Test
    fun getForLocaleBypassesCurrentLocale() {
        provider.setLocale(Locale.EN)
        val result = provider.getForLocale(StringKey("general.ok"), Locale.ES)
        assertEquals("Aceptar", result)
    }

    // ── Locale switching ─────────────────────────────────────────────

    @Test
    fun switchingLocaleChangesResolution() {
        provider.setLocale(Locale.EN)
        assertEquals("OK", provider.get(StringKey("general.ok")))

        provider.setLocale(Locale.ES)
        assertEquals("Aceptar", provider.get(StringKey("general.ok")))
    }

    // ── Bundle management ────────────────────────────────────────────

    @Test
    fun availableLocalesReturnsRegisteredLocales() {
        val locales = provider.availableLocales
        assertTrue(Locale.EN in locales)
        assertTrue(Locale.ES in locales)
        assertTrue(Locale.ES_MX in locales)
    }

    @Test
    fun registerBundlesAddsMutiple() {
        val provider = StringProvider()
        provider.registerBundles(listOf(enBundle, esBundle))
        assertEquals(2, provider.availableLocales.size)
    }

    @Test
    fun clearBundlesRemovesAll() {
        provider.clearBundles()
        assertTrue(provider.availableLocales.isEmpty())
        // Should fall through to key value
        assertEquals("general.ok", provider.get(StringKey("general.ok")))
    }

    @Test
    fun registerBundleReplacesExisting() {
        val updatedEn = StringBundle(
            locale = Locale.EN,
            strings = mapOf(
                StringKey("general.ok") to "Okay",
            ),
        )
        provider.registerBundle(updatedEn)
        provider.setLocale(Locale.EN)
        assertEquals("Okay", provider.get(StringKey("general.ok")))
    }

    // ── Default locale ───────────────────────────────────────────────

    @Test
    fun defaultLocaleIsEnglish() {
        val freshProvider = StringProvider()
        assertEquals(Locale.EN, freshProvider.currentLocale.value)
    }

    @Test
    fun customDefaultLocale() {
        val freshProvider = StringProvider(defaultLocale = Locale.ES)
        assertEquals(Locale.ES, freshProvider.currentLocale.value)
    }
}

class EnglishStringsTest {

    @Test
    fun englishBundleHasCorrectLocale() {
        val bundle = EnglishStrings.bundle()
        assertEquals(Locale.EN, bundle.locale)
    }

    @Test
    fun englishBundleContainsAllGeneralKeys() {
        val bundle = EnglishStrings.bundle()
        assertTrue(bundle.contains(Strings.APP_NAME))
        assertTrue(bundle.contains(Strings.OK))
        assertTrue(bundle.contains(Strings.CANCEL))
        assertTrue(bundle.contains(Strings.SAVE))
        assertTrue(bundle.contains(Strings.DELETE))
    }

    @Test
    fun englishBundleContainsTransactionKeys() {
        val bundle = EnglishStrings.bundle()
        assertTrue(bundle.contains(Strings.TRANSACTION_EXPENSE))
        assertTrue(bundle.contains(Strings.TRANSACTION_INCOME))
        assertTrue(bundle.contains(Strings.TRANSACTION_TRANSFER))
    }

    @Test
    fun englishBundleContainsBudgetKeys() {
        val bundle = EnglishStrings.bundle()
        assertTrue(bundle.contains(Strings.BUDGET_REMAINING))
        assertTrue(bundle.contains(Strings.BUDGET_OVER))
        assertTrue(bundle.contains(Strings.BUDGET_PERIOD_MONTHLY))
    }

    @Test
    fun englishBundleContainsGoalKeys() {
        val bundle = EnglishStrings.bundle()
        assertTrue(bundle.contains(Strings.GOAL_STATUS_ACTIVE))
        assertTrue(bundle.contains(Strings.GOAL_STATUS_COMPLETED))
    }

    @Test
    fun englishBundleContainsFormatStrings() {
        val bundle = EnglishStrings.bundle()
        assertTrue(bundle.contains(Strings.BUDGET_REMAINING_FMT))
        assertTrue(bundle.contains(Strings.GOAL_PROGRESS_FMT))
        assertTrue(bundle.contains(Strings.TRANSACTION_SUMMARY_FMT))
    }

    @Test
    fun englishBundleValuesAreNonBlank() {
        val bundle = EnglishStrings.bundle()
        bundle.strings.forEach { (key, value) ->
            assertTrue(value.isNotBlank(), "English value for ${key.value} should not be blank")
        }
    }
}
