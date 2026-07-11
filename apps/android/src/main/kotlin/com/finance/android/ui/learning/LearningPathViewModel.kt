// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

import androidx.lifecycle.ViewModel
import com.finance.android.ui.expertise.ExpertiseTier
import com.finance.android.ui.expertise.ExpertiseTierManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/**
 * UI state for the learning paths feature (#382, #2208, #2209).
 *
 * @property paths Learning paths visible to the user (catalog-filtered).
 * @property progress Map of path ID to user's progress.
 * @property selectedPathId Currently selected path for detail view.
 * @property currentModuleIndex Index of the current module being viewed.
 * @property quizAnswer The user's selected quiz answer index, or -1.
 * @property quizSubmitted Whether the current quiz has been submitted.
 * @property beginnerMode Whether beginner-friendly ordering/gating is active.
 * @property showAdvanced Whether advanced topics are revealed in beginner mode.
 * @property hasAdvancedContent Whether any advanced content exists to gate.
 * @property resumePathId Path to resume ("pick up where you left off"), if any.
 * @property resumeModuleIndex Module index to resume at within [resumePathId].
 * @property rewards Derived reward summary (XP, level, streak, badges).
 */
data class LearningUiState(
    val paths: List<LearningPath> = emptyList(),
    val progress: Map<String, LearningProgress> = emptyMap(),
    val selectedPathId: String? = null,
    val currentModuleIndex: Int = 0,
    val quizAnswer: Int = -1,
    val quizSubmitted: Boolean = false,
    val beginnerMode: Boolean = false,
    val showAdvanced: Boolean = false,
    val hasAdvancedContent: Boolean = false,
    val resumePathId: String? = null,
    val resumeModuleIndex: Int = 0,
    val rewards: LearningRewards = LearningRewards.from(emptyMap(), 0),
)

/**
 * ViewModel for the financial learning paths feature (#382).
 *
 * Manages learning path navigation, module progress tracking, and quiz
 * interactions. Progress now persists across restarts via
 * [LearningProgressRepository] (#2208), surfaces a resume entry point and
 * reward summary, and adapts the catalog for beginners driven by the user's
 * [ExpertiseTier] (#2209).
 */
class LearningPathViewModel(
    private val progressRepository: LearningProgressRepository,
    private val expertiseTierManager: ExpertiseTierManager,
    private val currentEpochDay: () -> Long = { System.currentTimeMillis() / MILLIS_PER_DAY },
) : ViewModel() {

    private var persisted: LearningState = progressRepository.load()

    private val _uiState = MutableStateFlow(buildInitialState())
    val uiState: StateFlow<LearningUiState> = _uiState.asStateFlow()

    private fun buildInitialState(): LearningUiState {
        val beginnerMode = expertiseTierManager.currentTier.value == ExpertiseTier.BEGINNER
        return LearningUiState(
            paths = LearningPathContent.catalog(beginnerMode, showAdvanced = false),
            progress = persisted.progress,
            beginnerMode = beginnerMode,
            showAdvanced = false,
            hasAdvancedContent = LearningPathContent.hasAdvancedContent(),
            resumePathId = persisted.lastActivePathId,
            resumeModuleIndex = persisted.lastActiveModuleIndex,
            rewards = LearningRewards.from(persisted.progress, persisted.streakDays),
        )
    }

    /**
     * Selects a learning path for detailed view.
     */
    fun selectPath(pathId: String) {
        _uiState.update {
            it.copy(
                selectedPathId = pathId,
                currentModuleIndex = 0,
                quizAnswer = -1,
                quizSubmitted = false,
            )
        }
        Timber.d("Learning path selected: %s", pathId)
    }

    /**
     * Resumes the most recently studied path, if one exists (#2208).
     */
    fun resumeLearning() {
        val pathId = persisted.lastActivePathId ?: return
        val path = LearningPathContent.pathById(pathId) ?: return
        val index = persisted.lastActiveModuleIndex.coerceIn(0, path.modules.lastIndex)
        _uiState.update {
            it.copy(
                selectedPathId = pathId,
                currentModuleIndex = index,
                quizAnswer = -1,
                quizSubmitted = false,
            )
        }
        Timber.d("Resuming learning path %s at module %d", pathId, index)
    }

    /**
     * Toggles visibility of advanced topics while in beginner mode (#2209).
     */
    fun toggleShowAdvanced() {
        _uiState.update { state ->
            val showAdvanced = !state.showAdvanced
            state.copy(
                showAdvanced = showAdvanced,
                paths = LearningPathContent.catalog(state.beginnerMode, showAdvanced),
            )
        }
    }

    /**
     * Navigates to a specific module within the current path.
     */
    fun goToModule(index: Int) {
        _uiState.update {
            it.copy(
                currentModuleIndex = index,
                quizAnswer = -1,
                quizSubmitted = false,
            )
        }
    }

    /**
     * Advances to the next module and marks the current one as complete.
     */
    @Suppress("ReturnCount") // Multiple early returns improve readability
    fun completeModuleAndAdvance() {
        val state = _uiState.value
        val pathId = state.selectedPathId ?: return
        val path = LearningPathContent.pathById(pathId) ?: return
        val currentModule = path.modules.getOrNull(state.currentModuleIndex) ?: return

        val existingProgress = state.progress[pathId] ?: LearningProgress(pathId)
        val updatedCompleted = existingProgress.completedModuleIds + currentModule.id

        val updatedScores = if (state.quizSubmitted && currentModule.quiz != null) {
            val score = if (state.quizAnswer == currentModule.quiz.correctIndex) 1f else 0f
            existingProgress.quizScores + (currentModule.id to score)
        } else {
            existingProgress.quizScores
        }

        val updatedProgress = existingProgress.copy(
            completedModuleIds = updatedCompleted,
            quizScores = updatedScores,
        )

        val nextIndex = if (state.currentModuleIndex < path.modules.size - 1) {
            state.currentModuleIndex + 1
        } else {
            state.currentModuleIndex
        }

        val progressMap = state.progress + (pathId to updatedProgress)
        val today = currentEpochDay()
        val streakDays = LearningStreak.advance(persisted.lastActiveEpochDay, persisted.streakDays, today)

        persisted = LearningState(
            progress = progressMap,
            lastActivePathId = pathId,
            lastActiveModuleIndex = nextIndex,
            streakDays = streakDays,
            lastActiveEpochDay = today,
        )
        progressRepository.save(persisted)

        _uiState.update {
            it.copy(
                progress = progressMap,
                currentModuleIndex = nextIndex,
                quizAnswer = -1,
                quizSubmitted = false,
                resumePathId = pathId,
                resumeModuleIndex = nextIndex,
                rewards = LearningRewards.from(progressMap, streakDays),
            )
        }

        Timber.d(
            "Module %s completed in path %s (%d/%d)",
            currentModule.id,
            pathId,
            updatedCompleted.size,
            path.modules.size,
        )
    }

    /**
     * Selects a quiz answer.
     */
    fun selectQuizAnswer(answerIndex: Int) {
        _uiState.update { it.copy(quizAnswer = answerIndex) }
    }

    /**
     * Submits the quiz answer for grading.
     */
    fun submitQuiz() {
        _uiState.update { it.copy(quizSubmitted = true) }
    }

    /**
     * Clears the selected path (navigates back to path list).
     */
    fun clearSelection() {
        _uiState.update {
            it.copy(
                selectedPathId = null,
                currentModuleIndex = 0,
                quizAnswer = -1,
                quizSubmitted = false,
            )
        }
    }

    private companion object {
        const val MILLIS_PER_DAY = 86_400_000L
    }
}
