// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.desktop.tips.FinancialTip
import com.finance.desktop.tips.TipsContext
import com.finance.desktop.tips.TipsEngine
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * UI state for the contextual financial tips feature.
 */
data class TipsUiState(
    val isLoading: Boolean = true,
    val tips: List<FinancialTip> = emptyList(),
    val dismissedTipIds: Set<String> = emptySet(),
    val expandedTipId: String? = null,
) {
    /** Tips excluding any the user has dismissed. */
    val visibleTips: List<FinancialTip>
        get() = tips.filter { it.id !in dismissedTipIds }
}

/**
 * ViewModel for the Contextual Financial Tips feature.
 *
 * Loads accounts, transactions, and budgets, feeds them to [TipsEngine],
 * and exposes the resulting tips as [StateFlow] for Compose collection.
 *
 * Mirrors the Android ViewModel pattern: constructor-injected repositories,
 * [viewModelScope] for coroutines, [StateFlow] for UI state.
 */
class TipsViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(TipsUiState())
    val uiState: StateFlow<TipsUiState> = _uiState.asStateFlow()

    private val householdId = SyncId("d1")

    init {
        loadTips()
    }

    /**
     * Reload tips from current financial data.
     */
    fun refresh() {
        loadTips()
    }

    /**
     * Dismiss a tip so it no longer appears in the visible list.
     */
    fun dismissTip(tipId: String) {
        _uiState.value = _uiState.value.copy(
            dismissedTipIds = _uiState.value.dismissedTipIds + tipId,
        )
    }

    /**
     * Toggle the expanded state of a tip card.
     */
    fun toggleExpanded(tipId: String) {
        _uiState.value = _uiState.value.copy(
            expandedTipId = if (_uiState.value.expandedTipId == tipId) null else tipId,
        )
    }

    private fun loadTips() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            val accounts = accountRepository.observeAll(householdId).first()
            val transactions = transactionRepository.observeAll(householdId).first()
            val budgets = budgetRepository.observeAll(householdId).first()
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date

            val context = TipsContext(
                accounts = accounts,
                transactions = transactions,
                budgets = budgets,
                today = today,
            )

            val tips = TipsEngine.generate(context)

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                tips = tips,
            )
        }
    }
}
