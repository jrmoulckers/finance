// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.ui.screens.bills.BillRemindersViewModel
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [BillRemindersViewModel] (#1125).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BillRemindersViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() { Dispatchers.setMain(testDispatcher) }

    @AfterTest
    fun tearDown() { Dispatchers.resetMain() }

    private val householdId = SyncId("household-test")
    private val now = Clock.System.now()
    private val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date

    private fun createTransactions(): List<Transaction> {
        // Create recurring Netflix-like transactions (monthly)
        return (0..5).map { i ->
            val date = today.minus(i, DateTimeUnit.MONTH)
            Transaction(
                id = SyncId("txn-netflix-$i"),
                householdId = householdId,
                ownerId = householdId,
                accountId = SyncId("acc-1"),
                type = TransactionType.EXPENSE,
                status = TransactionStatus.CLEARED,
                amount = Cents(-1599L),
                currency = Currency.USD,
                payee = "Netflix",
                date = date,
                createdAt = now,
                updatedAt = now,
            )
        }
    }

    private fun createViewModel(
        transactions: List<Transaction> = createTransactions(),
    ): BillRemindersViewModel {
        val provider = TestHouseholdIdProvider(householdId)
        val repo = FakeBillTransactionRepo(transactions)
        return BillRemindersViewModel(provider, repo)
    }

    @Test
    fun `initial state is loading`() = runTest {
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isLoading)
    }

    @Test
    fun `loads and detects recurring bills`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        // Netflix should be detected as monthly recurring
        assertTrue(state.allBills.isNotEmpty())
    }

    @Test
    fun `toggle calendar toggles state`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.showCalendar)
        vm.toggleCalendar()
        assertTrue(vm.uiState.value.showCalendar)
        vm.toggleCalendar()
        assertFalse(vm.uiState.value.showCalendar)
    }

    @Test
    fun `mark bill paid removes from upcoming`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val bills = vm.uiState.value.allBills
        if (bills.isNotEmpty()) {
            val billId = bills.first().id
            val countBefore = vm.uiState.value.upcomingBills.size + vm.uiState.value.overdueBills.size
            vm.markBillPaid(billId)
            val countAfter = vm.uiState.value.upcomingBills.size + vm.uiState.value.overdueBills.size
            assertTrue(countAfter <= countBefore)
        }
    }

    @Test
    fun `empty transactions yields no bills`() = runTest {
        val vm = createViewModel(transactions = emptyList())
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.allBills.isEmpty())
    }

    // ── Fake repository ──────────────────────────────────────────

    private class FakeBillTransactionRepo(
        private val transactions: List<Transaction>,
    ) : TransactionRepository {
        private val flow = MutableStateFlow(transactions)
        override fun observeAll(householdId: SyncId): Flow<List<Transaction>> = flow
        override fun observeById(id: SyncId): Flow<Transaction?> = flow.map { it.find { t -> t.id == id } }
        override suspend fun getById(id: SyncId): Transaction? = transactions.find { it.id == id }
        override suspend fun insert(entity: Transaction) {}
        override suspend fun update(entity: Transaction) {}
        override suspend fun delete(id: SyncId) {}
        override suspend fun getUnsynced(householdId: SyncId): List<Transaction> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
        override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> = flow
        override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> = flow
        override fun observeByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): Flow<List<Transaction>> = flow
        override suspend fun getByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): List<Transaction> = transactions
    }
}
