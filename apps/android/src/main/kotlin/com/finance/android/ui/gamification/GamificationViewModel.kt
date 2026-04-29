// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.gamification.AchievementCategory
import com.finance.core.gamification.AchievementDefinition
import com.finance.core.gamification.AchievementProgress
import com.finance.core.gamification.AchievementRarity
import com.finance.core.gamification.Achievements
import com.finance.core.gamification.GamificationEngine
import com.finance.core.gamification.GamificationProfile
import com.finance.core.gamification.Streak
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * UI model for a displayable achievement.
 */
data class AchievementUi(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val category: AchievementCategory,
    val rarity: AchievementRarity,
    val points: Int,
    val isUnlocked: Boolean,
    val progressFraction: Float,
    val currentCount: Int,
    val targetCount: Int?,
)

/**
 * Complete UI state for the Gamification screen (#242).
 */
data class GamificationUiState(
    val isLoading: Boolean = true,
    val level: Int = 1,
    val totalPoints: Int = 0,
    val pointsToNextLevel: Int = 50,
    val levelProgressFraction: Float = 0f,
    val achievementsUnlocked: Int = 0,
    val achievementsTotal: Int = Achievements.ALL.size,
    val achievements: List<AchievementUi> = emptyList(),
    val recentlyUnlocked: List<AchievementUi> = emptyList(),
    val activeStreaks: List<Streak> = emptyList(),
)

/**
 * ViewModel for the Gamification screen (#242).
 *
 * Evaluates achievements using the KMP [GamificationEngine] and
 * builds a [GamificationProfile] for UI display.
 */
class GamificationViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val goalRepository: GoalRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GamificationUiState())
    val uiState: StateFlow<GamificationUiState> = _uiState.asStateFlow()

    init {
        loadGamification()
    }

    fun refresh() {
        loadGamification()
    }

    private fun loadGamification() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping gamification load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            try {
                val transactions = transactionRepository.observeAll(householdId).first()
                val accounts = accountRepository.observeAll(householdId).first()
                val budgets = budgetRepository.observeAll(householdId).first()
                val goals = goalRepository.observeAll(householdId).first()

                val achievementProgress = GamificationEngine.evaluateAchievements(
                    transactions = transactions,
                    accounts = accounts,
                    budgets = budgets,
                    goals = goals,
                )

                val profile = GamificationEngine.buildProfile(
                    progress = achievementProgress,
                    streaks = emptyList(), // Streaks tracked separately via StreakRepository
                )

                val achievements = buildAchievementUiList(achievementProgress)
                val recentlyUnlocked = achievements.filter { it.isUnlocked }
                    .sortedByDescending { it.points }
                    .take(3)

                // Calculate level progress fraction
                val currentLevelPoints = GamificationEngine.pointsForLevel(profile.level)
                val nextLevelPoints = GamificationEngine.pointsForLevel(profile.level + 1)
                val levelRange = nextLevelPoints - currentLevelPoints
                val levelProgress = if (levelRange > 0) {
                    ((profile.totalPoints - currentLevelPoints).toFloat() / levelRange).coerceIn(0f, 1f)
                } else 0f

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        level = profile.level,
                        totalPoints = profile.totalPoints,
                        pointsToNextLevel = profile.pointsToNextLevel,
                        levelProgressFraction = levelProgress,
                        achievementsUnlocked = profile.achievementsUnlocked,
                        achievementsTotal = profile.achievementsTotal,
                        achievements = achievements,
                        recentlyUnlocked = recentlyUnlocked,
                        activeStreaks = profile.activeStreaks,
                    )
                }

                Timber.d(
                    "Gamification loaded: level=%d, points=%d, unlocked=%d/%d",
                    profile.level,
                    profile.totalPoints,
                    profile.achievementsUnlocked,
                    profile.achievementsTotal,
                )
            } catch (e: Exception) {
                Timber.e(e, "Failed to load gamification data")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun buildAchievementUiList(
        progress: List<AchievementProgress>,
    ): List<AchievementUi> {
        val progressMap = progress.associateBy { it.achievementId }

        return Achievements.ALL.map { definition ->
            val ap = progressMap[definition.id]
            AchievementUi(
                id = definition.id,
                title = definition.title,
                description = definition.description,
                icon = definition.icon,
                category = definition.category,
                rarity = definition.rarity,
                points = definition.points,
                isUnlocked = ap?.isUnlocked ?: false,
                progressFraction = ap?.progressFraction(definition)?.toFloat() ?: 0f,
                currentCount = ap?.currentCount ?: 0,
                targetCount = definition.targetCount,
            )
        }
    }
}
