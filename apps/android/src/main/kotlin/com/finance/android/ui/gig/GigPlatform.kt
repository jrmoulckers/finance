// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

/**
 * Known gig-economy platforms a multi-app driver might earn on (#2133).
 *
 * Multi-app drivers receive dozens of small deposits from many apps. To make those legible we
 * classify each income transaction by matching its payee / note against a set of case-insensitive
 * keywords. All matching is pure and deterministic so it can be exhaustively unit-tested on the
 * JVM without Android dependencies.
 *
 * @property displayName human-readable label shown in the UI.
 * @property keywords lowercase substrings that identify this platform in a payee or note.
 */
enum class GigPlatform(
    val displayName: String,
    val keywords: List<String>,
) {
    UBER("Uber", listOf("uber")),
    UBER_EATS("Uber Eats", listOf("uber eats", "ubereats")),
    LYFT("Lyft", listOf("lyft")),
    DOORDASH("DoorDash", listOf("doordash", "dasher")),
    INSTACART("Instacart", listOf("instacart", "maplebear")),
    GRUBHUB("Grubhub", listOf("grubhub", "seamless")),
    AMAZON_FLEX("Amazon Flex", listOf("amazon flex", "amzn flex")),
    SPARK("Spark Driver", listOf("spark")),
    OTHER("Other", emptyList());

    companion object {
        /**
         * All real platforms, in menu order, excluding the [OTHER] catch-all. Ordered so that
         * [UBER_EATS] is evaluated before [UBER] (otherwise "uber eats" matches "uber" first).
         */
        val knownPlatforms: List<GigPlatform> =
            listOf(UBER_EATS, UBER, LYFT, DOORDASH, INSTACART, GRUBHUB, AMAZON_FLEX, SPARK)

        /**
         * Classifies a payout by matching [payee] and [note] (case-insensitive) against known
         * platform keywords. Returns `null` when nothing matches so callers can decide how to
         * bucket unrecognized income.
         */
        fun fromPayee(payee: String?, note: String? = null): GigPlatform? {
            val haystack = listOfNotNull(payee, note).joinToString(" ").lowercase().trim()
            if (haystack.isEmpty()) return null
            return knownPlatforms.firstOrNull { platform ->
                platform.keywords.any { keyword -> haystack.contains(keyword) }
            }
        }

        /**
         * Resolves a stored [GigPlatform.name] back to its enum value, falling back to [OTHER]
         * for unknown or null values. Used when rehydrating persisted shifts.
         */
        fun fromNameOrOther(name: String?): GigPlatform =
            entries.firstOrNull { it.name == name } ?: OTHER
    }
}
