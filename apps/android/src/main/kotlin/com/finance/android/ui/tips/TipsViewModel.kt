// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.tips

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.tips.FinancialContext
import com.finance.core.tips.FinancialTip
import com.finance.core.tips.FinancialTipsEngine
import com.finance.core.tips.TipCategory
import com.finance.core.tips.TipPriority
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * UI state for the contextual financial tips feature (#320).
 *
 * @property tips The list of generated tips to display.
 * @property isLoading Whether tip generation is in progress.
 * @property dismissedTipIds Set of tip IDs the user has dismissed this session.
 */
data class TipsUiState(
    val tips: List<FinancialTip> = emptyList(),
    val isLoading: Boolean = true,
    val dismissedTipIds: Set<String> = emptySet(),
) {
    /** Visible tips after filtering out dismissed ones. */
    val visibleTips: List<FinancialTip>
        get() = tips.filter { it.id !in dismissedTipIds }

    /** High-priority tip suitable for the dashboard hero card. */
    val heroTip: FinancialTip?
        get() = visibleTips.firstOrNull { it.priority == TipPriority.HIGH }

    /** Number of visible tips. */
    val visibleCount: Int get() = visibleTips.size
}

/**
 * ViewModel for the contextual financial tips feature (#320).
 *
 * Loads the user's financial data from repositories, builds a
 * [FinancialContext], and delegates to the KMP [FinancialTipsEngine]
 * to generate context-aware tips.
 *
 * @param householdIdProvider Provides the authenticated household ID.
 * @param transactionRepository Source for transaction data.
 * @param budgetRepository Source for budget data.
 * @param goalRepository Source for goal data.
 * @param accountRepository Source for account data.
 * @param categoryRepository Source for category data.
 */
class TipsViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
    private val goalRepository: GoalRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TipsUiState())
    val uiState: StateFlow<TipsUiState> = _uiState.asStateFlow()

    init {
        loadTips()
    }

    /** Refresh tips with latest financial data. */
    fun refresh() {
        loadTips()
    }

    /** Dismiss a tip for the current session. */
    fun dismissTip(tipId: String) {
        _uiState.update { state ->
            state.copy(dismissedTipIds = state.dismissedTipIds + tipId)
        }
        Timber.d("Tip dismissed: %s", tipId)
    }

    private fun loadTips() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping tips generation")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
            try {
                val transactions = transactionRepository.observeAll(householdId).first()
                val budgets = budgetRepository.observeAll(householdId).first()
                val goals = goalRepository.observeAll(householdId).first()
                val accounts = accountRepository.observeAll(householdId).first()
                val categories = categoryRepository.observeAll(householdId).first()

                val context = FinancialContext(
                    transactions = transactions,
                    budgets = budgets,
                    goals = goals,
                    accounts = accounts,
                    categories = categories,
                )

                val tips = FinancialTipsEngine.generateTips(context)

                _uiState.update { state ->
                    state.copy(
                        tips = tips,
                        isLoading = false,
                    )
                }

                Timber.d(
                    "Tips generated: %d total, %d high priority",
                    tips.size,
                    tips.count { it.priority == TipPriority.HIGH },
                )
            } catch (e: Exception) {
                Timber.e(e, "Failed to generate financial tips")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }
}
