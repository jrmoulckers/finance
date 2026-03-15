// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [MockGoalRepository].
 *
 * The repository is seeded from [com.finance.android.ui.data.SampleData.goals]
 * (5 goals: 4 ACTIVE, 1 COMPLETED). Tests account for this baseline.
 * Flow re-emission is verified with Turbine.
 */
class MockGoalRepositoryTest {

    // -- Helpers --------------------------------------------------------------

    private fun createRepo() = MockGoalRepository()

    /** Number of goals seeded from SampleData. */
    private val seedCount = 5

    /** Number of ACTIVE goals in the seed data. */
    private val seedActiveCount = 4

    private val now = Clock.System.now()

    private fun goal(
        id: String,
        name: String = "Test Goal",
        targetCents: Long = 100_000L,
        currentCents: Long = 0L,
        status: GoalStatus = GoalStatus.ACTIVE,
        targetDate: LocalDate? = null,
    ) = Goal(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        name = name,
        targetAmount = Cents(targetCents),
        currentAmount = Cents(currentCents),
        currency = Currency.USD,
        targetDate = targetDate,
        status = status,
        icon = null,
        color = null,
        accountId = null,
        createdAt = now,
        updatedAt = now,
    )

    // -- Tests ----------------------------------------------------------------

    @Test
    fun `getAll returns seeded goals initially`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val list = awaitItem()
            assertEquals(seedCount, list.size, "GoalRepository starts with seeded data")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getAll returns non-deleted goals`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-extra-1", name = "Vacation"))
        repo.create(goal("goal-extra-2", name = "Car"))

        repo.getAll().test {
            val list = awaitItem()
            assertEquals(seedCount + 2, list.size)
            assertTrue(list.all { it.deletedAt == null })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns matching goal`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-1", name = "Emergency Fund"))

        repo.getById(SyncId("goal-1")).test {
            val result = awaitItem()
            assertNotNull(result)
            assertEquals("Emergency Fund", result.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns null for unknown id`() = runTest {
        val repo = createRepo()

        repo.getById(SyncId("nonexistent")).test {
            val result = awaitItem()
            assertNull(result)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getActiveGoals filters by active status`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-active", name = "Active Goal", status = GoalStatus.ACTIVE))
        repo.create(goal("goal-paused", name = "Paused Goal", status = GoalStatus.PAUSED))
        repo.create(goal("goal-completed-x", name = "Completed Goal", status = GoalStatus.COMPLETED))
        repo.create(goal("goal-cancelled", name = "Cancelled Goal", status = GoalStatus.CANCELLED))

        repo.getActiveGoals().test {
            val list = awaitItem()
            // seedActiveCount from seed + 1 newly added ACTIVE
            assertEquals(seedActiveCount + 1, list.size, "Only ACTIVE goals should be returned")
            assertTrue(list.any { it.id == SyncId("goal-active") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getActiveGoals excludes deleted goals even if status is ACTIVE`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-del-test", name = "Active Goal", status = GoalStatus.ACTIVE))
        val beforeDelete = repo.getActiveGoals().first().size

        repo.delete(SyncId("goal-del-test"))

        repo.getActiveGoals().test {
            val list = awaitItem()
            assertEquals(beforeDelete - 1, list.size, "Soft-deleted active goals should not appear")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `updateProgress modifies goal currentAmount`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-1", name = "Savings Goal", targetCents = 500_000L, currentCents = 0L))

        repo.updateProgress(SyncId("goal-1"), Cents(150_000L))

        repo.getById(SyncId("goal-1")).test {
            val result = awaitItem()
            assertNotNull(result)
            assertEquals(Cents(150_000L), result.currentAmount)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `updateProgress updates updatedAt timestamp`() = runTest {
        val repo = createRepo()
        val originalGoal = goal("goal-1", name = "Timestamp Goal")
        repo.create(originalGoal)
        val originalUpdatedAt = originalGoal.updatedAt

        repo.updateProgress(SyncId("goal-1"), Cents(25_000L))

        repo.getById(SyncId("goal-1")).test {
            val result = awaitItem()
            assertNotNull(result)
            assertTrue(
                result.updatedAt >= originalUpdatedAt,
                "updatedAt should be same or later after updateProgress",
            )
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `create adds goal`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val before = awaitItem()
            assertEquals(seedCount, before.size)

            repo.create(goal("goal-new", name = "New Goal"))

            val after = awaitItem()
            assertEquals(seedCount + 1, after.size)
            assertTrue(after.any { it.name == "New Goal" })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `update replaces existing goal`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-1", name = "Original Name"))

        repo.getById(SyncId("goal-1")).test {
            val original = awaitItem()
            assertNotNull(original)

            val updated = original.copy(name = "Updated Name", updatedAt = Clock.System.now())
            repo.update(updated)

            val result = awaitItem()
            assertNotNull(result)
            assertEquals("Updated Name", result.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `delete soft-deletes goal`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-1", name = "To Delete"))

        repo.delete(SyncId("goal-1"))

        repo.getById(SyncId("goal-1")).test {
            val result = awaitItem()
            assertNull(result, "Soft-deleted goal should not appear via getById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleted goals excluded from getAll`() = runTest {
        val repo = createRepo()
        repo.create(goal("goal-keep", name = "Keep"))
        repo.create(goal("goal-remove", name = "Remove"))

        repo.delete(SyncId("goal-remove"))

        repo.getAll().test {
            val list = awaitItem()
            assertEquals(seedCount + 1, list.size)
            assertTrue(list.any { it.id == SyncId("goal-keep") })
            assertTrue(list.none { it.id == SyncId("goal-remove") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `Flow re-emits on create and delete`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            // Initial → seeded data
            val initial = awaitItem()
            assertEquals(seedCount, initial.size)

            // Create → +1 goal
            repo.create(goal("goal-flow", name = "Flow Goal"))
            val afterCreate = awaitItem()
            assertEquals(seedCount + 1, afterCreate.size)

            // UpdateProgress → re-emit
            repo.updateProgress(SyncId("goal-flow"), Cents(50_000L))
            val afterProgress = awaitItem()
            assertEquals(Cents(50_000L), afterProgress.first { it.id == SyncId("goal-flow") }.currentAmount)

            // Delete → back to seed count
            repo.delete(SyncId("goal-flow"))
            val afterDelete = awaitItem()
            assertEquals(seedCount, afterDelete.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
