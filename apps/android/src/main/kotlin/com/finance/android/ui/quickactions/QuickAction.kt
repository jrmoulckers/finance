// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

/**
 * The catalogue of predictive quick-actions surfaced on the app home and via
 * launcher shortcuts (#2396).
 *
 * Each entry is a stable, navigation-addressable finance task. The [route]
 * mirrors a destination in `FinanceNavHost` so a tapped action deep-links the
 * user straight to the relevant screen without disrupting manual navigation —
 * the bottom bar / drawer remain the canonical way to reach every screen.
 *
 * The [baseWeight] is the cold-start prior used before any local usage history
 * exists. Higher values rank earlier. These priors are intentionally tuned so a
 * brand-new user still sees the most universally useful finance tasks first.
 *
 * IMPORTANT: identifiers here are **action categories only**. They never encode
 * transaction details, amounts, payees, or categories, keeping the on-device
 * ranking signals free of behavioural PII.
 */
enum class QuickActionType(
    /** Stable analytics/persistence key — safe to log (no PII). */
    val id: String,
    /** Short user-facing label. */
    val label: String,
    /** TalkBack content description. */
    val contentDescription: String,
    /** `FinanceNavHost` route this action deep-links to. */
    val route: String,
    /** Material icon name used by the UI layer to resolve a vector. */
    val iconName: String,
    /** Cold-start prior; higher ranks earlier before usage history exists. */
    val baseWeight: Double,
) {
    ADD_EXPENSE(
        id = "add_expense",
        label = "Add expense",
        contentDescription = "Add a new expense transaction",
        route = "transactions/create",
        iconName = "Add",
        baseWeight = 1.0,
    ),
    REVIEW_IMPORTS(
        id = "review_imports",
        label = "Review imports",
        contentDescription = "Review uncategorized imported transactions",
        route = "transactions",
        iconName = "Inbox",
        baseWeight = 0.7,
    ),
    CHECK_BILLS(
        id = "check_bills",
        label = "Upcoming bills",
        contentDescription = "Check upcoming bills and reminders",
        route = "bill-reminders",
        iconName = "EventNote",
        baseWeight = 0.6,
    ),
    ADD_INCOME(
        id = "add_income",
        label = "Add income",
        contentDescription = "Record a new income transaction",
        route = "transactions/create",
        iconName = "AttachMoney",
        baseWeight = 0.4,
    ),
    VIEW_BUDGETS(
        id = "view_budgets",
        label = "Budgets",
        contentDescription = "View your budgets",
        route = "budgets",
        iconName = "PieChart",
        baseWeight = 0.5,
    ),
    VIEW_INSIGHTS(
        id = "view_insights",
        label = "Insights",
        contentDescription = "Open financial insights",
        route = "insights",
        iconName = "Insights",
        baseWeight = 0.3,
    ),
    ;

    companion object {
        /** Lookup by stable [id]; `null` when unknown (e.g. stale persisted key). */
        fun fromId(id: String): QuickActionType? = entries.firstOrNull { it.id == id }
    }
}

/**
 * A ranked quick-action ready for rendering.
 *
 * @property type The underlying action category.
 * @property score The deterministic ranking score (higher = more likely).
 * @property pinned Whether the user pinned this action (always surfaced first).
 * @property reason A short, non-PII explanation of why it ranked where it did
 *   (used for telemetry context and optional UI affordances).
 */
data class RankedQuickAction(
    val type: QuickActionType,
    val score: Double,
    val pinned: Boolean,
    val reason: RankReason,
)

/**
 * Why an action surfaced — aggregate, non-behavioural signal categories only.
 */
enum class RankReason {
    /** Surfaced from the cold-start defaults (no usage history yet). */
    COLD_START,

    /** Surfaced because the user pinned it. */
    PINNED,

    /** Boosted by recent usage of this action. */
    RECENCY,

    /** Boosted because it matches the current time-of-day bucket. */
    TIME_OF_DAY,

    /** Boosted by pending uncategorized imports. */
    PENDING_IMPORTS,

    /** Boosted by upcoming bills. */
    UPCOMING_BILLS,

    /** Surfaced from the stale-model fallback ordering. */
    STALE_FALLBACK,
}
