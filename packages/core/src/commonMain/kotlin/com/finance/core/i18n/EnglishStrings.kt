// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

/**
 * Built-in English string bundle.
 *
 * Serves as the default fallback for all locales. Every key in [Strings]
 * should have an English translation here.
 *
 * Other languages are loaded at runtime by platform apps from their
 * native resource systems.
 */
object EnglishStrings {

    fun bundle(): StringBundle = StringBundle(
        locale = Locale.EN,
        strings = mapOf(
            // General
            Strings.APP_NAME to "Finance",
            Strings.OK to "OK",
            Strings.CANCEL to "Cancel",
            Strings.SAVE to "Save",
            Strings.DELETE to "Delete",
            Strings.EDIT to "Edit",
            Strings.LOADING to "Loading\u2026",
            Strings.DONE to "Done",
            Strings.RETRY to "Retry",
            Strings.ERROR to "Error",

            // Accounts
            Strings.ACCOUNT_CHECKING to "Checking",
            Strings.ACCOUNT_SAVINGS to "Savings",
            Strings.ACCOUNT_CREDIT_CARD to "Credit Card",
            Strings.ACCOUNT_CASH to "Cash",
            Strings.ACCOUNT_INVESTMENT to "Investment",
            Strings.ACCOUNT_LOAN to "Loan",
            Strings.ACCOUNT_OTHER to "Other",

            // Transactions
            Strings.TRANSACTION_EXPENSE to "Expense",
            Strings.TRANSACTION_INCOME to "Income",
            Strings.TRANSACTION_TRANSFER to "Transfer",
            Strings.TRANSACTION_STATUS_PENDING to "Pending",
            Strings.TRANSACTION_STATUS_CLEARED to "Cleared",
            Strings.TRANSACTION_STATUS_RECONCILED to "Reconciled",
            Strings.TRANSACTION_STATUS_VOID to "Void",

            // Budgets
            Strings.BUDGET_REMAINING to "Remaining",
            Strings.BUDGET_OVER to "Over Budget",
            Strings.BUDGET_ON_TRACK to "On Track",
            Strings.BUDGET_WARNING to "Warning",
            Strings.BUDGET_PERIOD_WEEKLY to "Weekly",
            Strings.BUDGET_PERIOD_BIWEEKLY to "Biweekly",
            Strings.BUDGET_PERIOD_MONTHLY to "Monthly",
            Strings.BUDGET_PERIOD_QUARTERLY to "Quarterly",
            Strings.BUDGET_PERIOD_YEARLY to "Yearly",

            // Goals
            Strings.GOAL_STATUS_ACTIVE to "Active",
            Strings.GOAL_STATUS_PAUSED to "Paused",
            Strings.GOAL_STATUS_COMPLETED to "Completed",
            Strings.GOAL_STATUS_CANCELLED to "Cancelled",
            Strings.GOAL_PROGRESS to "Progress",

            // Export
            Strings.EXPORT_TITLE to "Export Data",
            Strings.EXPORT_SUCCESS to "Export completed successfully",
            Strings.EXPORT_FAILED to "Export failed",
            Strings.EXPORT_NO_DATA to "No data to export",

            // Errors
            Strings.ERROR_NETWORK to "Network error. Please check your connection.",
            Strings.ERROR_SYNC_FAILED to "Sync failed. Will retry automatically.",
            Strings.ERROR_INVALID_AMOUNT to "Please enter a valid amount.",
            Strings.ERROR_REQUIRED_FIELD to "This field is required.",

            // Formatted strings
            Strings.BUDGET_REMAINING_FMT to "{0} remaining in {1}",
            Strings.GOAL_PROGRESS_FMT to "{0} of {1} saved",
            Strings.TRANSACTION_SUMMARY_FMT to "{0} on {1}",
        ),
    )
}
