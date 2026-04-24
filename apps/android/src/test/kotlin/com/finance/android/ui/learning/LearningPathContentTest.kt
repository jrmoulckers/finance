// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for financial learning paths (#382).
 *
 * Validates learning path content integrity, progress tracking,
 * and quiz scoring logic.
 */
class LearningPathContentTest {

    // ── Content integrity tests ─────────────────────────────────────

    @Test
    fun `all paths have unique IDs`() {
        val ids = LearningPathContent.allPaths().map { it.id }
        assertEquals(ids.size, ids.toSet().size, "Duplicate path IDs found")
    }

    @Test
    fun `all paths have non-empty titles`() {
        LearningPathContent.allPaths().forEach { path ->
            assertTrue(path.title.isNotBlank(), "Empty title for path ${path.id}")
        }
    }

    @Test
    fun `all paths have at least one module`() {
        LearningPathContent.allPaths().forEach { path ->
            assertTrue(path.modules.isNotEmpty(), "No modules in path ${path.id}")
        }
    }

    @Test
    fun `all modules have unique IDs within their path`() {
        LearningPathContent.allPaths().forEach { path ->
            val ids = path.modules.map { it.id }
            assertEquals(ids.size, ids.toSet().size, "Duplicate module IDs in ${path.id}")
        }
    }

    @Test
    fun `all modules have non-empty content`() {
        LearningPathContent.allPaths().forEach { path ->
            path.modules.forEach { module ->
                assertTrue(module.content.isNotBlank(), "Empty content in module ${module.id}")
                assertTrue(module.title.isNotBlank(), "Empty title in module ${module.id}")
            }
        }
    }

    @Test
    fun `all modules have key takeaways`() {
        LearningPathContent.allPaths().forEach { path ->
            path.modules.forEach { module ->
                assertTrue(
                    module.keyTakeaways.isNotEmpty(),
                    "No key takeaways in module ${module.id}",
                )
            }
        }
    }

    @Test
    fun `quiz questions have valid correct index`() {
        LearningPathContent.allPaths().forEach { path ->
            path.modules.forEach { module ->
                module.quiz?.let { quiz ->
                    assertTrue(
                        quiz.correctIndex in quiz.options.indices,
                        "Invalid correctIndex in quiz for module ${module.id}",
                    )
                    assertTrue(
                        quiz.options.size >= 2,
                        "Quiz needs at least 2 options in module ${module.id}",
                    )
                }
            }
        }
    }

    @Test
    fun `estimated minutes are positive`() {
        LearningPathContent.allPaths().forEach { path ->
            assertTrue(path.estimatedMinutes > 0, "Non-positive estimatedMinutes for ${path.id}")
            path.modules.forEach { module ->
                assertTrue(
                    module.estimatedMinutes > 0,
                    "Non-positive estimatedMinutes for module ${module.id}",
                )
            }
        }
    }

    @Test
    fun `pathById returns correct path`() {
        val path = LearningPathContent.pathById("budgeting-basics")
        assertNotNull(path)
        assertEquals("Budgeting Basics", path.title)
    }

    @Test
    fun `pathById returns null for unknown ID`() {
        assertNull(LearningPathContent.pathById("nonexistent"))
    }

    @Test
    fun `some paths are premium`() {
        val premiumPaths = LearningPathContent.allPaths().filter { it.isPremium }
        assertTrue(premiumPaths.isNotEmpty(), "Should have at least one premium path")
    }

    @Test
    fun `some paths are free`() {
        val freePaths = LearningPathContent.allPaths().filter { !it.isPremium }
        assertTrue(freePaths.isNotEmpty(), "Should have at least one free path")
    }

    // ── Progress tracking tests ─────────────────────────────────────

    @Test
    fun `empty progress has zero completion`() {
        val progress = LearningProgress(pathId = "test")
        assertEquals(0f, progress.completionPercent(5))
    }

    @Test
    fun `completion percent tracks correctly`() {
        val progress = LearningProgress(
            pathId = "test",
            completedModuleIds = setOf("m1", "m2"),
        )
        assertEquals(0.4f, progress.completionPercent(5), 0.01f)
    }

    @Test
    fun `full completion is 100 percent`() {
        val progress = LearningProgress(
            pathId = "test",
            completedModuleIds = setOf("m1", "m2", "m3"),
        )
        assertEquals(1.0f, progress.completionPercent(3), 0.01f)
    }

    @Test
    fun `completion percent with zero modules returns zero`() {
        val progress = LearningProgress(pathId = "test")
        assertEquals(0f, progress.completionPercent(0))
    }

    @Test
    fun `average quiz score with no quizzes is zero`() {
        val progress = LearningProgress(pathId = "test")
        assertEquals(0f, progress.averageQuizScore())
    }

    @Test
    fun `average quiz score computes correctly`() {
        val progress = LearningProgress(
            pathId = "test",
            quizScores = mapOf("m1" to 1.0f, "m2" to 0.0f),
        )
        assertEquals(0.5f, progress.averageQuizScore(), 0.01f)
    }

    @Test
    fun `perfect quiz score`() {
        val progress = LearningProgress(
            pathId = "test",
            quizScores = mapOf("m1" to 1.0f, "m2" to 1.0f, "m3" to 1.0f),
        )
        assertEquals(1.0f, progress.averageQuizScore(), 0.01f)
    }
}
