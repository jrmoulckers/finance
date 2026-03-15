// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [MockAccountRepository].
 *
 * Each test creates a fresh repository instance so mutations in one test
 * never leak into another. Flow re-emission is verified with Turbine.
 */
class MockAccountRepositoryTest {

    // -- Helpers --------------------------------------------------------------

    private fun createRepo() = MockAccountRepository()

    private val now = Clock.System.now()

    private fun account(
        id: String,
        name: String = "Test Account",
        type: AccountType = AccountType.CHECKING,
        balanceCents: Long = 1_000_00L,
        sortOrder: Int = 0,
    ) = Account(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        name = name,
        type = type,
        currency = Currency.USD,
        currentBalance = Cents(balanceCents),
        isArchived = false,
        sortOrder = sortOrder,
        icon = null,
        color = null,
        createdAt = now,
        updatedAt = now,
    )

    // -- Tests ----------------------------------------------------------------

    @Test
    fun `getAll returns non-deleted accounts sorted by sortOrder`() = runTest {
        val repo = createRepo()
        val accounts = repo.getAll()

        accounts.test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData should provide accounts")
            // Verify none are soft-deleted
            assertTrue(list.all { it.deletedAt == null })
            // Verify sorted by sortOrder
            val sortOrders = list.map { it.sortOrder }
            assertEquals(sortOrders.sorted(), sortOrders, "Accounts should be sorted by sortOrder")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns matching account`() = runTest {
        val repo = createRepo()
        val knownId = SyncId("acc-checking")

        repo.getById(knownId).test {
            val account = awaitItem()
            assertNotNull(account, "Should find the checking account from SampleData")
            assertEquals(knownId, account.id)
            assertEquals("Main Checking", account.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getById returns null for unknown id`() = runTest {
        val repo = createRepo()

        repo.getById(SyncId("nonexistent-id")).test {
            val account = awaitItem()
            assertNull(account, "Unknown ID should return null")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByType filters by account type`() = runTest {
        val repo = createRepo()

        repo.getByType(AccountType.SAVINGS).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has savings accounts")
            assertTrue(list.all { it.type == AccountType.SAVINGS })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByType returns empty for type with no accounts`() = runTest {
        val repo = createRepo()

        repo.getByType(AccountType.LOAN).test {
            val list = awaitItem()
            assertTrue(list.isEmpty(), "SampleData has no loan accounts")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `create adds account to list`() = runTest {
        val repo = createRepo()
        val newAccount = account("acc-new", name = "New Savings", type = AccountType.SAVINGS)

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size

            repo.create(newAccount)

            val after = awaitItem()
            assertEquals(sizeBefore + 1, after.size, "List should grow by 1")
            assertNotNull(after.find { it.id == SyncId("acc-new") }, "New account should be present")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `update replaces existing account`() = runTest {
        val repo = createRepo()
        val knownId = SyncId("acc-checking")

        repo.getById(knownId).test {
            val original = awaitItem()
            assertNotNull(original)

            val updated = original.copy(name = "Updated Checking", updatedAt = Clock.System.now())
            repo.update(updated)

            val result = awaitItem()
            assertNotNull(result)
            assertEquals("Updated Checking", result.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `delete soft-deletes by setting deletedAt`() = runTest {
        val repo = createRepo()
        val targetId = SyncId("acc-checking")

        repo.delete(targetId)

        repo.getById(targetId).test {
            val result = awaitItem()
            assertNull(result, "Soft-deleted account should not appear via getById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleted accounts excluded from getAll`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size
            val targetId = before.first().id

            repo.delete(targetId)

            val after = awaitItem()
            assertEquals(sizeBefore - 1, after.size, "Deleted account should be excluded from getAll")
            assertNull(after.find { it.id == targetId }, "Deleted account ID should not appear")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `Flow re-emits on mutations`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            // Initial emission
            val initial = awaitItem()
            val initialSize = initial.size

            // Create → new emission
            val newAccount = account("acc-flow-test", name = "Flow Test")
            repo.create(newAccount)
            val afterCreate = awaitItem()
            assertEquals(initialSize + 1, afterCreate.size)

            // Update → new emission
            val toUpdate = afterCreate.first()
            repo.update(toUpdate.copy(name = "Renamed Account", updatedAt = Clock.System.now()))
            val afterUpdate = awaitItem()
            assertEquals("Renamed Account", afterUpdate.first { it.id == toUpdate.id }.name)

            // Delete → new emission
            repo.delete(toUpdate.id)
            val afterDelete = awaitItem()
            assertEquals(initialSize, afterDelete.size, "Should be back to original size after adding then deleting")

            cancelAndIgnoreRemainingEvents()
        }
    }
}
