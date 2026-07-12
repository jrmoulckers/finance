// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Transaction
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
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Unit tests for [GigToolsViewModel] wiring (#2141, #2137, #2133). */
@OptIn(ExperimentalCoroutinesApi::class)
class GigToolsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val householdId = SyncId("hh-1")
    private val fixedNow = Instant.fromEpochMilliseconds(1_700_000_000_000L)
    private val fixedClock = object : Clock {
        override fun now(): Instant = fixedNow
    }

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class InMemoryShiftRepository(initial: List<MileageShift> = emptyList()) : GigShiftRepository {
        private var stored = initial
        override fun shifts(): List<MileageShift> = stored.sortedByDescending { it.startedAt }
        override fun upsert(shift: MileageShift) {
            stored = stored.filterNot { it.id == shift.id } + shift
        }
        override fun clear() { stored = emptyList() }
    }

    private class TestTransactionRepository(initial: List<Transaction>) : TransactionRepository {
        private val transactions = MutableStateFlow(initial)
        override fun observeAll(householdId: SyncId): Flow<List<Transaction>> = transactions
        override fun observeById(id: SyncId): Flow<Transaction?> =
            transactions.map { list -> list.find { it.id == id } }
        override suspend fun getById(id: SyncId): Transaction? = transactions.value.find { it.id == id }
        override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
            transactions.map { list -> list.filter { it.accountId == accountId } }
        override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> =
            transactions.map { list -> list.filter { it.categoryId == categoryId } }
        override fun observeByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): Flow<List<Transaction>> =
            transactions.map { list -> list.filter { it.date in start..end } }
        override suspend fun getByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): List<Transaction> =
            transactions.value.filter { it.date in start..end }
        override suspend fun insert(entity: Transaction) { transactions.value = transactions.value + entity }
        override suspend fun update(entity: Transaction) { /* no-op */ }
        override suspend fun delete(id: SyncId) { /* no-op */ }
        override suspend fun getUnsynced(householdId: SyncId): List<Transaction> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) { /* no-op */ }
    }

    private fun income(id: String, payee: String, cents: Long) = Transaction(
        id = SyncId(id),
        householdId = householdId,
        ownerId = householdId,
        accountId = SyncId("acc-1"),
        type = TransactionType.INCOME,
        amount = Cents(cents),
        currency = Currency.USD,
        payee = payee,
        date = LocalDate(2024, 1, 10),
        createdAt = fixedNow,
        updatedAt = fixedNow,
    )

    private fun viewModel(
        transactions: List<Transaction> = emptyList(),
        shiftRepo: GigShiftRepository = InMemoryShiftRepository(),
    ) = GigToolsViewModel(
        householdIdProvider = TestHouseholdIdProvider(householdId),
        transactionRepository = TestTransactionRepository(transactions),
        shiftStore = shiftRepo,
        clock = fixedClock,
    )

    @Test
    fun `loads payouts grouped by platform`() = runTest(testDispatcher) {
        val vm = viewModel(
            transactions = listOf(
                income("1", "UBER", 4_000),
                income("2", "DOORDASH", 1_500),
            ),
        )
        advanceUntilIdle()
        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertEquals(2, state.payoutRows.size)
        assertEquals("Uber", state.payoutRows.first().platformName)
    }

    @Test
    fun `starting and ending a shift records mileage`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        vm.startShift(GigPlatform.UBER, startOdometer = 1000)
        assertTrue(vm.uiState.value.hasActiveShift)
        vm.endShift(endOdometer = 1075)
        val state = vm.uiState.value
        assertFalse(state.hasActiveShift)
        assertEquals(75, state.totalMiles)
    }

    @Test
    fun `ending a shift with bad odometer surfaces an error`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        vm.startShift(GigPlatform.UBER, startOdometer = 1000)
        vm.endShift(endOdometer = 500) // lower than start
        assertEquals(GigError.INVALID_MILEAGE, vm.uiState.value.error)
    }

    @Test
    fun `cannot start a second shift while one is active`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        vm.startShift(GigPlatform.UBER, startOdometer = 1000)
        vm.startShift(GigPlatform.LYFT, startOdometer = 2000)
        assertEquals(GigError.SHIFT_ALREADY_ACTIVE, vm.uiState.value.error)
    }
}
