// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Learning paths screen — structured financial education modules (#382).
 *
 * Shows available learning paths with progress tracking, module navigation,
 * and inline quiz questions. Premium paths are visually marked.
 *
 * @param onBack Navigation callback.
 * @param viewModel The [LearningPathViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LearningPathsScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: LearningPathViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.selectedPathId != null) {
                            LearningPathContent.pathById(state.selectedPathId!!)?.title ?: "Learning"
                        } else {
                            "Learning Paths"
                        },
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Learning Paths screen"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            if (state.selectedPathId != null) viewModel.clearSelection() else onBack()
                        },
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        if (state.selectedPathId != null) {
            val path = LearningPathContent.pathById(state.selectedPathId!!)
            if (path != null) {
                ModuleDetailContent(
                    path = path,
                    moduleIndex = state.currentModuleIndex,
                    progress = state.progress[path.id],
                    quizAnswer = state.quizAnswer,
                    quizSubmitted = state.quizSubmitted,
                    onGoToModule = viewModel::goToModule,
                    onComplete = viewModel::completeModuleAndAdvance,
                    onSelectQuizAnswer = viewModel::selectQuizAnswer,
                    onSubmitQuiz = viewModel::submitQuiz,
                    modifier = Modifier.padding(padding),
                )
            }
        } else {
            PathListContent(
                state = state,
                onSelectPath = viewModel::selectPath,
                onResume = viewModel::resumeLearning,
                onToggleAdvanced = viewModel::toggleShowAdvanced,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun PathListContent(
    state: LearningUiState,
    onSelectPath: (String) -> Unit,
    onResume: () -> Unit,
    onToggleAdvanced: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val resumePath = state.resumePathId?.let { LearningPathContent.pathById(it) }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "rewards") {
            RewardsSummaryCard(rewards = state.rewards)
        }
        if (resumePath != null) {
            item(key = "resume") {
                ResumeCard(
                    path = resumePath,
                    moduleIndex = state.resumeModuleIndex,
                    onResume = onResume,
                )
            }
        }
        items(state.paths, key = { it.id }) { path ->
            PathCard(
                path = path,
                progress = state.progress[path.id],
                onClick = { onSelectPath(path.id) },
            )
        }
        if (state.beginnerMode && state.hasAdvancedContent) {
            item(key = "advanced-toggle") {
                AdvancedTopicsToggle(
                    showAdvanced = state.showAdvanced,
                    onToggle = onToggleAdvanced,
                )
            }
        }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

/**
 * Reward summary showing level, XP progress, streak and badges (#2208).
 */
@Composable
private fun RewardsSummaryCard(
    rewards: LearningRewards,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Level ${rewards.level}. " +
                    "${rewards.xp} total experience points. " +
                    "${rewards.lessonsCompleted} lessons completed. " +
                    "${rewards.streakDays} day learning streak."
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "Level ${rewards.level}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "🔥 ${rewards.streakDays}-day streak",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { rewards.levelProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            "${rewards.xpIntoLevel} of ${rewards.xpForNextLevel} XP to next level"
                    },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "${rewards.xp} XP · ${rewards.lessonsCompleted} lessons · " +
                    "${rewards.quizzesMastered} quizzes aced",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (rewards.badges.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rewards.badges.forEach { badge ->
                        BadgeChip(badge = badge)
                    }
                }
            }
        }
    }
}

@Composable
private fun BadgeChip(
    badge: LearningBadge,
    modifier: Modifier = Modifier,
) {
    val stateLabel = if (badge.unlocked) "unlocked" else "locked"
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .width(64.dp)
            .semantics {
                contentDescription = "${badge.title} badge, $stateLabel. ${badge.description}"
            },
    ) {
        Text(
            text = badge.icon,
            style = MaterialTheme.typography.headlineSmall,
            color = if (badge.unlocked) {
                Color.Unspecified
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
            },
        )
        Text(
            text = badge.title,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (badge.unlocked) FontWeight.SemiBold else FontWeight.Normal,
            color = if (badge.unlocked) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
            },
        )
    }
}

