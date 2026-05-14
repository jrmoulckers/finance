// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/**
 * UI state for the learning paths feature (#382).
 *
 * @property paths All available learning paths.
 * @property progress Map of path ID to user's progress.
 * @property selectedPathId Currently selected path for detail view.
 * @property currentModuleIndex Index of the current module being viewed.
 * @property quizAnswer The user's selected quiz answer index, or -1.
 * @property quizSubmitted Whether the current quiz has been submitted.
 */
data class LearningUiState(
    val paths: List<LearningPath> = emptyList(),
    val progress: Map<String, LearningProgress> = emptyMap(),
    val selectedPathId: String? = null,
    val currentModuleIndex: Int = 0,
    val quizAnswer: Int = -1,
    val quizSubmitted: Boolean = false,
)

/**
 * ViewModel for the financial learning paths feature (#382).
 *
 * Manages learning path navigation, module progress tracking, and
 * quiz interactions. Progress is kept in-memory for now; persistence
 * will be added when the sync layer is wired.
 */
class LearningPathViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(
        LearningUiState(paths = LearningPathContent.allPaths()),
    )
    val uiState: StateFlow<LearningUiState> = _uiState.asStateFlow()

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

        _uiState.update {
            it.copy(
                progress = it.progress + (pathId to updatedProgress),
                currentModuleIndex = nextIndex,
                quizAnswer = -1,
                quizSubmitted = false,
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
}
