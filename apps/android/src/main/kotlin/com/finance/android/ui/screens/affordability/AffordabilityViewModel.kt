// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.affordability

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

/**
 * UI state for the "Can I Afford This?" screen (#377).
 *
 * @property amountText The raw text input for the purchase amount.
 * @property selectedCategory Optional budget category for impact analysis.
 * @property result The computed affordability result, null before first check.
 * @property isAnalysing Whether an analysis is currently running.
 * @property availableFundsFormatted Pre-formatted available funds string.
 * @property errorMessage Validation or computation error message, if any.
 */
data class AffordabilityUiState(
    val amountText: String = "",
    val selectedCategory: String? = null,
    val result: AffordabilityResult? = null,
    val isAnalysing: Boolean = false,
    val availableFundsFormatted: String = "",
    val errorMessage: String? = null,
)

/**
 * ViewModel for the "Can I Afford This?" affordability check feature (#377).
 *
 * Reads the user's account balances and budget data to run an affordability
 * check via [AffordabilityCalculator]. Results are exposed as a reactive
 * [StateFlow] consumed by the Compose UI.
 *
 * @param householdIdProvider Provides the current household scope.
 * @param accountRepository Source for account balance data.
 * @param transactionRepository Source for spending data.
 * @param budgetRepository Source for budget category limits.
 */
class AffordabilityViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AffordabilityUiState())
    val uiState: StateFlow<AffordabilityUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD

    init {
        loadAvailableFunds()
    }

    /**
     * Updates the purchase amount text field.
     */
    fun onAmountChanged(amount: String) {
        // Allow only digits and at most one decimal point
        val filtered = amount.filter { it.isDigit() || it == '.' }
        _uiState.update { it.copy(amountText = filtered, errorMessage = null) }
    }

    /**
     * Updates the selected budget category for impact analysis.
     */
    fun onCategorySelected(category: String?) {
        _uiState.update { it.copy(selectedCategory = category) }
    }

    /**
     * Runs the affordability analysis with the current inputs.
     */
    fun checkAffordability() {
        val amountText = _uiState.value.amountText
        val cents = parseCents(amountText)
        if (cents == null || cents.amount <= 0) {
            _uiState.update { it.copy(errorMessage = "Please enter a valid amount") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isAnalysing = true, errorMessage = null) }
            @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
            try {
                val result = runAnalysis(cents)
                _uiState.update { it.copy(result = result, isAnalysing = false) }
                Timber.d("Affordability check completed: verdict=%s", result.verdict.name)
            } catch (e: Exception) {
                Timber.e(e, "Affordability analysis failed")
                _uiState.update {
                    it.copy(
                        isAnalysing = false,
                        errorMessage = "Unable to complete analysis. Please try again.",
                    )
                }
            }
        }
    }

    /**
     * Clears the current result and input fields.
     */
    fun reset() {
        _uiState.update {
            AffordabilityUiState(availableFundsFormatted = it.availableFundsFormatted)
        }
    }

    private fun loadAvailableFunds() {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: return@launch
            val accounts = accountRepository.observeAll(householdId).first()
            val netWorth = FinancialAggregator.netWorth(accounts)
            _uiState.update {
                it.copy(availableFundsFormatted = CurrencyFormatter.format(netWorth, currency))
            }
        }
    }

    private suspend fun runAnalysis(purchaseAmount: Cents): AffordabilityResult {
        val householdId = householdIdProvider.householdId.value
            ?: error("No household ID available")

        val accounts = accountRepository.observeAll(householdId).first()
        val availableFunds = FinancialAggregator.netWorth(accounts)

        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val monthStart = LocalDate(today.year, today.month, 1)
        val transactions = transactionRepository.getByDateRange(householdId, monthStart, today)

        val budgets = budgetRepository.observeAll(householdId).first()
        val selectedCat = _uiState.value.selectedCategory
        val matchedBudget = if (selectedCat != null) {
            budgets.find { it.name.equals(selectedCat, ignoreCase = true) }
        } else {
            null
        }

        val budgetSpent = if (matchedBudget != null) {
            val catTxns = transactions.filter { it.categoryId == matchedBudget.categoryId }
            Cents(catTxns.sumOf { it.amount.amount })
        } else {
            Cents.ZERO
        }

        return AffordabilityCalculator.evaluate(
            availableFunds = availableFunds,
            purchaseAmount = purchaseAmount,
            budgetName = matchedBudget?.name,
            budgetSpent = budgetSpent,
            budgetLimit = matchedBudget?.amount ?: Cents.ZERO,
        )
    }

    /**
     * Parses a dollar-formatted string into [Cents].
     * Accepts formats like "42.50", "100", "1234.5".
     */
    private fun parseCents(text: String): Cents? {
        val amount = text.toDoubleOrNull() ?: return null
        return Cents((amount * 100).toLong())
    }
}
