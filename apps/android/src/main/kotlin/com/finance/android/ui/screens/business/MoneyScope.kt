// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business

/**
 * The business-vs-personal dimension that can be attached to accounts,
 * categories, budgets, and transactions (#2182).
 *
 * A single app is used for both the household and the food truck, so every
 * money movement is classified so reports can answer "how is the truck doing?"
 * independently from "how is my household doing?".
 */
enum class MoneyScope(
    /** Stable persistence/analytics key — safe to log (no PII). */
    val id: String,
    /** Short user-facing label. */
    val label: String,
    /** TalkBack content description. */
    val contentDescription: String,
) {
    /** Money that belongs to the business (the food truck). */
    BUSINESS(
        id = "business",
        label = "Business",
        contentDescription = "Business money — the food truck",
    ),

    /** Money that belongs to the household / personal life. */
    PERSONAL(
        id = "personal",
        label = "Personal",
        contentDescription = "Personal money — the household",
    ),

    /**
     * A transaction that mixes both, e.g. propane bought on the same card as
     * home groceries. Split items are flagged for later cleanup.
     */
    SPLIT(
        id = "split",
        label = "Split",
        contentDescription = "Split money — mixed business and personal",
    ),
    ;

    companion object {
        /** Lookup by stable [id]; `null` when unknown (e.g. stale persisted key). */
        fun fromId(id: String): MoneyScope? = entries.firstOrNull { it.id == id }
    }
}

/**
 * A filter applied to dashboards, analytics, and the report builder so the
 * user can view a combined picture or narrow to a single scope (#2182).
 */
enum class ScopeFilter(
    val id: String,
    val label: String,
    val contentDescription: String,
) {
    ALL("all", "Combined", "Show combined business and personal"),
    BUSINESS_ONLY("business_only", "Business only", "Show business money only"),
    PERSONAL_ONLY("personal_only", "Personal only", "Show personal money only"),
    ;

    /**
     * Whether a transaction tagged with [scope] should be included under this
     * filter. [MoneyScope.SPLIT] always shows because part of it belongs to
     * whichever side is being viewed.
     */
    fun includes(scope: MoneyScope): Boolean = when (this) {
        ALL -> true
        BUSINESS_ONLY -> scope == MoneyScope.BUSINESS || scope == MoneyScope.SPLIT
        PERSONAL_ONLY -> scope == MoneyScope.PERSONAL || scope == MoneyScope.SPLIT
    }
}
