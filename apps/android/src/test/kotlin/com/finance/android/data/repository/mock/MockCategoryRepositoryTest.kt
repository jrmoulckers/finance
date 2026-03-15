// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [MockCategoryRepository].
 *
 * Each test creates a fresh repository instance pre-loaded with [SampleData]
 * categories. Flow re-emission is verified with Turbine.
 */
class MockCategoryRepositoryTest {

    // -- Helpers --------------------------------------------------------------

    private fun createRepo() = MockCategoryRepository()

    private val now = Clock.System.now()

    private fun category(
        id: String,
        name: String = "Test Category",
        isIncome: Boolean = false,
        sortOrder: Int = 0,
    ) = Category(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        name = name,
        icon = "label",
        color = null,
        parentId = null,
        isIncome = isIncome,
        isSystem = false,
        sortOrder = sortOrder,
        createdAt = now,
        updatedAt = now,
    )

    // -- Tests ----------------------------------------------------------------

    @Test
    fun `getAll returns all non-deleted categories`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData should provide categories")
            assertTrue(list.all { it.deletedAt == null })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getAll returns categories sorted by sortOrder`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val list = awaitItem()
            val sortOrders = list.map { it.sortOrder }
            assertEquals(sortOrders.sorted(), sortOrders, "Categories should be sorted by sortOrder")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getIncomeCategories filters correctly`() = runTest {
        val repo = createRepo()

        repo.getIncomeCategories().test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has income categories")
            assertTrue(list.all { it.isIncome }, "All returned categories should be income")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getExpenseCategories filters correctly`() = runTest {
        val repo = createRepo()

        repo.getExpenseCategories().test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has expense categories")
            assertTrue(list.none { it.isIncome }, "No returned categories should be income")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `income and expense categories are disjoint`() = runTest {
        val repo = createRepo()

        repo.getIncomeCategories().test {
            val incomeIds = awaitItem().map { it.id }.toSet()

            repo.getExpenseCategories().test {
                val expenseIds = awaitItem().map { it.id }.toSet()

                assertTrue(
                    incomeIds.intersect(expenseIds).isEmpty(),
                    "Income and expense categories should not overlap",
                )
                cancelAndIgnoreRemainingEvents()
            }
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns matching category`() = runTest {
        val repo = createRepo()

        repo.getById(SyncId("cat-groceries")).test {
            val category = awaitItem()
            assertNotNull(category)
            assertEquals("Groceries", category.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns null for unknown id`() = runTest {
        val repo = createRepo()

        repo.getById(SyncId("nonexistent")).test {
            val category = awaitItem()
            assertNull(category)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns null for deleted category`() = runTest {
        val repo = createRepo()

        repo.delete(SyncId("cat-groceries"))

        repo.getById(SyncId("cat-groceries")).test {
            val category = awaitItem()
            assertNull(category, "Soft-deleted category should not appear via getById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `create adds category`() = runTest {
        val repo = createRepo()
        val newCategory = category("cat-new", name = "New Category")

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size

            repo.create(newCategory)

            val after = awaitItem()
            assertEquals(sizeBefore + 1, after.size)
            assertNotNull(after.find { it.id == SyncId("cat-new") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `update replaces existing category`() = runTest {
        val repo = createRepo()
        val knownId = SyncId("cat-groceries")

        repo.getById(knownId).test {
            val original = awaitItem()
            assertNotNull(original)

            val updated = original.copy(name = "Food & Groceries", updatedAt = Clock.System.now())
            repo.update(updated)

            val result = awaitItem()
            assertNotNull(result)
            assertEquals("Food & Groceries", result.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `delete soft-deletes category`() = runTest {
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
    fun `deleted categories excluded from getIncomeCategories`() = runTest {
        val repo = createRepo()
        val salaryId = SyncId("cat-salary")

        repo.getIncomeCategories().test {
            val before = awaitItem()
            assertTrue(before.any { it.id == salaryId }, "Salary should exist initially")

            repo.delete(salaryId)

            val after = awaitItem()
            assertNull(after.find { it.id == salaryId }, "Deleted income category should be excluded")
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
            val newCat = category("cat-flow-test", name = "Flow Test")
            repo.create(newCat)
            val afterCreate = awaitItem()
            assertEquals(initialSize + 1, afterCreate.size)

            // Update
            val toUpdate = afterCreate.first { it.id == SyncId("cat-flow-test") }
            repo.update(toUpdate.copy(name = "Renamed Category", updatedAt = Clock.System.now()))
            val afterUpdate = awaitItem()
            assertEquals("Renamed Category", afterUpdate.first { it.id == SyncId("cat-flow-test") }.name)

            // Delete
            repo.delete(SyncId("cat-flow-test"))
            val afterDelete = awaitItem()
            assertEquals(initialSize, afterDelete.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
