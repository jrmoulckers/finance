// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [MockBudgetRepository].
 *
 * Each test creates a fresh repository instance pre-loaded with [SampleData]
 * budgets. Flow re-emission is verified with Turbine.
 */
class MockBudgetRepositoryTest {

    // -- Helpers --------------------------------------------------------------

    private fun createRepo() = MockBudgetRepository()

    private val now = Clock.System.now()
    private val today: LocalDate = now.toLocalDateTime(TimeZone.currentSystemDefault()).date

    private fun budget(
        id: String,
        categoryId: String = "cat-groceries",
        name: String = "Test Budget",
        amountCents: Long = 50_000L,
        period: BudgetPeriod = BudgetPeriod.MONTHLY,
        endDate: LocalDate? = null,
    ) = Budget(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        categoryId = SyncId(categoryId),
        name = name,
        amount = Cents(amountCents),
        currency = Currency.USD,
        period = period,
        startDate = LocalDate(today.year, today.month, 1),
        endDate = endDate,
        isRollover = false,
        createdAt = now,
        updatedAt = now,
    )

    // -- Tests ----------------------------------------------------------------

    @Test
    fun `getAll returns non-deleted budgets`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData should provide budgets")
            assertTrue(list.all { it.deletedAt == null })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns matching budget`() = runTest {
        val repo = createRepo()

        repo.getById(SyncId("bud-groceries")).test {
            val budget = awaitItem()
            assertNotNull(budget)
            assertEquals("Groceries", budget.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns null for unknown id`() = runTest {
        val repo = createRepo()

        repo.getById(SyncId("nonexistent")).test {
            val budget = awaitItem()
            assertNull(budget)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getActiveBudgets filters by active status`() = runTest {
        val repo = createRepo()

        // SampleData budgets have no endDate → all should be active
        repo.getActiveBudgets().test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData budgets with no endDate should be active")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getActiveBudgets excludes budgets with past endDate`() = runTest {
        val repo = createRepo()

        // Create a budget that has already ended
        val pastEnd = today.minus(30, DateTimeUnit.DAY)
        val expiredBudget = budget(
            id = "bud-expired",
            name = "Expired Budget",
            endDate = pastEnd,
        )
        repo.create(expiredBudget)

        repo.getActiveBudgets().test {
            val list = awaitItem()
            assertNull(
                list.find { it.id == SyncId("bud-expired") },
                "Budget with past endDate should not be in active budgets",
            )
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getActiveBudgets includes budgets with future endDate`() = runTest {
        val repo = createRepo()

        val futureEnd = LocalDate(2099, 12, 31)
        val futureBudget = budget(
            id = "bud-future",
            name = "Future Budget",
            endDate = futureEnd,
        )
        repo.create(futureBudget)

        repo.getActiveBudgets().test {
            val list = awaitItem()
            assertNotNull(
                list.find { it.id == SyncId("bud-future") },
                "Budget with future endDate should be in active budgets",
            )
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByCategoryId filters correctly`() = runTest {
        val repo = createRepo()
        val categoryId = SyncId("cat-groceries")

        repo.getByCategoryId(categoryId).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has a groceries budget")
            assertTrue(list.all { it.categoryId == categoryId })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `create adds budget to list`() = runTest {
        val repo = createRepo()
        val newBudget = budget("bud-new", name = "New Budget")

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size

            repo.create(newBudget)

            val after = awaitItem()
            assertEquals(sizeBefore + 1, after.size)
            assertNotNull(after.find { it.id == SyncId("bud-new") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `update replaces existing budget`() = runTest {
        val repo = createRepo()
        val knownId = SyncId("bud-groceries")

        repo.getById(knownId).test {
            val original = awaitItem()
            assertNotNull(original)

            val updated = original.copy(name = "Updated Groceries", updatedAt = Clock.System.now())
            repo.update(updated)

            val result = awaitItem()
            assertNotNull(result)
            assertEquals("Updated Groceries", result.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `delete soft-deletes budget`() = runTest {
        val repo = createRepo()
        val targetId = SyncId("bud-groceries")

        repo.delete(targetId)

        repo.getById(targetId).test {
            val result = awaitItem()
            assertNull(result, "Soft-deleted budget should not appear via getById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleted budgets excluded from getAll`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size

            repo.delete(before.first().id)

            val after = awaitItem()
            assertEquals(sizeBefore - 1, after.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `Flow re-emits on mutations`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val initial = awaitItem()
            val initialSize = initial.size

            // Create
            val newBudget = budget("bud-flow-test", name = "Flow Test Budget")
            repo.create(newBudget)
            val afterCreate = awaitItem()
            assertEquals(initialSize + 1, afterCreate.size)

            // Update
            val toUpdate = afterCreate.first { it.id == SyncId("bud-flow-test") }
            repo.update(toUpdate.copy(name = "Renamed Budget", updatedAt = Clock.System.now()))
            val afterUpdate = awaitItem()
            assertEquals("Renamed Budget", afterUpdate.first { it.id == SyncId("bud-flow-test") }.name)

            // Delete
            repo.delete(SyncId("bud-flow-test"))
            val afterDelete = awaitItem()
            assertEquals(initialSize, afterDelete.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
