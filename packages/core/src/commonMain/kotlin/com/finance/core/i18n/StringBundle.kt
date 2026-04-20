// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

/**
 * Type-safe key for a localized string resource.
 *
 * Keys use dot-separated namespaces matching the domain model
 * (e.g., "budget.status.over", "transaction.type.expense").
 * Centralizing keys prevents typos and enables IDE navigation.
 */
data class StringKey(val value: String) {
    init {
        require(value.isNotBlank()) { "StringKey cannot be blank" }
        require(value.matches(KEY_PATTERN)) {
            "StringKey must be dot-separated lowercase identifiers, got: $value"
        }
    }

    companion object {
        private val KEY_PATTERN = Regex("^[a-z][a-z0-9]*([._][a-z][a-z0-9]*)*$")
    }
}

/**
 * A bundle of localized strings for a single [Locale].
 *
 * Immutable map from [StringKey] to translated text. Platform apps
 * load bundles from their native resource systems (Android strings.xml,
 * iOS .lproj, web JSON) and register them with [StringProvider].
 */
data class StringBundle(
    val locale: Locale,
    val strings: Map<StringKey, String>,
) {
    /** Number of translated strings in this bundle. */
    val size: Int get() = strings.size

    /** Get a translated string by key, or null if not present. */
    operator fun get(key: StringKey): String? = strings[key]

    /** Whether this bundle contains a translation for the given key. */
    fun contains(key: StringKey): Boolean = key in strings
}
