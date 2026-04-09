// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Category
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
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [TransactionsViewModel].
 *
 * Verifies that the ViewModel correctly loads transactions, groups them by date,
 * filters by search query and transaction type, paginates results,
 * handles refresh and empty states, and formats date labels.
 *
 * Uses deterministic test repository implementations (no mocking frameworks) and
 * `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TransactionsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private val now = Clock.System.now()
    private val today: LocalDate =
        now.toLocalDateTime(TimeZone.currentSystemDefault()).date
    private val householdId = SyncId("household-1")

    private fun createTransaction(
        id: String,
        type: TransactionType = TransactionType.EXPENSE,
        amountCents: Long = 1_000L,
        date: LocalDate = today,
        payee: String? = null,
        note: String? = null,
        categoryId: String? = null,
        accountId: String = "acc-1",
    ): Transaction {
        val cents = if (type == TransactionType.INCOME) Cents(amountCents) else Cents(-amountCents)
        return Transaction(
            id = SyncId(id),
            householdId = householdId,
            accountId = SyncId(accountId),
            categoryId = categoryId?.let { SyncId(it) },
            type = type,
            status = TransactionStatus.CLEARED,
            amount = cents,
            currency = Currency.USD,
            date = date,
            payee = payee,
            note = note,
            transferAccountId = if (type == TransactionType.TRANSFER) SyncId("acc-transfer") else null,
            createdAt = now,
            updatedAt = now,
        )
    }

    private fun createCategory(
        id: String,
        name: String,
        icon: String? = null,
    ) = Category(
        id = SyncId(id),
        householdId = householdId,
        name = name,
        icon = icon,
        createdAt = now,
        updatedAt = now,
    )

    // ── Test Repositories ──────────────────────────────────────────────

    private class TestTransactionRepository(
        initial: List<Transaction> = emptyList(),
    ) : TransactionRepository {
        private val _transactions = MutableStateFlow(initial)

        override fun observeAll(householdId: SyncId): Flow<List<Transaction>> =
            _transactions.map { list -> list.filter { it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Transaction?> =
            _transactions.map { list -> list.find { it.id == id } }

        override suspend fun getById(id: SyncId): Transaction? =
            _transactions.value.find { it.id == id }

        override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
            _transactions.map { list -> list.filter { it.accountId == accountId } }

        override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> =
            _transactions.map { list -> list.filter { it.categoryId == categoryId } }

        override fun observeByDateRange(
            householdId: SyncId,
            start: LocalDate,
            end: LocalDate,
        ): Flow<List<Transaction>> =
            _transactions.map { list -> list.filter { it.date in start..end } }

        override suspend fun getByDateRange(
            householdId: SyncId,
            start: LocalDate,
            end: LocalDate,
        ): List<Transaction> =
            _transactions.value.filter { it.date in start..end }

        override suspend fun insert(entity: Transaction) {
            _transactions.value = _transactions.value + entity
        }

        override suspend fun update(entity: Transaction) {
            _transactions.value =
                _transactions.value.map { if (it.id == entity.id) entity else it }
        }

        override suspend fun delete(id: SyncId) {
            _transactions.value = _transactions.value.map {
                if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Transaction> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
    }

    private class TestCategoryRepository(
        initial: List<Category> = emptyList(),
    ) : CategoryRepository {
        private val _categories = MutableStateFlow(initial)

        override fun observeAll(householdId: SyncId): Flow<List<Category>> =
            _categories.map { list -> list.filter { it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Category?> =
            _categories.map { list -> list.find { it.id == id } }

        override suspend fun getById(id: SyncId): Category? =
            _categories.value.find { it.id == id }

        override fun observeByParent(parentId: SyncId?): Flow<List<Category>> =
            _categories.map { list -> list.filter { it.parentId == parentId && it.deletedAt == null } }

        override fun observeIncome(householdId: SyncId): Flow<List<Category>> =
            _categories.map { list -> list.filter { it.isIncome } }

        override fun observeExpense(householdId: SyncId): Flow<List<Category>> =
            _categories.map { list -> list.filter { !it.isIncome } }

        override suspend fun insert(entity: Category) {
            _categories.value = _categories.value + entity
        }

        override suspend fun update(entity: Category) {
            _categories.value =
                _categories.value.map { if (it.id == entity.id) entity else it }
        }

        override suspend fun delete(id: SyncId) {
            _categories.value = _categories.value.map {
                if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Category> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
    }

    private fun createViewModel(
        transactions: List<Transaction> = emptyList(),
        categories: List<Category> = emptyList(),
        householdIdProvider: TestHouseholdIdProvider = TestHouseholdIdProvider(),
    ) = TransactionsViewModel(
        householdIdProvider = householdIdProvider,
        transactionRepository = TestTransactionRepository(transactions),
        categoryRepository = TestCategoryRepository(categories),
    )

    // ═══════════════════════════════════════════════════════════════════
    // initial state is loading
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `initial state is loading`() = runTest {
        val vm = createViewModel()

        val state = vm.uiState.value
        assertTrue(state.isLoading, "Expected isLoading = true on initial state")
        assertFalse(state.isRefreshing, "Expected isRefreshing = false on initial state")
        assertTrue(state.dateGroups.isEmpty(), "Expected empty date groups on initial state")
        assertFalse(state.isSearchActive, "Expected isSearchActive = false on initial state")
    }

    // ═══════════════════════════════════════════════════════════════════
    // loads transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `loads transactions after idle`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "Store A"),
            createTransaction("txn-2", payee = "Store B"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading, "Expected isLoading = false after load")
        assertEquals(2, state.totalCount, "Expected 2 total transactions")
        assertFalse(state.isEmpty, "Expected isEmpty = false when transactions exist")
    }

    // ═══════════════════════════════════════════════════════════════════
    // date grouping
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `transactions grouped by date`() = runTest {
        val yesterday = today.minus(1, DateTimeUnit.DAY)
        val txns = listOf(
            createTransaction("txn-1", date = today, payee = "Today Store"),
            createTransaction("txn-2", date = today, payee = "Today Cafe"),
            createTransaction("txn-3", date = yesterday, payee = "Yesterday Shop"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        val groups = vm.uiState.value.dateGroups
        assertEquals(2, groups.size, "Expected 2 date groups (today and yesterday)")

        val todayGroup = groups.find { it.date == today }!!
        assertEquals(2, todayGroup.transactions.size, "Today group should have 2 transactions")
        assertEquals("Today", todayGroup.dateLabel)

        val yesterdayGroup = groups.find { it.date == yesterday }!!
        assertEquals(1, yesterdayGroup.transactions.size, "Yesterday group should have 1 transaction")
        assertEquals("Yesterday", yesterdayGroup.dateLabel)
    }

    @Test
    fun `date groups sorted by date descending`() = runTest {
        val yesterday = today.minus(1, DateTimeUnit.DAY)
        val twoDaysAgo = today.minus(2, DateTimeUnit.DAY)
        val txns = listOf(
            createTransaction("txn-1", date = twoDaysAgo, payee = "Old"),
            createTransaction("txn-2", date = today, payee = "New"),
            createTransaction("txn-3", date = yesterday, payee = "Mid"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        val groups = vm.uiState.value.dateGroups
        assertEquals(3, groups.size)
        assertTrue(
            groups[0].date >= groups[1].date && groups[1].date >= groups[2].date,
            "Date groups should be sorted descending",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // search filtering by payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `search filters by payee`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "Walmart"),
            createTransaction("txn-2", payee = "Target"),
            createTransaction("txn-3", payee = "Walgreens"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.updateSearch("Wal")
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(2, state.totalCount, "Search for 'Wal' should match Walmart and Walgreens")
    }

    @Test
    fun `search is case insensitive`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "AMAZON"),
            createTransaction("txn-2", payee = "Target"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.updateSearch("amazon")
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.totalCount, "Case-insensitive search should match AMAZON")
    }

    @Test
    fun `search filters by note`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "Store", note = "weekly groceries"),
            createTransaction("txn-2", payee = "Gas Station", note = "fuel"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.updateSearch("groceries")
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.totalCount, "Search should match on note field")
    }

    @Test
    fun `search filters by category name`() = runTest {
        val category = createCategory("cat-food", "Food")
        val txns = listOf(
            createTransaction("txn-1", payee = "Store", categoryId = "cat-food"),
            createTransaction("txn-2", payee = "Gas Station"),
        )

        val vm = createViewModel(transactions = txns, categories = listOf(category))
        advanceUntilIdle()

        vm.updateSearch("Food")
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.totalCount, "Search should match on category name")
    }

    @Test
    fun `clearing search shows all transactions`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "Walmart"),
            createTransaction("txn-2", payee = "Target"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.updateSearch("Walmart")
        advanceUntilIdle()
        assertEquals(1, vm.uiState.value.totalCount)

        vm.updateSearch("")
        advanceUntilIdle()
        assertEquals(2, vm.uiState.value.totalCount, "Empty search should show all transactions")
    }

    // ═══════════════════════════════════════════════════════════════════
    // toggle search
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `toggleSearch activates and deactivates search`() = runTest {
        val vm = createViewModel(
            transactions = listOf(createTransaction("txn-1", payee = "Store")),
        )
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isSearchActive)

        vm.toggleSearch()
        assertTrue(vm.uiState.value.isSearchActive, "toggleSearch should activate search")

        vm.toggleSearch()
        advanceUntilIdle()
        assertFalse(vm.uiState.value.isSearchActive, "toggleSearch again should deactivate search")
    }

    @Test
    fun `deactivating search clears query and reloads`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "Walmart"),
            createTransaction("txn-2", payee = "Target"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.toggleSearch() // activate
        vm.updateSearch("Walmart")
        advanceUntilIdle()
        assertEquals(1, vm.uiState.value.totalCount)

        vm.toggleSearch() // deactivate → clears query
        advanceUntilIdle()

        assertEquals("", vm.uiState.value.filter.searchQuery, "Search query should be cleared")
        assertEquals(2, vm.uiState.value.totalCount, "All transactions should be shown")
    }

    // ═══════════════════════════════════════════════════════════════════
    // type filtering
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `filter by expense type`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", type = TransactionType.EXPENSE, payee = "Store"),
            createTransaction("txn-2", type = TransactionType.INCOME, amountCents = 5_000L, payee = "Salary"),
            createTransaction("txn-3", type = TransactionType.EXPENSE, payee = "Cafe"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.setTypeFilter(TransactionType.EXPENSE)
        advanceUntilIdle()

        assertEquals(2, vm.uiState.value.totalCount, "Should show only expense transactions")
    }

    @Test
    fun `filter by income type`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", type = TransactionType.EXPENSE, payee = "Store"),
            createTransaction("txn-2", type = TransactionType.INCOME, amountCents = 5_000L, payee = "Salary"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.setTypeFilter(TransactionType.INCOME)
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.totalCount, "Should show only income transactions")
    }

    @Test
    fun `filter by transfer type`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", type = TransactionType.EXPENSE, payee = "Store"),
            createTransaction("txn-2", type = TransactionType.TRANSFER, amountCents = 10_000L, payee = "Transfer"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.setTypeFilter(TransactionType.TRANSFER)
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.totalCount, "Should show only transfer transactions")
    }

    @Test
    fun `null type filter shows all transactions`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", type = TransactionType.EXPENSE, payee = "Store"),
            createTransaction("txn-2", type = TransactionType.INCOME, amountCents = 5_000L, payee = "Salary"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.setTypeFilter(TransactionType.EXPENSE)
        advanceUntilIdle()
        assertEquals(1, vm.uiState.value.totalCount)

        vm.setTypeFilter(null)
        advanceUntilIdle()
        assertEquals(2, vm.uiState.value.totalCount, "null filter should show all transactions")
    }

    @Test
    fun `clearFilters resets all filters`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", type = TransactionType.EXPENSE, payee = "Store"),
            createTransaction("txn-2", type = TransactionType.INCOME, amountCents = 5_000L, payee = "Salary"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.setTypeFilter(TransactionType.EXPENSE)
        advanceUntilIdle()
        assertEquals(1, vm.uiState.value.totalCount)

        vm.clearFilters()
        advanceUntilIdle()

        assertEquals(2, vm.uiState.value.totalCount, "clearFilters should show all transactions")
        assertNull(vm.uiState.value.filter.type, "Type filter should be null after clear")
        assertEquals("", vm.uiState.value.filter.searchQuery, "Search query should be empty after clear")
    }

    // ═══════════════════════════════════════════════════════════════════
    // pagination / load more
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `pagination shows first page and indicates more available`() = runTest {
        // Create 25 transactions (page size is 20)
        val txns = (1..25).map { i ->
            createTransaction("txn-$i", payee = "Payee $i")
        }

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(25, state.totalCount, "Total count should be 25")
        assertTrue(state.hasMore, "hasMore should be true when more pages available")

        // Verify only first page of transactions are in the groups
        val displayedCount = state.dateGroups.sumOf { it.transactions.size }
        assertEquals(20, displayedCount, "First page should show 20 transactions")
    }

    @Test
    fun `loadMore loads additional transactions`() = runTest {
        val txns = (1..25).map { i ->
            createTransaction("txn-$i", payee = "Payee $i")
        }

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()
        assertTrue(vm.uiState.value.hasMore)

        vm.loadMore()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.hasMore, "hasMore should be false after loading all")
        val displayedCount = state.dateGroups.sumOf { it.transactions.size }
        assertEquals(25, displayedCount, "All 25 transactions should be shown after loadMore")
    }

    @Test
    fun `loadMore is no-op when no more data`() = runTest {
        val txns = (1..5).map { i ->
            createTransaction("txn-$i", payee = "Payee $i")
        }

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        assertFalse(vm.uiState.value.hasMore, "hasMore should be false when all data fits on first page")

        vm.loadMore()
        advanceUntilIdle()

        val displayedCount = vm.uiState.value.dateGroups.sumOf { it.transactions.size }
        assertEquals(5, displayedCount, "Count should remain unchanged")
    }

    // ═══════════════════════════════════════════════════════════════════
    // refresh
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `refresh triggers reload`() = runTest {
        val txns = listOf(createTransaction("txn-1", payee = "Store"))

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isRefreshing)

        vm.refresh()

        testDispatcher.scheduler.advanceTimeBy(100)
        testDispatcher.scheduler.runCurrent()
        assertTrue(
            vm.uiState.value.isRefreshing,
            "Expected isRefreshing = true during refresh",
        )

        advanceUntilIdle()
        assertFalse(
            vm.uiState.value.isRefreshing,
            "Expected isRefreshing = false after refresh completes",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // empty state
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `empty state when no transactions exist`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.isEmpty, "Expected isEmpty = true when no transactions")
        assertTrue(state.dateGroups.isEmpty())
        assertEquals(0, state.totalCount)
    }

    @Test
    fun `empty state when filter matches nothing`() = runTest {
        val txns = listOf(createTransaction("txn-1", payee = "Walmart"))

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()

        vm.updateSearch("nonexistent")
        advanceUntilIdle()

        assertEquals(0, vm.uiState.value.totalCount)
        assertTrue(vm.uiState.value.isEmpty, "isEmpty should be true when filter matches nothing")
    }

    // ═══════════════════════════════════════════════════════════════════
    // delete transaction
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `deleteTransaction removes transaction from list`() = runTest {
        val txns = listOf(
            createTransaction("txn-1", payee = "Keep"),
            createTransaction("txn-2", payee = "Delete"),
        )

        val vm = createViewModel(transactions = txns)
        advanceUntilIdle()
        assertEquals(2, vm.uiState.value.totalCount)

        vm.deleteTransaction(SyncId("txn-2"))
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.totalCount, "Should have 1 transaction after deletion")
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatDateLabel companion function
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `formatDateLabel returns Today for today`() {
        assertEquals("Today", TransactionsViewModel.formatDateLabel(today, today))
    }

    @Test
    fun `formatDateLabel returns Yesterday for yesterday`() {
        val yesterday = today.minus(1, DateTimeUnit.DAY)
        assertEquals("Yesterday", TransactionsViewModel.formatDateLabel(yesterday, today))
    }

    @Test
    fun `formatDateLabel returns abbreviated date for other dates`() {
        val date = LocalDate(2025, 3, 15)
        val ref = LocalDate(2025, 3, 20)
        assertEquals("Mar 15", TransactionsViewModel.formatDateLabel(date, ref))
    }

    @Test
    fun `formatDateLabel formats various months correctly`() {
        val ref = LocalDate(2025, 12, 31)
        assertEquals("Jan 1", TransactionsViewModel.formatDateLabel(LocalDate(2025, 1, 1), ref))
        assertEquals("Jun 15", TransactionsViewModel.formatDateLabel(LocalDate(2025, 6, 15), ref))
        assertEquals("Dec 25", TransactionsViewModel.formatDateLabel(LocalDate(2025, 12, 25), ref))
    }
}
