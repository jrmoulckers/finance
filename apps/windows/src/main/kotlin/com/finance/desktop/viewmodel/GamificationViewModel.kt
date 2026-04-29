// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.desktop.gamification.Achievement
import com.finance.desktop.gamification.BadgeCategory
import com.finance.desktop.gamification.GamificationEngine
import com.finance.desktop.gamification.GamificationState
import com.finance.desktop.gamification.StreakInfo
import com.finance.desktop.gamification.UserLevel
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

data class GamificationUiState(
    val isLoading: Boolean = true,
    val userLevel: UserLevel = UserLevel(1, 0, 50, "Beginner"),
    val totalXp: Int = 0,
    val achievements: List<Achievement> = emptyList(),
    val streaks: List<StreakInfo> = emptyList(),
    val recentUnlocks: List<Achievement> = emptyList(),
    val selectedCategory: BadgeCategory? = null,
)

/**
 * ViewModel for the Gamification System.
 *
 * Feeds transaction and budget data to [GamificationEngine] and exposes
 * achievements, streaks, and level progress as [StateFlow] for Compose.
 */
class GamificationViewModel(
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(GamificationUiState())
    val uiState: StateFlow<GamificationUiState> = _uiState.asStateFlow()

    private val householdId = SyncId("d1")

    init {
        loadGamification()
    }

    fun refresh() {
        loadGamification()
    }

    fun filterByCategory(category: BadgeCategory?) {
        _uiState.value = _uiState.value.copy(selectedCategory = category)
    }

    private fun loadGamification() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            val transactions = transactionRepository.observeAll(householdId).first()
            val budgets = budgetRepository.observeAll(householdId).first()
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date

            val state: GamificationState = GamificationEngine.evaluate(
                transactions = transactions,
                budgets = budgets,
                today = today,
            )

            _uiState.value = GamificationUiState(
                isLoading = false,
                userLevel = state.userLevel,
                totalXp = state.totalXp,
                achievements = state.achievements,
                streaks = state.streaks,
                recentUnlocks = state.recentUnlocks,
                selectedCategory = _uiState.value.selectedCategory,
            )
        }
    }
}
