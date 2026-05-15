// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.onboarding

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.security.EncryptedPrefsProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Account type options presented during onboarding step 3.
 */
enum class OnboardingAccountType(val label: String) {
    CHECKING("Checking"),
    SAVINGS("Savings"),
    CREDIT("Credit Card"),
}

/**
 * The two onboarding paths a user can choose from after the welcome step.
 *
 * - [QUICK_START] — "Just let me in": applies sensible defaults and skips
 *   customization steps entirely, getting the user to the main app in
 *   under 3 seconds.
 * - [PERSONALIZED] — "Set things up my way": walks through currency,
 *   first account, first budget, and a summary step.
 */
enum class OnboardingPath {
    /** Skip customization, apply sensible defaults, enter the app immediately. */
    QUICK_START,

    /** Walk through currency → account → budget → summary customization steps. */
    PERSONALIZED,
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
 *
 * The flow consists of:
 * - Step 1: Welcome (common to both paths)
 * - Step 2: Path selection — "Just let me in" vs "Set things up"
 * - Steps 3-5: Personalized path only (currency → account → budget)
 * - Step 6: Done / summary (personalized path only; quick-start skips
 *   directly to [isComplete]).
 */
data class OnboardingUiState(
    /** Current step index (1-based). */
    val currentStep: Int = 1,

    /** The onboarding path chosen at step 2. `null` until the user decides. */
    val selectedPath: OnboardingPath? = null,

    // Step 3 — Currency (personalized path)
    val selectedCurrency: CurrencyOption = CurrencyOption.defaults.first(),

    // Step 4 — First Account (personalized path)
    val accountName: String = "",
    val accountType: OnboardingAccountType = OnboardingAccountType.CHECKING,
    val startingBalance: String = "",

    // Step 5 — First Budget (personalized path)
    val budgetCategory: String = "Groceries",
    val budgetAmount: String = "",

    /** Whether the final save is in progress. */
    val isSaving: Boolean = false,

    /** Set to true once onboarding is finished. */
    val isComplete: Boolean = false,
) {
    /** Total visible steps for the personalized path (shown in step indicator). */
    val totalSteps: Int get() = TOTAL_STEPS_PERSONALIZED

    companion object {
        /** Steps: welcome(1) + path(2) + currency(3) + account(4) + budget(5) + done(6). */
        const val TOTAL_STEPS_PERSONALIZED = 6
    }
}

/**
 * ViewModel for the multi-step onboarding welcome flow.
 *
 * After the welcome screen, the user chooses between two paths:
 *
 * - **Quick Start** ("Just let me in") — saves sensible defaults and
 *   immediately marks onboarding complete. No extra screens.
 * - **Personalized Setup** ("Set things up my way") — walks through
 *   currency, first account, first budget, and a summary/done step.
 *
 * Manages navigation between steps, data collection, skip logic, and
 * persistence of the `isOnboardingComplete` flag via
 * [EncryptedPrefsProvider]-backed [android.content.SharedPreferences].
 *
 * PII (account name, starting balance) is encrypted at rest using
 * [androidx.security.crypto.EncryptedSharedPreferences]. On first launch
 * after the migration, legacy plain-text preferences are automatically
 * migrated and cleared (#1314).
 */
class OnboardingViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = EncryptedPrefsProvider.get(application, PREFS_NAME)

    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    // ── Path selection ──────────────────────────────────────────────────

    /**
     * Called when the user picks an onboarding path at step 2.
     *
     * - [OnboardingPath.QUICK_START]: saves defaults and completes immediately.
     * - [OnboardingPath.PERSONALIZED]: advances to step 3 (currency picker).
     */
    fun selectPath(path: OnboardingPath) {
        Timber.d("Onboarding path selected: %s", path.name)
        _uiState.update { it.copy(selectedPath = path) }

        when (path) {
            OnboardingPath.QUICK_START -> quickStart()
            OnboardingPath.PERSONALIZED -> {
                _uiState.update { it.copy(currentStep = 3) }
            }
        }
    }

    /**
     * Applies sensible defaults and completes onboarding immediately.
     *
     * Defaults:
     * - Currency: USD
     * - Account: "My Account", Checking, $0 balance
     * - Budget: Groceries, $0 (user can set up later in-app)
     */
    private fun quickStart() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }

            prefs.edit()
                .putString(KEY_CURRENCY, "USD")
                .putString(KEY_ACCOUNT_NAME, "My Account")
                .putString(KEY_ACCOUNT_TYPE, OnboardingAccountType.CHECKING.name)
                .putString(KEY_STARTING_BALANCE, "0")
                .putString(KEY_BUDGET_CATEGORY, "Groceries")
                .putString(KEY_BUDGET_AMOUNT, "0")
                .putString(KEY_ONBOARDING_PATH, OnboardingPath.QUICK_START.name)
                .apply()

            markOnboardingComplete()
            Timber.d("Quick-start onboarding complete — defaults applied")

            _uiState.update { it.copy(isSaving = false, isComplete = true) }
        }
    }

    // ── Navigation ──────────────────────────────────────────────────────

    /** Advance to the next step. No-op if already on the last step. */
    fun nextStep() {
        _uiState.update {
            if (it.currentStep < OnboardingUiState.TOTAL_STEPS_PERSONALIZED) {
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
        Timber.d("Onboarding skipped at step %d", _uiState.value.currentStep)
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
     * Called when the user taps "Done" on the final step (personalized path).
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
                .putString(KEY_ONBOARDING_PATH, OnboardingPath.PERSONALIZED.name)
                .apply()

            markOnboardingComplete()
            Timber.d("Personalized onboarding complete")

            _uiState.update { it.copy(isSaving = false, isComplete = true) }
        }
    }

    private fun markOnboardingComplete() {
        prefs.edit().putBoolean(KEY_ONBOARDING_COMPLETE, true).apply()
    }

    companion object {
        internal const val PREFS_NAME = "finance_onboarding"
        internal const val KEY_ONBOARDING_COMPLETE = "is_onboarding_complete"
        internal const val KEY_CURRENCY = "onboarding_currency"
        internal const val KEY_ACCOUNT_NAME = "onboarding_account_name"
        internal const val KEY_ACCOUNT_TYPE = "onboarding_account_type"
        internal const val KEY_STARTING_BALANCE = "onboarding_starting_balance"
        internal const val KEY_BUDGET_CATEGORY = "onboarding_budget_category"
        internal const val KEY_BUDGET_AMOUNT = "onboarding_budget_amount"
        internal const val KEY_ONBOARDING_PATH = "onboarding_path"

        /**
         * Check whether the user has already completed (or skipped) onboarding.
         * Called from [OnboardingNavigation] to decide the start destination.
         *
         * Uses [EncryptedPrefsProvider] which handles migration from the
         * legacy plain-text preferences file automatically.
         */
        fun isOnboardingComplete(context: Context): Boolean {
            return EncryptedPrefsProvider.get(context, PREFS_NAME)
                .getBoolean(KEY_ONBOARDING_COMPLETE, false)
        }
    }
}
