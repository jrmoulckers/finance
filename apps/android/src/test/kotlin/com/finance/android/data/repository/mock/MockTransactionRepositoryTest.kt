// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
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
 * Unit tests for [MockTransactionRepository].
 *
 * Each test creates a fresh repository instance pre-loaded with [SampleData]
 * transactions. Flow re-emission is verified with Turbine.
 */
class MockTransactionRepositoryTest {

    // -- Helpers --------------------------------------------------------------

    private fun createRepo() = MockTransactionRepository()

    private val now = Clock.System.now()
    private val today: LocalDate = now.toLocalDateTime(TimeZone.currentSystemDefault()).date

    private fun transaction(
        id: String,
        payee: String = "Test Payee",
        amountCents: Long = -50_00L,
        categoryId: String = "cat-groceries",
        accountId: String = "acc-checking",
        date: LocalDate = today,
        note: String? = null,
        type: TransactionType = TransactionType.EXPENSE,
    ) = Transaction(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        accountId = SyncId(accountId),
        categoryId = SyncId(categoryId),
        type = type,
        status = TransactionStatus.CLEARED,
        amount = Cents(amountCents),
        currency = Currency.USD,
        payee = payee,
        note = note,
        date = date,
        createdAt = now,
        updatedAt = now,
    )

    // -- Tests ----------------------------------------------------------------

    @Test
    fun `getAll returns non-deleted transactions`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData should provide transactions")
            assertTrue(list.all { it.deletedAt == null })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getAll returns transactions sorted by date descending`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val list = awaitItem()
            val dates = list.map { it.date }
            assertEquals(dates.sortedDescending(), dates, "Transactions should be newest first")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByAccountId filters correctly`() = runTest {
        val repo = createRepo()
        val accountId = SyncId("acc-checking")

        repo.getByAccountId(accountId).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has checking transactions")
            assertTrue(list.all { it.accountId == accountId })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByAccountId returns empty for unknown account`() = runTest {
        val repo = createRepo()

        repo.getByAccountId(SyncId("acc-nonexistent")).test {
            val list = awaitItem()
            assertTrue(list.isEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByCategoryId filters correctly`() = runTest {
        val repo = createRepo()
        val categoryId = SyncId("cat-groceries")

        repo.getByCategoryId(categoryId).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has grocery transactions")
            assertTrue(list.all { it.categoryId == categoryId })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByDateRange returns transactions within range`() = runTest {
        val repo = createRepo()
        val from = today.minus(2, DateTimeUnit.DAY)
        val to = today

        repo.getByDateRange(from, to).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "Should have transactions in the last 2 days")
            assertTrue(list.all { it.date in from..to }, "All dates should be within range")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getByDateRange returns empty for future range`() = runTest {
        val repo = createRepo()
        val futureStart = LocalDate(2099, 1, 1)
        val futureEnd = LocalDate(2099, 12, 31)

        repo.getByDateRange(futureStart, futureEnd).test {
            val list = awaitItem()
            assertTrue(list.isEmpty(), "No transactions should exist in the far future")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search matches payee text case-insensitively`() = runTest {
        val repo = createRepo()

        repo.search("starbucks").test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData contains a Starbucks transaction")
            assertTrue(list.all { it.payee?.contains("Starbucks", ignoreCase = true) == true })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search matches note text`() = runTest {
        val repo = createRepo()

        // Create a transaction with a note, then search for it
        val txn = transaction("txn-note-test", payee = "SomePayee", note = "Birthday dinner")
        repo.create(txn)

        repo.search("birthday").test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "Should find transaction by note text")
            assertTrue(list.any { it.id == SyncId("txn-note-test") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search returns empty for no matches`() = runTest {
        val repo = createRepo()

        repo.search("zzz-no-match-zzz").test {
            val list = awaitItem()
            assertTrue(list.isEmpty(), "No transactions should match gibberish query")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `create adds transaction`() = runTest {
        val repo = createRepo()
        val newTxn = transaction("txn-new", payee = "New Store")

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size

            repo.create(newTxn)

            val after = awaitItem()
            assertEquals(sizeBefore + 1, after.size)
            assertNotNull(after.find { it.id == SyncId("txn-new") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `delete soft-deletes transaction`() = runTest {
        val repo = createRepo()
        val targetId = SyncId("txn-1")

        repo.delete(targetId)

        repo.getById(targetId).test {
            val result = awaitItem()
            assertNull(result, "Soft-deleted transaction should not appear via getById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleted transactions excluded from getAll`() = runTest {
        val repo = createRepo()

        repo.getAll().test {
            val before = awaitItem()
            val sizeBefore = before.size
            val targetId = before.first().id

            repo.delete(targetId)

            val after = awaitItem()
            assertEquals(sizeBefore - 1, after.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `getPayeeHistory returns distinct sorted payees`() = runTest {
        val repo = createRepo()

        repo.getPayeeHistory().test {
            val payees = awaitItem()
            assertTrue(payees.isNotEmpty())
            assertEquals(payees.sorted(), payees, "Payees should be alphabetically sorted")
            assertEquals(payees.distinct(), payees, "Payees should be distinct")
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
            val newTxn = transaction("txn-flow-test", payee = "Flow Test Payee")
            repo.create(newTxn)
            val afterCreate = awaitItem()
            assertEquals(initialSize + 1, afterCreate.size)

            // Update → new emission
            val toUpdate = afterCreate.first { it.id == SyncId("txn-flow-test") }
            repo.update(toUpdate.copy(payee = "Updated Payee", updatedAt = Clock.System.now()))
            val afterUpdate = awaitItem()
            assertEquals("Updated Payee", afterUpdate.first { it.id == SyncId("txn-flow-test") }.payee)

            // Delete → new emission
            repo.delete(SyncId("txn-flow-test"))
            val afterDelete = awaitItem()
            assertEquals(initialSize, afterDelete.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
