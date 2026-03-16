// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import app.cash.turbine.test
import com.finance.models.Transaction
import kotlinx.coroutines.flow.first
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
    fun `observeAll returns non-deleted transactions`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData should provide transactions")
            assertTrue(list.all { it.deletedAt == null })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeAll returns transactions sorted by date descending`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            val dates = list.map { it.date }
            assertEquals(dates.sortedDescending(), dates, "Transactions should be newest first")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeByAccount filters correctly`() = runTest {
        val repo = createRepo()
        val accountId = SyncId("acc-checking")

        repo.observeByAccount(accountId).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has checking transactions")
            assertTrue(list.all { it.accountId == accountId })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeByAccount returns empty for unknown account`() = runTest {
        val repo = createRepo()

        repo.observeByAccount(SyncId("acc-nonexistent")).test {
            val list = awaitItem()
            assertTrue(list.isEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeByCategory filters correctly`() = runTest {
        val repo = createRepo()
        val categoryId = SyncId("cat-groceries")

        repo.observeByCategory(categoryId).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "SampleData has grocery transactions")
            assertTrue(list.all { it.categoryId == categoryId })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeByDateRange returns transactions within range`() = runTest {
        val repo = createRepo()
        val from = today.minus(2, DateTimeUnit.DAY)
        val to = today

        repo.observeByDateRange(SyncId("household-1"), from, to).test {
            val list = awaitItem()
            assertTrue(list.isNotEmpty(), "Should have transactions in the last 2 days")
            assertTrue(list.all { it.date in from..to }, "All dates should be within range")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeByDateRange returns empty for future range`() = runTest {
        val repo = createRepo()
        val futureStart = LocalDate(2099, 1, 1)
        val futureEnd = LocalDate(2099, 12, 31)

        repo.observeByDateRange(SyncId("household-1"), futureStart, futureEnd).test {
            val list = awaitItem()
            assertTrue(list.isEmpty(), "No transactions should exist in the far future")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeAll contains Starbucks transaction`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            val matches = list.filter { it.payee?.contains("Starbucks", ignoreCase = true) == true }
            assertTrue(matches.isNotEmpty(), "SampleData contains a Starbucks transaction")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeAll contains transaction with note`() = runTest {
        val repo = createRepo()

        val txn = transaction("txn-note-test", payee = "SomePayee", note = "Birthday dinner")
        repo.insert(txn)

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            val matches = list.filter { it.note?.contains("Birthday", ignoreCase = true) == true }
            assertTrue(matches.isNotEmpty(), "Should find transaction by note text")
            assertTrue(matches.any { it.id == SyncId("txn-note-test") })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeAll has no transactions matching gibberish`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            val list = awaitItem()
            val matches = list.filter {
                it.payee?.contains("zzz-no-match-zzz", ignoreCase = true) == true ||
                    it.note?.contains("zzz-no-match-zzz", ignoreCase = true) == true
            }
            assertTrue(matches.isEmpty(), "No transactions should match gibberish query")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `insert adds transaction`() = runTest {
        val repo = createRepo()
        val newTxn = transaction("txn-new", payee = "New Store")

        repo.observeAll(SyncId("household-1")).test {
            val before = awaitItem()
            val sizeBefore = before.size

            repo.insert(newTxn)

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

        repo.observeById(targetId).test {
            val result = awaitItem()
            assertNull(result, "Soft-deleted transaction should not appear via observeById")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `deleted transactions excluded from observeAll`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
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
    fun `observeAll provides distinct payees`() = runTest {
        val repo = createRepo()

        val payees = repo.observeAll(SyncId("household-1")).first()
            .mapNotNull { it.payee }
            .distinct()
        assertTrue(payees.isNotEmpty())
        assertEquals(payees.distinct(), payees, "Payees should be distinct")
    }

    @Test
    fun `Flow re-emits on mutations`() = runTest {
        val repo = createRepo()

        repo.observeAll(SyncId("household-1")).test {
            // Initial emission
            val initial = awaitItem()
            val initialSize = initial.size

            // Create → new emission
            val newTxn = transaction("txn-flow-test", payee = "Flow Test Payee")
            repo.insert(newTxn)
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
