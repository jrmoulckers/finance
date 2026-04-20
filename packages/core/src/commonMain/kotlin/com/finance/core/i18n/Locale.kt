// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

import kotlinx.serialization.Serializable

/**
 * BCP 47 locale tag wrapper with validation.
 *
 * Wraps a locale identifier string (e.g., "en", "en-US", "pt-BR") and
 * exposes parsed components. Uses the simplified BCP 47 subset:
 * `language[-region]` (no script, variant, or extension subtags).
 *
 * @property tag The full locale tag (e.g., "en-US").
 */
@Serializable
data class Locale(val tag: String) {

    /** Two-letter ISO 639-1 language code (always lowercase). */
    val language: String

    /** Optional two-letter ISO 3166-1 region code (always uppercase), or null. */
    val region: String?

    init {
        require(tag.isNotBlank()) { "Locale tag cannot be blank" }
        require(tag.matches(TAG_PATTERN)) {
            "Locale tag must match 'xx' or 'xx-YY' format, got: $tag"
        }
        val parts = tag.split("-")
        language = parts[0].lowercase()
        region = parts.getOrNull(1)?.uppercase()
    }

    /** Returns the language-only locale (e.g., "en-US" → Locale("en")). */
    fun languageOnly(): Locale = if (region == null) this else Locale(language)

    override fun toString(): String = tag

    companion object {
        /** Pattern: 2-letter language, optional hyphen + 2-letter region. */
        private val TAG_PATTERN = Regex("^[a-zA-Z]{2}(-[a-zA-Z]{2})?$")

        val EN = Locale("en")
        val EN_US = Locale("en-US")
        val EN_GB = Locale("en-GB")
        val ES = Locale("es")
        val ES_MX = Locale("es-MX")
        val FR = Locale("fr")
        val FR_CA = Locale("fr-CA")
        val DE = Locale("de")
        val PT_BR = Locale("pt-BR")
        val JA = Locale("ja")
        val ZH_CN = Locale("zh-CN")

        /** Default fallback locale. */
        val DEFAULT = EN
    }
}
