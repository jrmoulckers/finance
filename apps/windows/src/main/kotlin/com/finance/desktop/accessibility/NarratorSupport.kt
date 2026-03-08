// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.accessibility

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics

// =============================================================================
// Compose Desktop accessibility utilities for Windows Narrator
// =============================================================================
//
// These extensions wrap the Compose semantics API to provide clear, consistent
// accessibility information that Windows Narrator and UI Automation can consume.
// Every interactive or informational element in the Finance desktop app should
// use these modifiers so Narrator users receive the same experience as sighted
// users.
//
// Usage:
//   Text(
//       text = balance,
//       modifier = Modifier.narratorLabel("Current balance: $1,234.56"),
//   )

/**
 * Sets [contentDescription] on the composable so Windows Narrator announces
 * [label] instead of (or in addition to) any visible text.
 *
 * Use this when the visible text alone is ambiguous — for example, a bare
 * dollar amount that needs context ("Groceries budget: $250 of $500 used").
 *
 * @param label Descriptive text announced by Narrator. Should be a complete,
 *   human-readable sentence fragment — avoid abbreviations and symbols that
 *   Narrator may not expand (e.g. say "percent" instead of "%").
 */
fun Modifier.narratorLabel(label: String): Modifier = this.semantics {
    contentDescription = label
}

/**
 * Marks the composable as a **heading** in the accessibility tree.
 *
 * Narrator users can jump between headings with <kbd>H</kbd> / <kbd>Shift+H</kbd>,
 * so every screen title and major section header should use this modifier.
 *
 * Can be combined with [narratorLabel] when the visible heading text differs
 * from the desired Narrator announcement:
 * ```
 * Text(
 *     text = "Budgets",
 *     modifier = Modifier
 *         .narratorHeading()
 *         .narratorLabel("Budgets overview, 5 active budgets"),
 * )
 * ```
 */
fun Modifier.narratorHeading(): Modifier = this.semantics {
    heading()
}

/**
 * Marks the composable as a **live region** so Narrator announces content
 * changes automatically without the user needing to navigate to the element.
 *
 * Use this for dynamic content that updates while the user is on the screen:
 * - Sync status banners ("Sync complete — 12 items updated")
 * - Budget progress bars that change after a new transaction
 * - Error/success toasts rendered inline
 *
 * The region uses [LiveRegionMode.Polite], meaning Narrator waits for a
 * pause in speech before announcing the change. This avoids interrupting
 * the user mid-sentence.
 */
fun Modifier.narratorLiveRegion(): Modifier = this.semantics {
    liveRegion = LiveRegionMode.Polite
}

// =============================================================================
// Accessibility content description templates for financial UI
// =============================================================================

/**
 * Standardised content-description templates for common Finance UI patterns.
 *
 * Using constants avoids inconsistent phrasing across screens and ensures
 * Narrator users hear a predictable vocabulary. Every template is a format
 * string suitable for [String.format]; callers supply the dynamic values.
 *
 * Example:
 * ```
 * val desc = AccessibilityConstants.budgetProgress.format("Groceries", 72)
 * modifier = Modifier.narratorLabel(desc)
 * ```
 */
object AccessibilityConstants {

    // -- Accounts --------------------------------------------------------------

    /** Format: accountName, formattedBalance */
    const val accountBalance: String =
        "%s account, balance %s"

    /** Format: accountName, accountType */
    const val accountType: String =
        "%s, %s account"

    // -- Transactions ----------------------------------------------------------

    /** Format: payee, formattedAmount, formattedDate */
    const val transactionSummary: String =
        "Transaction: %s, %s on %s"

    /** Format: transactionType (Income/Expense/Transfer), formattedAmount */
    const val transactionAmount: String =
        "%s of %s"

    /** Format: payee, category */
    const val transactionDetail: String =
        "%s in category %s"

    // -- Budgets ---------------------------------------------------------------

    /** Format: budgetName, percentUsed */
    const val budgetProgress: String =
        "%s budget, %d percent used"

    /** Format: budgetName, formattedSpent, formattedTotal */
    const val budgetSpending: String =
        "%s budget, %s spent of %s"

    /** Format: budgetName */
    const val budgetOverLimit: String =
        "%s budget is over limit"

    // -- Goals -----------------------------------------------------------------

    /** Format: goalName, percentComplete */
    const val goalProgress: String =
        "%s goal, %d percent complete"

    /** Format: goalName, formattedSaved, formattedTarget */
    const val goalSaving: String =
        "%s goal, %s saved of %s target"

    // -- Navigation & Sections -------------------------------------------------

    /** Format: screenName */
    const val screenHeading: String =
        "%s screen"

    /** Format: sectionName */
    const val sectionHeading: String =
        "%s section"

    /** Format: tabName, position, totalTabs */
    const val navigationTab: String =
        "%s, tab %d of %d"

    // -- Sync & Status ---------------------------------------------------------

    /** Format: itemCount */
    const val syncComplete: String =
        "Sync complete, %d items updated"

    const val syncInProgress: String =
        "Sync in progress"

    const val syncError: String =
        "Sync failed, tap to retry"

    const val offlineBanner: String =
        "You are offline. Changes will sync when connection is restored."

    // -- Bills & Reminders -----------------------------------------------------

    /** Format: billName, formattedDueDate, formattedAmount */
    const val billReminder: String =
        "%s due on %s for %s"

    /** Format: billName */
    const val billOverdue: String =
        "%s is overdue"

    // -- Alerts ----------------------------------------------------------------

    /** Format: budgetName, percentUsed */
    const val budgetAlert: String =
        "Budget alert: %s is at %d percent"

    /** Format: budgetName */
    const val budgetExceeded: String =
        "Warning: %s budget has been exceeded"

    // -- Empty States ----------------------------------------------------------

    const val noTransactions: String =
        "No transactions yet. Add your first transaction to get started."

    const val noBudgets: String =
        "No budgets configured. Create a budget to start tracking spending."

    const val noGoals: String =
        "No savings goals yet. Set a goal to start saving."

    const val noAccounts: String =
        "No accounts added. Add an account to begin tracking finances."
}