/**
 * "Pick up where you left off" entry point (#2208).
 */
@Composable
private fun ResumeCard(
    path: LearningPath,
    moduleIndex: Int,
    onResume: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val moduleTitle = path.modules.getOrNull(moduleIndex)?.title ?: path.title
    ElevatedCard(
        onClick = onResume,
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription =
                    "Continue learning ${path.title}, next up $moduleTitle. Double tap to resume."
            },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(16.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Pick up where you left off",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "${path.icon}  $moduleTitle",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

/**
 * Beginner-mode toggle that reveals or hides advanced topics (#2209).
 */
@Composable
private fun AdvancedTopicsToggle(
    showAdvanced: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = if (showAdvanced) "Hide advanced topics" else "Show advanced topics"
    OutlinedButton(
        onClick = onToggle,
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = label },
    ) {
        Text(label)
    }
}

@Composable
private fun PathCard(
    path: LearningPath,
    progress: LearningProgress?,
    onClick: () -> Unit,
) {
    val completionPercent = progress?.completionPercent(path.modules.size) ?: 0f

    ElevatedCard(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${path.title}: ${path.description}. " +
                    "${path.modules.size} modules, ${path.estimatedMinutes} minutes. " +
                    if (path.isPremium) "Premium content. " else "" +
                        "${(completionPercent * 100).toInt()} percent complete."
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = path.icon,
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.semantics { contentDescription = "${path.title} icon" },
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = path.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (path.isPremium) {
                            Spacer(Modifier.width(8.dp))
                            Icon(
                                Icons.Filled.Star,
                                contentDescription = "Premium",
                                tint = Color(0xFFFF9800),
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                    Text(
                        text = path.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "${path.modules.size} modules · ${path.estimatedMinutes} min",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (completionPercent > 0f) {
                    Text(
                        text = "${(completionPercent * 100).toInt()}% complete",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            if (completionPercent > 0f) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { completionPercent },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .semantics {
                            contentDescription = "Progress: ${(completionPercent * 100).toInt()} percent"
                        },
                )
            }
        }
    }
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun ModuleDetailContent(
    path: LearningPath,
    moduleIndex: Int,
    progress: LearningProgress?,
    quizAnswer: Int,
    quizSubmitted: Boolean,
    onGoToModule: (Int) -> Unit,
    onComplete: () -> Unit,
    onSelectQuizAnswer: (Int) -> Unit,
    onSubmitQuiz: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val module = path.modules.getOrNull(moduleIndex) ?: return
    val isCompleted = progress?.completedModuleIds?.contains(module.id) == true

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Module progress indicator
        Text(
            text = "Module ${moduleIndex + 1} of ${path.modules.size}",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "Module ${moduleIndex + 1} of ${path.modules.size}"
            },
        )
        LinearProgressIndicator(
            progress = { (moduleIndex + 1).toFloat() / path.modules.size },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .semantics {
                    contentDescription = "Module progress: ${moduleIndex + 1} of ${path.modules.size}"
                },
        )

        // Module title
        Text(
            text = module.title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )

        if (isCompleted) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = FinanceTheme.financeColors.income,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "Completed",
                    style = MaterialTheme.typography.labelSmall,
                    color = FinanceTheme.financeColors.income,
                    modifier = Modifier.semantics { contentDescription = "Module completed" },
                )
            }
        }

        // Module content
        Text(
            text = module.content,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.semantics { contentDescription = module.content },
        )

        // Key takeaways
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Key takeaways" },
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            ),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Key Takeaways",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(8.dp))
                module.keyTakeaways.forEach { takeaway ->
                    Row(modifier = Modifier.padding(vertical = 2.dp)) {
                        Text("•", modifier = Modifier.width(16.dp))
                        Text(
                            text = takeaway,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.semantics { contentDescription = takeaway },
                        )
                    }
                }
            }
        }

        // Quiz section
        module.quiz?.let { quiz ->
            QuizSection(
                quiz = quiz,
                selectedAnswer = quizAnswer,
                isSubmitted = quizSubmitted,
                onSelectAnswer = onSelectQuizAnswer,
                onSubmit = onSubmitQuiz,
            )
        }

        // Navigation buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (moduleIndex > 0) {
                OutlinedButton(
                    onClick = { onGoToModule(moduleIndex - 1) },
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "Go to previous module" },
                ) {
                    Text("Previous")
                }
            }
            FilledTonalButton(
                onClick = onComplete,
                modifier = Modifier
                    .weight(1f)
                    .semantics {
                        contentDescription = if (moduleIndex < path.modules.size - 1) {
                            "Complete this module and go to next"
                        } else {
                            "Complete this module and finish the path"
                        }
                    },
            ) {
                Text(
                    if (moduleIndex < path.modules.size - 1) "Complete & Next"
                    else "Complete Path",
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.height(80.dp))
    }
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun QuizSection(
    quiz: QuizQuestion,
    selectedAnswer: Int,
    isSubmitted: Boolean,
    onSelectAnswer: (Int) -> Unit,
    onSubmit: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Quiz: ${quiz.question}" },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Quiz,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Quick Check",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = quiz.question,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )

            Spacer(Modifier.height(8.dp))

            quiz.options.forEachIndexed { index, option ->
                val isCorrect = isSubmitted && index == quiz.correctIndex
                val isWrong = isSubmitted && index == selectedAnswer && index != quiz.correctIndex

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .semantics {
                            contentDescription = "$option. ${
                                when {
                                    isCorrect -> "Correct answer"
                                    isWrong -> "Incorrect"
                                    else -> ""
                                }
                            }"
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = selectedAnswer == index,
                        onClick = { if (!isSubmitted) onSelectAnswer(index) },
                        enabled = !isSubmitted,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = option,
                        style = MaterialTheme.typography.bodySmall,
                        color = when {
                            isCorrect -> FinanceTheme.financeColors.income
                            isWrong -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.onSurface
                        },
                        fontWeight = if (isCorrect) FontWeight.Bold else FontWeight.Normal,
                    )
                }
            }

            if (!isSubmitted && selectedAnswer >= 0) {
                Spacer(Modifier.height(8.dp))
                FilledTonalButton(
                    onClick = onSubmit,
                    modifier = Modifier.semantics {
                        contentDescription = "Submit quiz answer"
                    },
                ) {
                    Text("Submit Answer")
                }
            }

            AnimatedVisibility(
                visible = isSubmitted,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    val isCorrect = selectedAnswer == quiz.correctIndex
                    Text(
                        text = if (isCorrect) "✓ Correct!" else "✗ Not quite",
                        style = MaterialTheme.typography.titleSmall,
                        color = if (isCorrect) FinanceTheme.financeColors.income else MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics {
                            contentDescription = if (isCorrect) "Correct answer!" else "Incorrect answer"
                        },
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = quiz.explanation,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = quiz.explanation },
                    )
                }
            }
        }
    }
}

// ── Previews ────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, showSystemUi = true, name = "Learning Paths - List")
@Composable
private fun LearningPathsListPreview() {
    FinanceTheme(dynamicColor = false) {
        PathListContent(
            state = LearningUiState(
                paths = LearningPathContent.allPaths(),
                progress = mapOf(
                    "budgeting-basics" to LearningProgress(
                        pathId = "budgeting-basics",
                        completedModuleIds = setOf("bb-1"),
                    ),
                ),
                rewards = LearningRewards.from(
                    mapOf(
                        "budgeting-basics" to LearningProgress(
                            pathId = "budgeting-basics",
                            completedModuleIds = setOf("bb-1"),
                        ),
                    ),
                    streakDays = 2,
                ),
                resumePathId = "budgeting-basics",
                beginnerMode = true,
                hasAdvancedContent = true,
            ),
            onSelectPath = {},
            onResume = {},
            onToggleAdvanced = {},
        )
    }
}
