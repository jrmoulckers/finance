// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for learning progress persistence codec, rewards and streak
 * logic (#2208) and the beginner-mode catalog (#2209).
 */
class LearningProgressTest {

    // ── Codec round-trip ────────────────────────────────────────────

    @Test
    fun `codec round-trips a populated state`() {
        val state = LearningState(
            progress = mapOf(
                "building-credit" to LearningProgress(
                    pathId = "building-credit",
                    completedModuleIds = setOf("bc-1", "bc-2"),
                    quizScores = mapOf("bc-1" to 1f, "bc-2" to 0f),
                ),
                "first-job-money" to LearningProgress(
                    pathId = "first-job-money",
                    completedModuleIds = setOf("fj-1"),
                    quizScores = mapOf("fj-1" to 1f),
                ),
            ),
            lastActivePathId = "building-credit",
            lastActiveModuleIndex = 2,
            streakDays = 4,
            lastActiveEpochDay = 20_000L,
        )

        val decoded = LearningProgressCodec.decode(LearningProgressCodec.encode(state))

        assertEquals(state.lastActivePathId, decoded.lastActivePathId)
        assertEquals(state.lastActiveModuleIndex, decoded.lastActiveModuleIndex)
        assertEquals(state.streakDays, decoded.streakDays)
        assertEquals(state.lastActiveEpochDay, decoded.lastActiveEpochDay)
        assertEquals(state.progress.keys, decoded.progress.keys)
        assertEquals(
            setOf("bc-1", "bc-2"),
            decoded.progress.getValue("building-credit").completedModuleIds,
        )
        assertEquals(1f, decoded.progress.getValue("building-credit").quizScores["bc-1"])
    }

    @Test
    fun `codec round-trips an empty state`() {
        val decoded = LearningProgressCodec.decode(LearningProgressCodec.encode(LearningState()))
        assertEquals(LearningState(), decoded)
    }

    @Test
    fun `codec tolerates garbage input`() {
        val decoded = LearningProgressCodec.decode("not a real payload")
        assertEquals(LearningState(), decoded)
    }

    // ── Rewards ─────────────────────────────────────────────────────

    @Test
    fun `rewards start empty`() {
        val rewards = LearningRewards.from(emptyMap(), streakDays = 0)
        assertEquals(0, rewards.xp)
        assertEquals(1, rewards.level)
        assertTrue(rewards.badges.none { it.unlocked })
    }

    @Test
    fun `rewards accumulate xp and unlock badges`() {
        val progress = mapOf(
            "p" to LearningProgress(
                pathId = "p",
                completedModuleIds = setOf("a", "b", "c", "d", "e"),
                quizScores = mapOf("a" to 1f, "b" to 1f, "c" to 1f),
            ),
        )
        val rewards = LearningRewards.from(progress, streakDays = 3)

        // 5 lessons * 10 + 3 mastered quizzes * 5 = 65 XP
        assertEquals(65, rewards.xp)
        assertEquals(5, rewards.lessonsCompleted)
        assertEquals(3, rewards.quizzesMastered)
        assertTrue(rewards.badges.first { it.id == "first-lesson" }.unlocked)
        assertTrue(rewards.badges.first { it.id == "five-lessons" }.unlocked)
        assertTrue(rewards.badges.first { it.id == "quiz-master" }.unlocked)
        assertTrue(rewards.badges.first { it.id == "streak-3" }.unlocked)
    }

    @Test
    fun `level advances every hundred xp`() {
        val progress = mapOf(
            "p" to LearningProgress(
                pathId = "p",
                completedModuleIds = (1..10).map { "m$it" }.toSet(),
            ),
        )
        // 10 lessons * 10 XP = 100 XP -> level 2
        val rewards = LearningRewards.from(progress, streakDays = 0)
        assertEquals(100, rewards.xp)
        assertEquals(2, rewards.level)
        assertEquals(0, rewards.xpIntoLevel)
    }

    // ── Streak ──────────────────────────────────────────────────────

    @Test
    fun `streak starts at one on first activity`() {
        assertEquals(1, LearningStreak.advance(previousDay = 0, previousStreak = 0, todayDay = 100))
    }

    @Test
    fun `streak increments on consecutive day`() {
        assertEquals(3, LearningStreak.advance(previousDay = 100, previousStreak = 2, todayDay = 101))
    }

    @Test
    fun `streak holds on same day`() {
        assertEquals(2, LearningStreak.advance(previousDay = 100, previousStreak = 2, todayDay = 100))
    }

    @Test
    fun `streak resets after a gap`() {
        assertEquals(1, LearningStreak.advance(previousDay = 100, previousStreak = 5, todayDay = 103))
    }

    // ── Catalog (#2209) ─────────────────────────────────────────────

    @Test
    fun `non-beginner catalog returns the full list unchanged`() {
        val all = LearningPathContent.allPaths()
        val catalog = LearningPathContent.catalog(beginnerMode = false, showAdvanced = false)
        assertEquals(all, catalog)
    }

    @Test
    fun `beginner catalog hides advanced content until opted in`() {
        val hidden = LearningPathContent.catalog(beginnerMode = true, showAdvanced = false)
        assertFalse(
            hidden.any { it.level == LearningLevel.ADVANCED },
            "Advanced paths should be hidden for beginners by default",
        )

        val shown = LearningPathContent.catalog(beginnerMode = true, showAdvanced = true)
        assertTrue(
            shown.any { it.level == LearningLevel.ADVANCED },
            "Advanced paths should appear once opted in",
        )
    }

    @Test
    fun `beginner catalog orders beginner paths first`() {
        val catalog = LearningPathContent.catalog(beginnerMode = true, showAdvanced = true)
        val levels = catalog.map { it.level.ordinal }
        assertEquals(levels.sorted(), levels, "Beginner catalog should be ordered by level")
    }

    @Test
    fun `newcomer, credit and teen paths exist and are free`() {
        listOf("newcomer-us-basics", "building-credit", "first-job-money").forEach { id ->
            val path = LearningPathContent.pathById(id)
            assertTrue(path != null, "Expected path $id to exist")
            assertFalse(path.isPremium, "Beginner path $id should be free")
            assertEquals(LearningLevel.BEGINNER, path.level)
        }
    }
}
