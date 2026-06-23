// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickcash

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Category
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
import kotlinx.datetime.LocalDate
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [QuickCashEntryViewModel].
 *
 * Verifies cash-first default selection on init, formatted-amount preview, validation
 * surfacing, and one-tap save via a deterministic in-memory repository (no mocking).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class QuickCashEntryViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val now = Clock.System.now()
    private val householdId = SyncId("household-1")

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun account(
        id: String,
        name: String,
        type: AccountType = AccountType.CHECKING,
        sortOrder: Int = 0,
    ) = Account(
        id = SyncId(id),
        householdId = householdId,
        ownerId = householdId,
        name = name,
        type = type,
        currency = Currency.USD,
        currentBalance = Cents(0L),
        sortOrder = sortOrder,
        createdAt = now,
        updatedAt = now,
    )

    private fun category(id: String, name: String, isIncome: Boolean = false) = Category(
        id = SyncId(id),
        householdId = householdId,
        ownerId = householdId,
        name = name,
        isIncome = isIncome,
        createdAt = now,
        updatedAt = now,
    )

    private class TestAccountRepository(initial: List<Account>) : AccountRepository {
        private val accounts = MutableStateFlow(initial)
        override fun observeAll(householdId: SyncId): Flow<List<Account>> =
            accounts.map { list -> list.filter { it.deletedAt == null } }
        override fun observeById(id: SyncId): Flow<Account?> =
            accounts.map { list -> list.find { it.id == id } }
        override suspend fun getById(id: SyncId): Account? = accounts.value.find { it.id == id }
        override fun observeActive(householdId: SyncId): Flow<List<Account>> =
            accounts.map { list -> list.filter { !it.isArchived } }
        override suspend fun updateBalance(id: SyncId, newBalance: Cents) { /* no-op */ }
        override suspend fun archive(id: SyncId) { /* no-op */ }
        override suspend fun insert(entity: Account) { accounts.value = accounts.value + entity }
        override suspend fun update(entity: Account) { /* no-op */ }
        override suspend fun delete(id: SyncId) { /* no-op */ }
        override suspend fun getUnsynced(householdId: SyncId): List<Account> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) { /* no-op */ }
    }

    private class TestCategoryRepository(initial: List<Category>) : CategoryRepository {
        private val categories = MutableStateFlow(initial)
        override fun observeAll(householdId: SyncId): Flow<List<Category>> =
            categories.map { list -> list.filter { it.deletedAt == null } }
        override fun observeById(id: SyncId): Flow<Category?> =
            categories.map { list -> list.find { it.id == id } }
        override suspend fun getById(id: SyncId): Category? = categories.value.find { it.id == id }
        override fun observeByParent(parentId: SyncId?): Flow<List<Category>> =
            categories.map { list -> list.filter { it.parentId == parentId } }
        override fun observeIncome(householdId: SyncId): Flow<List<Category>> =
            categories.map { list -> list.filter { it.isIncome } }
        override fun observeExpense(householdId: SyncId): Flow<List<Category>> =
            categories.map { list -> list.filter { !it.isIncome } }
        override suspend fun insert(entity: Category) { categories.value = categories.value + entity }
        override suspend fun update(entity: Category) { /* no-op */ }
        override suspend fun delete(id: SyncId) { /* no-op */ }
        override suspend fun getUnsynced(householdId: SyncId): List<Category> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) { /* no-op */ }
    }

    private class TestTransactionRepository : TransactionRepository {
        private val transactions = MutableStateFlow<List<Transaction>>(emptyList())
        var lastInserted: Transaction? = null
            private set
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
        override suspend fun insert(entity: Transaction) {
            lastInserted = entity
            transactions.value = transactions.value + entity
        }
        override suspend fun update(entity: Transaction) { /* no-op */ }
        override suspend fun delete(id: SyncId) { /* no-op */ }
        override suspend fun getUnsynced(householdId: SyncId): List<Transaction> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) { /* no-op */ }
    }

    private fun viewModel(
        accounts: List<Account> = listOf(
            account("acc-checking", "Checking", AccountType.CHECKING, sortOrder = 0),
            account("acc-cash", "Wallet", AccountType.CASH, sortOrder = 1),
        ),
        categories: List<Category> = listOf(
            category("cat-food", "Food"),
            category("cat-salary", "Salary", isIncome = true),
        ),
        txnRepo: TestTransactionRepository = TestTransactionRepository(),
    ) = QuickCashEntryViewModel(
        householdIdProvider = TestHouseholdIdProvider(householdId),
        transactionRepository = txnRepo,
        accountRepository = TestAccountRepository(accounts),
        categoryRepository = TestCategoryRepository(categories),
        prefs = null,
    )

    @Test
    fun `init defaults to cash account and excludes income categories`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        val state = vm.uiState.value
        assertEquals(SyncId("acc-cash"), state.selectedAccountId)
        assertEquals("Wallet", state.selectedAccountName)
        assertTrue(state.categories.none { it.isIncome })
        assertEquals(SyncId("cat-food"), state.selectedCategoryId)
    }

    @Test
    fun `cash account is listed first`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        assertEquals(SyncId("acc-cash"), vm.uiState.value.cashAccounts.first().id)
    }

    @Test
    fun `updating amount produces a formatted preview`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        vm.updateAmount("12.50")
        assertEquals("$12.50", vm.uiState.value.formattedAmount)
    }

    @Test
    fun `saving with zero amount surfaces a validation error and does not insert`() =
        runTest(testDispatcher) {
            val txnRepo = TestTransactionRepository()
            val vm = viewModel(txnRepo = txnRepo)
            advanceUntilIdle()
            vm.save()
            advanceUntilIdle()
            assertTrue(QuickCashError.INVALID_AMOUNT in vm.uiState.value.errors)
            assertNull(txnRepo.lastInserted)
            assertFalse(vm.uiState.value.isSaved)
        }

    @Test
    fun `one-tap save inserts a negative cash expense`() = runTest(testDispatcher) {
        val txnRepo = TestTransactionRepository()
        val vm = viewModel(txnRepo = txnRepo)
        advanceUntilIdle()
        vm.updateAmount("7.25")
        vm.save()
        advanceUntilIdle()

        val inserted = txnRepo.lastInserted
        assertTrue(inserted != null)
        assertEquals(TransactionType.EXPENSE, inserted.type)
        assertEquals(Cents(-725L), inserted.amount)
        assertEquals(SyncId("acc-cash"), inserted.accountId)
        assertTrue(QuickCashEntry.QUICK_CASH_TAG in inserted.tags)
        assertTrue(vm.uiState.value.isSaved)
    }

    @Test
    fun `selecting an already-selected category clears it`() = runTest(testDispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        val current = vm.uiState.value.selectedCategoryId
        assertTrue(current != null)
        vm.selectCategory(current)
        assertNull(vm.uiState.value.selectedCategoryId)
    }
}
