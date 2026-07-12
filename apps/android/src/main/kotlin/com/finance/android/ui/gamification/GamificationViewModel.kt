// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.ui.streak.StreakCalculator
import com.finance.android.ui.streak.StreakRepository
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
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
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

/** A celebration moment shown when the user unlocks a new achievement (#2211). */
data class CelebrationState(
    val title: String,
    val icon: String,
    val points: Int,
    val rarity: AchievementRarity,
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
    val currentStreakDays: Int = 0,
    val bestStreakDays: Int = 0,
    val streakMessage: String = "",
    val nearWins: List<NearWin> = emptyList(),
    val celebration: CelebrationState? = null,
)

/**
 * ViewModel for the Gamification screen (#242, #2211).
 *
 * Evaluates achievements using the KMP [GamificationEngine], derives real
 * logging streaks via [StreakRepository]/[StreakCalculator], computes
 * near-win feedback, and raises a one-time celebration when a new
 * achievement is unlocked.
 */
class GamificationViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val goalRepository: GoalRepository,
    private val streakRepository: StreakRepository,
    private val celebrationStore: GamificationCelebrationStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GamificationUiState())
    val uiState: StateFlow<GamificationUiState> = _uiState.asStateFlow()

    init {
        loadGamification()
    }

    fun refresh() {
        loadGamification()
    }

    /** Dismisses the current celebration overlay. */
    fun dismissCelebration() {
        _uiState.update { it.copy(celebration = null) }
    }

    private fun loadGamification() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping gamification load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
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

                // Real streaks derived from logging dates (#2211).
                val loggingDates = streakRepository.observeLoggingDates(householdId.value).first()
                val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
                val currentStreak = StreakCalculator.currentStreak(loggingDates, today)
                val bestStreak = StreakCalculator.longestStreak(loggingDates)
                val streaks = buildStreaks(currentStreak, bestStreak, loggingDates.maxOrNull() ?: today)

                val profile = GamificationEngine.buildProfile(
                    progress = achievementProgress,
                    streaks = streaks,
                )

                val achievements = buildAchievementUiList(achievementProgress)
                val recentlyUnlocked = achievements.filter { it.isUnlocked }
                    .sortedByDescending { it.points }
                    .take(3)

                // Near-win feedback (#2211).
                val nearWins = NearWinCalculator.compute(achievements, currentStreak, bestStreak)

                // Celebration: fire once per genuinely new unlock (#2211).
                val unlockedIds = achievements.filter { it.isUnlocked }.map { it.id }.toSet()
                val alreadySeen = celebrationStore.seenIds()
                val newlyUnlocked = achievements.firstOrNull { it.isUnlocked && it.id !in alreadySeen }
                if (unlockedIds.isNotEmpty()) {
                    celebrationStore.markSeen(unlockedIds)
                }
                val celebration = newlyUnlocked?.let {
                    CelebrationState(
                        title = it.title,
                        icon = it.icon,
                        points = it.points,
                        rarity = it.rarity,
                    )
                }

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
                        currentStreakDays = currentStreak,
                        bestStreakDays = bestStreak,
                        streakMessage = StreakCalculator.streakMessage(currentStreak),
                        nearWins = nearWins,
                        celebration = celebration,
                    )
                }

                Timber.d(
                    "Gamification loaded: level=%d, points=%d, unlocked=%d/%d, streak=%d",
                    profile.level,
                    profile.totalPoints,
                    profile.achievementsUnlocked,
                    profile.achievementsTotal,
                    currentStreak,
                )
            } catch (e: Exception) {
                Timber.e(e, "Failed to load gamification data")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun buildStreaks(
        currentStreak: Int,
        bestStreak: Int,
        lastActivityDate: kotlinx.datetime.LocalDate,
    ): List<Streak> {
        if (currentStreak <= 0) return emptyList()
        return listOf(
            Streak(
                type = "Daily logging",
                currentCount = currentStreak,
                bestCount = bestStreak,
                lastActivityDate = lastActivityDate,
            ),
        )
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
