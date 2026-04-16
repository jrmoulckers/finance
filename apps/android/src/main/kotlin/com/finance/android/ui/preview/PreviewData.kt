// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.preview

import com.finance.android.ui.data.SampleData
import com.finance.android.ui.viewmodel.AccountEditUiState
import com.finance.android.ui.viewmodel.BudgetEditUiState
import com.finance.android.ui.viewmodel.GoalEditUiState
import com.finance.models.AccountType
import com.finance.models.BudgetPeriod
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime

/**
 * Pre-built UI state snapshots for Compose Preview functions.
 *
 * These provide realistic data for all preview variants without needing
 * a ViewModel or repository. All financial amounts use safe placeholder
 * values that don't represent real user data.
 *
 * IMPORTANT: Never use real financial data in preview snapshots.
 */
object PreviewData {

    private val today = Clock.System.now()
        .toLocalDateTime(TimeZone.currentSystemDefault()).date

    // ── Account Edit ────────────────────────────────────────────────

    /** Pre-populated account edit form. */
    val accountEditDefault = AccountEditUiState(
        name = "Main Checking",
        accountType = AccountType.CHECKING,
        currency = "USD",
        initialBalance = "2500.00",
        isLoading = false,
    )

    /** Account edit form with validation errors. */
    val accountEditWithErrors = AccountEditUiState(
        name = "",
        accountType = AccountType.CHECKING,
        currency = "USD",
        initialBalance = "abc",
        errors = listOf(
            "Account name is required",
            "Balance must be a valid number",
        ),
        isLoading = false,
    )

    /** Account edit form in saving state. */
    val accountEditSaving = AccountEditUiState(
        name = "Savings Account",
        accountType = AccountType.SAVINGS,
        currency = "USD",
        initialBalance = "10000.00",
        isSaving = true,
        isLoading = false,
    )

    // ── Budget Edit ─────────────────────────────────────────────────

    /** Pre-populated budget edit form. */
    val budgetEditDefault = BudgetEditUiState(
        selectedCategory = SampleData.categories.firstOrNull(),
        categories = SampleData.categories,
        amount = "600.00",
        period = BudgetPeriod.MONTHLY,
        isLoading = false,
    )

    /** Budget edit with validation errors. */
    val budgetEditWithErrors = BudgetEditUiState(
        selectedCategory = null,
        categories = SampleData.categories,
        amount = "",
        period = BudgetPeriod.MONTHLY,
        errors = listOf(
            "Please select a category",
            "Budget amount is required",
        ),
        isLoading = false,
    )

    /** Budget edit in saving state. */
    val budgetEditSaving = BudgetEditUiState(
        selectedCategory = SampleData.categories.firstOrNull(),
        categories = SampleData.categories,
        amount = "300.00",
        period = BudgetPeriod.WEEKLY,
        isSaving = true,
        isLoading = false,
    )

    // ── Goal Edit ───────────────────────────────────────────────────

    /** Pre-populated goal edit form. */
    val goalEditDefault = GoalEditUiState(
        name = "Emergency Fund",
        targetAmount = "10000.00",
        currentAmount = "3500.00",
        targetDate = today.plus(180, DateTimeUnit.DAY),
        selectedAccount = SampleData.accounts.firstOrNull(),
        accounts = SampleData.accounts,
        isLoading = false,
    )

    /** Goal edit with validation errors. */
    val goalEditWithErrors = GoalEditUiState(
        name = "",
        targetAmount = "0",
        currentAmount = "0",
        targetDate = null,
        accounts = SampleData.accounts,
        errors = listOf(
            "Goal name is required",
            "Target amount must be greater than zero",
        ),
        isLoading = false,
    )

    /** Goal edit in saving state. */
    val goalEditSaving = GoalEditUiState(
        name = "Vacation Fund",
        targetAmount = "5000.00",
        currentAmount = "2000.00",
        targetDate = today.plus(90, DateTimeUnit.DAY),
        selectedAccount = SampleData.accounts.firstOrNull(),
        accounts = SampleData.accounts,
        isSaving = true,
        isLoading = false,
    )
}
