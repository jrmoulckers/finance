// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
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
 * The repository starts empty (no SampleData for goals), so every test
 * creates its own data. Flow re-emission is verified with Turbine.
 */
class MockGoalRepositoryTest {

    // -- Helpers --------------------------------------------------------------

    private fun createRepo() = MockGoalRepository()

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
    fun `observeAll returns empty initially`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            assertTrue(list.isEmpty(), "GoalRepository starts with no data")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeAll returns non-deleted goals`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-1", name = "Vacation"))
        repo.insert(goal("goal-2", name = "Car"))

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            assertEquals(2, list.size)
            assertTrue(list.all { it.deletedAt == null })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeById returns matching goal`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-1", name = "Emergency Fund"))

        repo.observeById(SyncId("goal-1")).test {
            val result = awaitItem()
            assertNotNull(result)
            assertEquals("Emergency Fund", result.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeById returns null for unknown id`() = runTest {
        val repo = createRepo()

        repo.observeById(SyncId("nonexistent")).test {
            val result = awaitItem()
            assertNull(result)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeActive filters by active status`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-active", name = "Active Goal", status = GoalStatus.ACTIVE))
        repo.insert(goal("goal-paused", name = "Paused Goal", status = GoalStatus.PAUSED))
        repo.insert(goal("goal-completed", name = "Completed Goal", status = GoalStatus.COMPLETED))
        repo.insert(goal("goal-cancelled", name = "Cancelled Goal", status = GoalStatus.CANCELLED))

        repo.observeActive(SyncId("household-1")).test {
            val list = awaitItem()
            assertEquals(1, list.size, "Only ACTIVE goals should be returned")
            assertEquals(SyncId("goal-active"), list.first().id)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeActive excludes deleted goals even if status is ACTIVE`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-1", name = "Active Goal", status = GoalStatus.ACTIVE))
        repo.delete(SyncId("goal-1"))

        repo.observeActive(SyncId("household-1")).test {
            val list = awaitItem()
            assertTrue(list.isEmpty(), "Soft-deleted active goals should not appear")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `updateProgress modifies goal currentAmount`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-1", name = "Savings Goal", targetCents = 500_000L, currentCents = 0L))

        repo.updateProgress(SyncId("goal-1"), Cents(150_000L))

        repo.observeById(SyncId("goal-1")).test {
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
        repo.insert(originalGoal)
        val originalUpdatedAt = originalGoal.updatedAt

        repo.updateProgress(SyncId("goal-1"), Cents(25_000L))

        repo.observeById(SyncId("goal-1")).test {
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
    fun `insert adds goal`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            val before = awaitItem()
            assertTrue(before.isEmpty())

            repo.insert(goal("goal-new", name = "New Goal"))

            val after = awaitItem()
            assertEquals(1, after.size)
            assertEquals("New Goal", after.first().name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `update replaces existing goal`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-1", name = "Original Name"))

        repo.observeById(SyncId("goal-1")).test {
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
        repo.insert(goal("goal-1", name = "To Delete"))

        repo.delete(SyncId("goal-1"))

        repo.observeById(SyncId("goal-1")).test {
            val result = awaitItem()
            assertNull(result, "Soft-deleted goal should not appear via observeById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleted goals excluded from observeAll`() = runTest {
        val repo = createRepo()
        repo.insert(goal("goal-1", name = "Keep"))
        repo.insert(goal("goal-2", name = "Remove"))

        repo.delete(SyncId("goal-2"))

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            assertEquals(1, list.size)
            assertEquals(SyncId("goal-1"), list.first().id)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `Flow re-emits on create and delete`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            // Initial → empty
            val initial = awaitItem()
            assertTrue(initial.isEmpty())

            // Create → 1 goal
            repo.insert(goal("goal-flow", name = "Flow Goal"))
            val afterCreate = awaitItem()
            assertEquals(1, afterCreate.size)

            // UpdateProgress → re-emit
            repo.updateProgress(SyncId("goal-flow"), Cents(50_000L))
            val afterProgress = awaitItem()
            assertEquals(Cents(50_000L), afterProgress.first().currentAmount)

            // Delete → 0 goals
            repo.delete(SyncId("goal-flow"))
            val afterDelete = awaitItem()
            assertTrue(afterDelete.isEmpty())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
