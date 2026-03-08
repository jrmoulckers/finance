// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.onboarding

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Account type options presented during onboarding step 3.
 */
enum class OnboardingAccountType(val label: String) {
    CHECKING("Checking"),
    SAVINGS("Savings"),
    CREDIT("Credit Card"),
}

/**
 * Represents a selectable currency in the onboarding currency picker.
 */
data class CurrencyOption(
    val code: String,
    val symbol: String,
    val name: String,
) {
    companion object {
        /** Common currencies displayed in the onboarding grid. */
        val defaults: List<CurrencyOption> = listOf(
            CurrencyOption("USD", "$", "US Dollar"),
            CurrencyOption("EUR", "€", "Euro"),
            CurrencyOption("GBP", "£", "British Pound"),
            CurrencyOption("CAD", "CA$", "Canadian Dollar"),
            CurrencyOption("AUD", "A$", "Australian Dollar"),
            CurrencyOption("JPY", "¥", "Japanese Yen"),
            CurrencyOption("INR", "₹", "Indian Rupee"),
            CurrencyOption("BRL", "R$", "Brazilian Real"),
            CurrencyOption("MXN", "MX$", "Mexican Peso"),
            CurrencyOption("CHF", "CHF", "Swiss Franc"),
            CurrencyOption("CNY", "¥", "Chinese Yuan"),
            CurrencyOption("KRW", "₩", "South Korean Won"),
        )
    }
}

/**
 * Full UI state for the onboarding flow.
 */
data class OnboardingUiState(
    /** Current step index (1-based). */
    val currentStep: Int = 1,

    // Step 2 — Currency
    val selectedCurrency: CurrencyOption = CurrencyOption.defaults.first(),

    // Step 3 — First Account
    val accountName: String = "",
    val accountType: OnboardingAccountType = OnboardingAccountType.CHECKING,
    val startingBalance: String = "",

    // Step 4 — First Budget
    val budgetCategory: String = "Groceries",
    val budgetAmount: String = "",

    /** Whether the final save is in progress. */
    val isSaving: Boolean = false,

    /** Set to true once onboarding is finished (step 5 "Done" tapped). */
    val isComplete: Boolean = false,
) {
    val totalSteps: Int get() = TOTAL_STEPS

    companion object {
        const val TOTAL_STEPS = 5
    }
}

/**
 * ViewModel for the multi-step onboarding welcome flow.
 *
 * Manages navigation between steps, data collection (currency, first account,
 * first budget), skip logic, and persistence of the `isOnboardingComplete` flag
 * via [android.content.SharedPreferences].
 */
class OnboardingViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    // ── Navigation ──────────────────────────────────────────────────────

    /** Advance to the next step. No-op if already on the last step. */
    fun nextStep() {
        _uiState.update {
            if (it.currentStep < OnboardingUiState.TOTAL_STEPS) {
                it.copy(currentStep = it.currentStep + 1)
            } else {
                it
            }
        }
    }

    /** Go back to the previous step. No-op if already on step 1. */
    fun previousStep() {
        _uiState.update {
            if (it.currentStep > 1) {
                it.copy(currentStep = it.currentStep - 1)
            } else {
                it
            }
        }
    }

    /**
     * Skip the rest of onboarding: mark it complete in preferences and
     * set [OnboardingUiState.isComplete] so the host navigates away.
     */
    fun skip() {
        markOnboardingComplete()
        _uiState.update { it.copy(isComplete = true) }
    }

    // ── Data setters ────────────────────────────────────────────────────

    fun selectCurrency(currency: CurrencyOption) {
        _uiState.update { it.copy(selectedCurrency = currency) }
    }

    fun setAccountName(name: String) {
        _uiState.update { it.copy(accountName = name) }
    }

    fun setAccountType(type: OnboardingAccountType) {
        _uiState.update { it.copy(accountType = type) }
    }

    fun setStartingBalance(balance: String) {
        // Only allow valid numeric input (digits + optional single decimal point)
        if (balance.isEmpty() || balance.matches(Regex("""^\d*\.?\d{0,2}$"""))) {
            _uiState.update { it.copy(startingBalance = balance) }
        }
    }

    fun setBudgetCategory(category: String) {
        _uiState.update { it.copy(budgetCategory = category) }
    }

    fun setBudgetAmount(amount: String) {
        if (amount.isEmpty() || amount.matches(Regex("""^\d*\.?\d{0,2}$"""))) {
            _uiState.update { it.copy(budgetAmount = amount) }
        }
    }

    // ── Persistence ─────────────────────────────────────────────────────

    /**
     * Called when the user taps "Done" on the final step.
     * Persists collected data and marks onboarding complete.
     */
    fun finishOnboarding() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }

            // Persist collected onboarding choices so the main app can use them.
            val state = _uiState.value
            prefs.edit()
                .putString(KEY_CURRENCY, state.selectedCurrency.code)
                .putString(KEY_ACCOUNT_NAME, state.accountName.ifBlank { "My Account" })
                .putString(KEY_ACCOUNT_TYPE, state.accountType.name)
                .putString(KEY_STARTING_BALANCE, state.startingBalance.ifBlank { "0" })
                .putString(KEY_BUDGET_CATEGORY, state.budgetCategory)
                .putString(KEY_BUDGET_AMOUNT, state.budgetAmount.ifBlank { "0" })
                .apply()

            markOnboardingComplete()

            _uiState.update { it.copy(isSaving = false, isComplete = true) }
        }
    }

    private fun markOnboardingComplete() {
        prefs.edit().putBoolean(KEY_ONBOARDING_COMPLETE, true).apply()
    }

    companion object {
        private const val PREFS_NAME = "finance_onboarding"
        private const val KEY_ONBOARDING_COMPLETE = "is_onboarding_complete"
        private const val KEY_CURRENCY = "onboarding_currency"
        private const val KEY_ACCOUNT_NAME = "onboarding_account_name"
        private const val KEY_ACCOUNT_TYPE = "onboarding_account_type"
        private const val KEY_STARTING_BALANCE = "onboarding_starting_balance"
        private const val KEY_BUDGET_CATEGORY = "onboarding_budget_category"
        private const val KEY_BUDGET_AMOUNT = "onboarding_budget_amount"

        /**
         * Check whether the user has already completed (or skipped) onboarding.
         * Called from [OnboardingNavigation] to decide the start destination.
         */
        fun isOnboardingComplete(context: Context): Boolean {
            return context
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_ONBOARDING_COMPLETE, false)
        }
    }
}
