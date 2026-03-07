package com.finance.android.ui.accessibility

/**
 * Centralised content descriptions and announcement templates for the
 * Finance Android app.
 *
 * All strings that TalkBack or other assistive technologies speak aloud
 * should originate here to ensure consistency and ease of localisation.
 */
object AccessibilityConstants {

    // ── Navigation & chrome ─────────────────────────────────────────────

    const val HOME_SCREEN = "Finance home screen"
    const val BOTTOM_NAV = "Bottom navigation bar"
    const val SETTINGS_BUTTON = "Settings"
    const val BACK_BUTTON = "Navigate back"
    const val CLOSE_BUTTON = "Close"
    const val SEARCH_BUTTON = "Search transactions"
    const val ADD_TRANSACTION_BUTTON = "Add new transaction"
    const val NOTIFICATIONS_BUTTON = "Notifications"

    // ── Accounts & balances ─────────────────────────────────────────────

    const val ACCOUNT_LIST = "Account list"
    const val ACCOUNT_CARD = "Account card"
    const val TOTAL_BALANCE_LABEL = "Total balance"

    // ── Transactions ────────────────────────────────────────────────────

    const val TRANSACTION_LIST = "Transaction list"
    const val TRANSACTION_ITEM = "Transaction"
    const val TRANSACTION_AMOUNT = "Amount"
    const val TRANSACTION_DATE = "Date"
    const val TRANSACTION_CATEGORY = "Category"

    // ── Budgets ─────────────────────────────────────────────────────────

    const val BUDGET_PROGRESS = "Budget progress"
    const val BUDGET_REMAINING = "Budget remaining"

    // ── Goals ───────────────────────────────────────────────────────────

    const val GOAL_PROGRESS = "Goal progress"
    const val GOAL_TARGET = "Goal target"

    // ── Sync ────────────────────────────────────────────────────────────

    const val SYNC_STATUS = "Synchronisation status"
    const val SYNC_IN_PROGRESS = "Syncing data"
    const val SYNC_COMPLETE = "Sync complete"
    const val SYNC_ERROR = "Sync failed"

    // ── Announcement templates ──────────────────────────────────────────

    /**
     * Template for announcing a balance value.
     *
     * Example: `"Balance: $1,234.56"`
     */
    fun balanceAnnouncement(formatted: String): String =
        "Balance: $formatted"

    /**
     * Template for announcing budget usage.
     *
     * Example: `"Budget: 75% used"`
     */
    fun budgetUsageAnnouncement(percentUsed: Int): String =
        "Budget: $percentUsed% used"

    /**
     * Template for announcing goal completion.
     *
     * Example: `"Goal: 50% complete"`
     */
    fun goalProgressAnnouncement(percentComplete: Int): String =
        "Goal: $percentComplete% complete"

    /**
     * Template for announcing a transaction.
     *
     * Example: `"Transaction: Coffee, $4.50, Today"`
     */
    fun transactionAnnouncement(name: String, amount: String, date: String): String =
        "Transaction: $name, $amount, $date"
}
