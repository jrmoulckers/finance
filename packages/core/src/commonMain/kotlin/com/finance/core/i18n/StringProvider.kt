// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.Flow

/**
 * Multiplatform string localization provider.
 *
 * Resolves translated strings using a fallback chain:
 * 1. Exact locale match (e.g., "es-MX")
 * 2. Language-only fallback (e.g., "es")
 * 3. Default locale (English)
 * 4. Key value as-is (developer-visible signal that a translation is missing)
 *
 * Thread-safe: backed by [MutableStateFlow] with atomic updates.
 *
 * ## Usage
 * ```kotlin
 * val provider = StringProvider()
 * provider.registerBundle(enBundle)
 * provider.registerBundle(esBundle)
 * provider.setLocale(Locale.ES_MX)
 *
 * val label = provider.get(Strings.BUDGET_OVER) // "Presupuesto excedido"
 * ```
 */
class StringProvider(
    defaultLocale: Locale = Locale.DEFAULT,
) {
    private val _currentLocale = MutableStateFlow(defaultLocale)
    private val _bundles = MutableStateFlow<Map<Locale, StringBundle>>(emptyMap())

    /** The currently active locale. */
    val currentLocale: StateFlow<Locale> = _currentLocale.asStateFlow()

    /** All registered bundles. */
    val bundles: StateFlow<Map<Locale, StringBundle>> = _bundles.asStateFlow()

    /** Available locales (those with registered bundles). */
    val availableLocales: List<Locale> get() = _bundles.value.keys.toList()

    /**
     * Change the active locale. Triggers re-evaluation of all observed strings.
     */
    fun setLocale(locale: Locale) {
        _currentLocale.value = locale
    }

    /**
     * Register a string bundle for a locale. Replaces any existing bundle
     * for the same locale.
     */
    fun registerBundle(bundle: StringBundle) {
        _bundles.value = _bundles.value + (bundle.locale to bundle)
    }

    /**
     * Register multiple bundles at once.
     */
    fun registerBundles(bundles: List<StringBundle>) {
        _bundles.value = _bundles.value + bundles.associateBy { it.locale }
    }

    /**
     * Resolve a string key using the current locale and fallback chain.
     *
     * @param key The string key to look up.
     * @return The translated string, or the key's value if no translation found.
     */
    fun get(key: StringKey): String {
        return resolve(key, _currentLocale.value)
    }

    /**
     * Resolve a string key with positional argument substitution.
     *
     * Placeholders use `{0}`, `{1}`, etc. format:
     * ```kotlin
     * // Bundle: "budget.remaining" -> "You have {0} remaining in {1}"
     * provider.get(key, "$45.00", "Groceries")
     * // → "You have $45.00 remaining in Groceries"
     * ```
     */
    fun get(key: StringKey, vararg args: String): String {
        var result = resolve(key, _currentLocale.value)
        args.forEachIndexed { index, arg ->
            result = result.replace("{$index}", arg)
        }
        return result
    }

    /**
     * Resolve a string for a specific locale (bypasses current locale).
     */
    fun getForLocale(key: StringKey, locale: Locale): String {
        return resolve(key, locale)
    }

    /**
     * Observe a string key reactively. Re-emits when locale or bundles change.
     */
    fun observe(key: StringKey): Flow<String> {
        return _currentLocale.map { locale -> resolve(key, locale) }
    }

    /**
     * Clear all registered bundles (e.g., for testing or locale hot-reload).
     */
    fun clearBundles() {
        _bundles.value = emptyMap()
    }

    // ── Resolution logic ─────────────────────────────────────────────

    @Suppress("ReturnCount")
    private fun resolve(key: StringKey, locale: Locale): String {
        val bundleMap = _bundles.value

        // 1. Exact locale match (e.g., "es-MX")
        bundleMap[locale]?.get(key)?.let { return it }

        // 2. Language-only fallback (e.g., "es")
        if (locale.region != null) {
            val langOnly = locale.languageOnly()
            bundleMap[langOnly]?.get(key)?.let { return it }
        }

        // 3. Default locale fallback
        if (locale != Locale.DEFAULT) {
            bundleMap[Locale.DEFAULT]?.get(key)?.let { return it }
        }

        // 4. Key value as-is (missing translation signal)
        return key.value
    }
}
