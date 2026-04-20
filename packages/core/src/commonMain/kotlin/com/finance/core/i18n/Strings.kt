// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

/**
 * Registry of well-known string keys used throughout the Finance app.
 *
 * Organized by domain. Platform string resource files (strings.xml,
 * Localizable.strings, i18n JSON) should provide translations for all keys.
 */
object Strings {

    // ── General ──────────────────────────────────────────────────────

    val APP_NAME = StringKey("app.name")
    val OK = StringKey("general.ok")
    val CANCEL = StringKey("general.cancel")
    val SAVE = StringKey("general.save")
    val DELETE = StringKey("general.delete")
    val EDIT = StringKey("general.edit")
    val LOADING = StringKey("general.loading")
    val ERROR = StringKey("general.error")
    val RETRY = StringKey("general.retry")
    val DONE = StringKey("general.done")

    // ── Accounts ─────────────────────────────────────────────────────

    val ACCOUNT_CHECKING = StringKey("account.type.checking")
    val ACCOUNT_SAVINGS = StringKey("account.type.savings")
    val ACCOUNT_CREDIT_CARD = StringKey("account.type.credit_card")
    val ACCOUNT_CASH = StringKey("account.type.cash")
    val ACCOUNT_INVESTMENT = StringKey("account.type.investment")
    val ACCOUNT_LOAN = StringKey("account.type.loan")
    val ACCOUNT_OTHER = StringKey("account.type.other")

    // ── Transactions ─────────────────────────────────────────────────

    val TRANSACTION_EXPENSE = StringKey("transaction.type.expense")
    val TRANSACTION_INCOME = StringKey("transaction.type.income")
    val TRANSACTION_TRANSFER = StringKey("transaction.type.transfer")

    val TRANSACTION_STATUS_PENDING = StringKey("transaction.status.pending")
    val TRANSACTION_STATUS_CLEARED = StringKey("transaction.status.cleared")
    val TRANSACTION_STATUS_RECONCILED = StringKey("transaction.status.reconciled")
    val TRANSACTION_STATUS_VOID = StringKey("transaction.status.void")

    // ── Budgets ──────────────────────────────────────────────────────

    val BUDGET_REMAINING = StringKey("budget.remaining")
    val BUDGET_OVER = StringKey("budget.over")
    val BUDGET_ON_TRACK = StringKey("budget.on_track")
    val BUDGET_WARNING = StringKey("budget.warning")

    val BUDGET_PERIOD_WEEKLY = StringKey("budget.period.weekly")
    val BUDGET_PERIOD_BIWEEKLY = StringKey("budget.period.biweekly")
    val BUDGET_PERIOD_MONTHLY = StringKey("budget.period.monthly")
    val BUDGET_PERIOD_QUARTERLY = StringKey("budget.period.quarterly")
    val BUDGET_PERIOD_YEARLY = StringKey("budget.period.yearly")

    // ── Goals ────────────────────────────────────────────────────────

    val GOAL_STATUS_ACTIVE = StringKey("goal.status.active")
    val GOAL_STATUS_PAUSED = StringKey("goal.status.paused")
    val GOAL_STATUS_COMPLETED = StringKey("goal.status.completed")
    val GOAL_STATUS_CANCELLED = StringKey("goal.status.cancelled")

    val GOAL_PROGRESS = StringKey("goal.progress")

    // ── Export ────────────────────────────────────────────────────────

    val EXPORT_TITLE = StringKey("export.title")
    val EXPORT_SUCCESS = StringKey("export.success")
    val EXPORT_FAILED = StringKey("export.failed")
    val EXPORT_NO_DATA = StringKey("export.no_data")

    // ── Errors ───────────────────────────────────────────────────────

    val ERROR_NETWORK = StringKey("error.network")
    val ERROR_SYNC_FAILED = StringKey("error.sync_failed")
    val ERROR_INVALID_AMOUNT = StringKey("error.invalid_amount")
    val ERROR_REQUIRED_FIELD = StringKey("error.required_field")

    // ── Formatting patterns ──────────────────────────────────────────

    /** Pattern: "{0} remaining in {1}" — args: amount, budget name */
    val BUDGET_REMAINING_FMT = StringKey("budget.remaining_fmt")

    /** Pattern: "{0} of {1} saved" — args: current amount, target amount */
    val GOAL_PROGRESS_FMT = StringKey("goal.progress_fmt")

    /** Pattern: "{0} on {1}" — args: payee, date */
    val TRANSACTION_SUMMARY_FMT = StringKey("transaction.summary_fmt")
}
