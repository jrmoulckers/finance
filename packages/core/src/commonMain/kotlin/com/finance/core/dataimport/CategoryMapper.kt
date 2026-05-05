// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import kotlinx.serialization.Serializable

/**
 * Maps imported category names to Finance app category IDs.
 *
 * During import, source files use their own category taxonomies (e.g., Mint's
 * "Fast Food", YNAB's "Immediate Obligations: Rent/Mortgage"). This mapper
 * translates those names to the user's existing Finance app categories using
 * exact matches, keyword matching, and a user-configurable override table.
 */
object CategoryMapper {

    /**
     * A single mapping from a source category name to an app category ID.
     *
     * @property sourceCategory The category name from the imported file.
     * @property targetCategoryId The Finance app category ID to map to, or `null` if unmapped.
     * @property confidence Matching confidence in `[0.0, 1.0]`.
     * @property isUserOverride `true` if this mapping was set by the user (not auto-detected).
     */
    @Serializable
    data class CategoryMappingEntry(
        val sourceCategory: String,
        val targetCategoryId: String? = null,
        val confidence: Double = 0.0,
        val isUserOverride: Boolean = false,
    )

    /**
     * Result of category mapping for a batch of imported transactions.
     *
     * @property mappings All resolved mappings.
     * @property unmappedCategories Source categories with no match found.
     * @property mappedCount Number of categories successfully mapped.
     */
    @Serializable
    data class CategoryMappingResult(
        val mappings: List<CategoryMappingEntry>,
        val unmappedCategories: List<String>,
        val mappedCount: Int,
    )

    /**
     * An app category available for matching.
     *
     * @property id The category's unique ID.
     * @property name The display name.
     * @property parentName Optional parent category name for hierarchical matching.
     */
    data class AppCategory(
        val id: String,
        val name: String,
        val parentName: String? = null,
    )

    /**
     * Map a list of source category names to app categories.
     *
     * Matching strategy (in priority order):
     * 1. User overrides (from [userOverrides]).
     * 2. Exact case-insensitive name match.
     * 3. Keyword/substring match (partial overlap).
     *
     * @param sourceCategories Distinct category names from the imported file.
     * @param appCategories Available categories in the Finance app.
     * @param userOverrides User-configured mappings that take priority.
     * @return [CategoryMappingResult] with all mappings and diagnostics.
     */
    fun map(
        sourceCategories: List<String>,
        appCategories: List<AppCategory>,
        userOverrides: Map<String, String> = emptyMap(),
    ): CategoryMappingResult {
        val mappings = mutableListOf<CategoryMappingEntry>()
        val unmapped = mutableListOf<String>()

        for (source in sourceCategories) {
            // 1. Check user overrides first
            val overrideId = userOverrides[source]
            if (overrideId != null) {
                mappings.add(CategoryMappingEntry(source, overrideId, 1.0, isUserOverride = true))
                continue
            }

            // 2. Exact match (case-insensitive)
            val exactMatch = appCategories.firstOrNull {
                it.name.equals(source, ignoreCase = true)
            }
            if (exactMatch != null) {
                mappings.add(CategoryMappingEntry(source, exactMatch.id, 1.0))
                continue
            }

            // 3. Keyword/substring match
            val keywordMatch = findKeywordMatch(source, appCategories)
            if (keywordMatch != null) {
                mappings.add(CategoryMappingEntry(source, keywordMatch.first, keywordMatch.second))
                continue
            }

            // No match found
            mappings.add(CategoryMappingEntry(source, null, 0.0))
            unmapped.add(source)
        }

        return CategoryMappingResult(
            mappings = mappings,
            unmappedCategories = unmapped,
            mappedCount = mappings.count { it.targetCategoryId != null },
        )
    }

    /**
     * Well-known category synonyms for cross-app matching.
     *
     * Maps normalised keywords to canonical category concepts.
     */
    private val CATEGORY_SYNONYMS: Map<String, List<String>> = mapOf(
        "groceries" to listOf("grocery", "supermarket", "food & drink", "food"),
        "restaurants" to listOf("dining", "eating out", "fast food", "restaurant", "food & drink"),
        "transportation" to listOf("transport", "gas", "fuel", "auto", "car", "uber", "lyft", "transit"),
        "utilities" to listOf("utility", "electric", "water", "internet", "phone", "cell"),
        "entertainment" to listOf("fun", "movies", "games", "music", "streaming", "subscription"),
        "shopping" to listOf("clothing", "clothes", "electronics", "amazon", "general merchandise"),
        "healthcare" to listOf("health", "medical", "doctor", "pharmacy", "insurance"),
        "housing" to listOf("rent", "mortgage", "home", "property"),
        "income" to listOf("salary", "wages", "paycheck", "bonus", "interest"),
        "transfer" to listOf("payment", "credit card payment"),
    )

    /**
     * Find a keyword-based match for a source category.
     *
     * @return Pair of (categoryId, confidence) or null if no match.
     */
    private fun findKeywordMatch(
        source: String,
        appCategories: List<AppCategory>,
    ): Pair<String, Double>? {
        val normalised = source.lowercase().trim()

        // Check if the source category is a substring of any app category or vice versa
        for (cat in appCategories) {
            val catNorm = cat.name.lowercase()
            if (normalised.contains(catNorm) || catNorm.contains(normalised)) {
                return cat.id to 0.7
            }
        }

        // Check synonym mappings
        for ((canonical, synonyms) in CATEGORY_SYNONYMS) {
            if (synonyms.any { normalised.contains(it) } || normalised.contains(canonical)) {
                // Find an app category matching the canonical name or synonyms
                val match = appCategories.firstOrNull { cat ->
                    val catNorm = cat.name.lowercase()
                    catNorm.contains(canonical) || synonyms.any { catNorm.contains(it) }
                }
                if (match != null) return match.id to 0.5
            }
        }

        return null
    }
}
