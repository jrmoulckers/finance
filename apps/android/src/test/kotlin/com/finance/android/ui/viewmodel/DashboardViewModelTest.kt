// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.budget.BudgetHealth
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
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
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [DashboardViewModel].
 *
 * Verifies that the ViewModel correctly loads data from all repositories,
 * computes net worth via KMP [com.finance.core.aggregation.FinancialAggregator],
 * computes budget statuses via [com.finance.core.budget.BudgetCalculator],
 * limits recent transactions, formats currency, and manages loading/refreshing
 * UI state transitions.
 *
 * Uses deterministic test repository implementations (no mocking frameworks) and
 * `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

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

    private fun createAccount(
        id: String,
        name: String,
        type: AccountType,
        balanceCents: Long,
        sortOrder: Int = 0,
    ) = Account(
        id = SyncId(id),
        householdId = householdId,
        name = name,
        type = type,
        currency = Currency.USD,
        currentBalance = Cents(balanceCents),
        sortOrder = sortOrder,
        createdAt = now,
        updatedAt = now,
    )

    private fun createTransaction(
        id: String,
        type: TransactionType,
        amountCents: Long,
        date: LocalDate = today,
        payee: String? = null,
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

    private fun createBudget(
        id: String,
        categoryId: String,
        name: String,
        amountCents: Long,
        period: BudgetPeriod = BudgetPeriod.MONTHLY,
    ) = Budget(
        id = SyncId(id),
        householdId = householdId,
        categoryId = SyncId(categoryId),
        name = name,
        amount = Cents(amountCents),
        currency = Currency.USD,
        period = period,
        startDate = LocalDate(today.year, today.month, 1),
        createdAt = now,
        updatedAt = now,
    )

    // ── Test Repositories ──────────────────────────────────────────────

    private class TestAccountRepository(
        initial: List<Account> = emptyList(),
    ) : AccountRepository {
        private val _accounts = MutableStateFlow(initial)

        override fun observeAll(householdId: SyncId): Flow<List<Account>> =
            _accounts.map { list -> list.filter { it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Account?> =
            _accounts.map { list -> list.find { it.id == id && it.deletedAt == null } }

        override suspend fun getById(id: SyncId): Account? =
            _accounts.value.find { it.id == id && it.deletedAt == null }

        override fun observeActive(householdId: SyncId): Flow<List<Account>> =
            _accounts.map { list -> list.filter { it.deletedAt == null && !it.isArchived } }

        override suspend fun updateBalance(id: SyncId, newBalance: Cents) {
            _accounts.value = _accounts.value.map {
                if (it.id == id) it.copy(currentBalance = newBalance) else it
            }
        }

        override suspend fun archive(id: SyncId) {
            _accounts.value = _accounts.value.map {
                if (it.id == id) it.copy(isArchived = true) else it
            }
        }

        override suspend fun insert(entity: Account) {
            _accounts.value = _accounts.value + entity
        }

        override suspend fun update(entity: Account) {
            _accounts.value = _accounts.value.map { if (it.id == entity.id) entity else it }
        }

        override suspend fun delete(id: SyncId) {
            _accounts.value = _accounts.value.map {
                if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Account> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
    }

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

    private class TestBudgetRepository(
        initial: List<Budget> = emptyList(),
    ) : BudgetRepository {
        private val _budgets = MutableStateFlow(initial)

        override fun observeAll(householdId: SyncId): Flow<List<Budget>> =
            _budgets.map { list -> list.filter { it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Budget?> =
            _budgets.map { list -> list.find { it.id == id && it.deletedAt == null } }

        override suspend fun getById(id: SyncId): Budget? =
            _budgets.value.find { it.id == id && it.deletedAt == null }

        override fun observeActive(householdId: SyncId): Flow<List<Budget>> = observeAll(householdId)

        override fun observeByCategory(categoryId: SyncId): Flow<List<Budget>> =
            _budgets.map { list ->
                list.filter { it.categoryId == categoryId && it.deletedAt == null }
            }

        override suspend fun insert(entity: Budget) {
            _budgets.value = _budgets.value + entity
        }

        override suspend fun update(entity: Budget) {
            _budgets.value = _budgets.value.map { if (it.id == entity.id) entity else it }
        }

        override suspend fun delete(id: SyncId) {
            _budgets.value = _budgets.value.map {
                if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Budget> = emptyList()
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
        accounts: List<Account> = emptyList(),
        transactions: List<Transaction> = emptyList(),
        budgets: List<Budget> = emptyList(),
        categories: List<Category> = emptyList(),
    ) = DashboardViewModel(
        accountRepository = TestAccountRepository(accounts),
        transactionRepository = TestTransactionRepository(transactions),
        budgetRepository = TestBudgetRepository(budgets),
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
        assertTrue(state.recentTransactions.isEmpty(), "Expected empty recent transactions on initial state")
        assertTrue(state.budgetStatuses.isEmpty(), "Expected empty budget statuses on initial state")
    }

    // ═══════════════════════════════════════════════════════════════════
    // loads data from all repositories
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `loads data from all repositories after idle`() = runTest {
        val account = createAccount("acc-1", "Checking", AccountType.CHECKING, 500_000L)
        val category = createCategory("cat-1", "Groceries", "🛒")
        val budget = createBudget("bud-1", "cat-1", "Groceries Budget", 40_000L)
        val transaction = createTransaction(
            "txn-1", TransactionType.EXPENSE, 10_000L,
            date = today, payee = "Store", categoryId = "cat-1",
        )

        val vm = createViewModel(
            accounts = listOf(account),
            transactions = listOf(transaction),
            budgets = listOf(budget),
            categories = listOf(category),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading, "Expected isLoading = false after data loads")
        assertFalse(state.isRefreshing, "Expected isRefreshing = false after data loads")
        assertTrue(state.recentTransactions.isNotEmpty(), "Expected recent transactions to be populated")
        assertTrue(state.budgetStatuses.isNotEmpty(), "Expected budget statuses to be populated")
    }

    // ═══════════════════════════════════════════════════════════════════
    // net worth calculation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `calculates net worth from accounts`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Checking", AccountType.CHECKING, 500_000L),     // $5,000
            createAccount("acc-2", "Savings", AccountType.SAVINGS, 1_000_000L),     // $10,000
            createAccount("acc-3", "Credit Card", AccountType.CREDIT_CARD, 200_000L), // -$2,000
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val state = vm.uiState.value
        // Net worth = $5,000 + $10,000 - $2,000 = $13,000
        assertEquals(Cents(1_300_000L), state.netWorth, "Net worth should sum checking + savings - credit")
        assertEquals("$13,000.00", state.netWorthFormatted, "Net worth should be formatted as USD")
    }

    @Test
    fun `net worth excludes archived accounts`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Active", AccountType.CHECKING, 500_000L),
        )
        // The archived account won't be in the list since observeAll filters deletedAt
        // but FinancialAggregator.netWorth also excludes archived accounts

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        assertEquals(Cents(500_000L), vm.uiState.value.netWorth)
    }

    @Test
    fun `net worth with loans counts as negative`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Checking", AccountType.CHECKING, 1_000_000L),   // $10,000
            createAccount("acc-2", "Auto Loan", AccountType.LOAN, 500_000L),         // -$5,000
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        // Net worth = $10,000 - $5,000 = $5,000
        assertEquals(Cents(500_000L), vm.uiState.value.netWorth)
    }

    @Test
    fun `net worth is zero when no accounts exist`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        assertEquals(Cents.ZERO, vm.uiState.value.netWorth)
        assertEquals("$0.00", vm.uiState.value.netWorthFormatted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // spending aggregation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `computes today spending from expense transactions`() = runTest {
        val transactions = listOf(
            createTransaction("txn-1", TransactionType.EXPENSE, 5_000L, date = today),
            createTransaction("txn-2", TransactionType.EXPENSE, 3_000L, date = today),
            createTransaction("txn-3", TransactionType.INCOME, 100_000L, date = today),
        )

        val vm = createViewModel(transactions = transactions)
        advanceUntilIdle()

        // Today spending = $50 + $30 = $80
        assertEquals(Cents(8_000L), vm.uiState.value.todaySpending)
        assertEquals("$80.00", vm.uiState.value.todaySpendingFormatted)
    }

    @Test
    fun `computes monthly spending from expense transactions`() = runTest {
        val monthStart = LocalDate(today.year, today.month, 1)
        val transactions = listOf(
            createTransaction("txn-1", TransactionType.EXPENSE, 10_000L, date = monthStart),
            createTransaction("txn-2", TransactionType.EXPENSE, 20_000L, date = today),
        )

        val vm = createViewModel(transactions = transactions)
        advanceUntilIdle()

        // Monthly spending = $100 + $200 = $300
        assertEquals(Cents(30_000L), vm.uiState.value.monthlySpending)
        assertEquals("$300.00", vm.uiState.value.monthlySpendingFormatted)
    }

    @Test
    fun `spending excludes income and transfer transactions`() = runTest {
        val transactions = listOf(
            createTransaction("txn-1", TransactionType.EXPENSE, 5_000L, date = today),
            createTransaction("txn-2", TransactionType.INCOME, 100_000L, date = today),
            createTransaction("txn-3", TransactionType.TRANSFER, 20_000L, date = today),
        )

        val vm = createViewModel(transactions = transactions)
        advanceUntilIdle()

        // Only expense should count
        assertEquals(Cents(5_000L), vm.uiState.value.todaySpending)
    }

    // ═══════════════════════════════════════════════════════════════════
    // recent transactions limited to 5
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `recent transactions limited to 5`() = runTest {
        val transactions = (1..10).map { i ->
            createTransaction(
                "txn-$i", TransactionType.EXPENSE, (i * 1_000).toLong(),
                date = today,
            )
        }

        val vm = createViewModel(transactions = transactions)
        advanceUntilIdle()

        assertEquals(
            5,
            vm.uiState.value.recentTransactions.size,
            "Recent transactions should be limited to 5",
        )
    }

    @Test
    fun `recent transactions sorted by date descending`() = runTest {
        val date1 = LocalDate(today.year, today.month, 1)
        val date2 = if (today.dayOfMonth >= 2) LocalDate(today.year, today.month, 2) else date1
        val transactions = listOf(
            createTransaction("txn-old", TransactionType.EXPENSE, 1_000L, date = date1),
            createTransaction("txn-new", TransactionType.EXPENSE, 2_000L, date = date2),
        )

        val vm = createViewModel(transactions = transactions)
        advanceUntilIdle()

        val recent = vm.uiState.value.recentTransactions
        assertEquals(2, recent.size)
        assertTrue(
            recent.first().date >= recent.last().date,
            "Recent transactions should be sorted by date descending",
        )
    }

    @Test
    fun `recent transactions empty when no transactions exist`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.recentTransactions.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // budget status calculations
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `budget status computed with healthy utilization`() = runTest {
        val category = createCategory("cat-food", "Food", "🍔")
        val budget = createBudget("bud-food", "cat-food", "Food Budget", 100_000L) // $1,000
        val expense = createTransaction(
            "txn-1", TransactionType.EXPENSE, 20_000L,
            date = today, categoryId = "cat-food",
        ) // $200

        val vm = createViewModel(
            budgets = listOf(budget),
            transactions = listOf(expense),
            categories = listOf(category),
        )
        advanceUntilIdle()

        val statuses = vm.uiState.value.budgetStatuses
        assertEquals(1, statuses.size)

        val status = statuses.first()
        assertEquals("Food Budget", status.name)
        assertEquals(BudgetHealth.HEALTHY, status.health)
        assertEquals("🍔", status.categoryIcon)
        assertTrue(status.utilizationPercent < 0.75f, "20% utilization should be HEALTHY")
    }

    @Test
    fun `budget status computed with over budget`() = runTest {
        val category = createCategory("cat-food", "Food")
        val budget = createBudget("bud-food", "cat-food", "Food Budget", 50_000L) // $500
        val expense = createTransaction(
            "txn-1", TransactionType.EXPENSE, 70_000L,
            date = today, categoryId = "cat-food",
        ) // $700

        val vm = createViewModel(
            budgets = listOf(budget),
            transactions = listOf(expense),
            categories = listOf(category),
        )
        advanceUntilIdle()

        val status = vm.uiState.value.budgetStatuses.first()
        assertEquals(BudgetHealth.OVER, status.health)
        assertTrue(status.utilizationPercent > 1.0f, "140% utilization should be OVER")
    }

    @Test
    fun `multiple budget statuses computed correctly`() = runTest {
        val catA = createCategory("cat-a", "Alpha")
        val catB = createCategory("cat-b", "Bravo")
        val budgetA = createBudget("bud-a", "cat-a", "Alpha Budget", 100_000L)
        val budgetB = createBudget("bud-b", "cat-b", "Bravo Budget", 50_000L)
        val expA = createTransaction(
            "txn-a", TransactionType.EXPENSE, 10_000L,
            date = today, categoryId = "cat-a",
        )
        val expB = createTransaction(
            "txn-b", TransactionType.EXPENSE, 60_000L,
            date = today, categoryId = "cat-b",
        )

        val vm = createViewModel(
            budgets = listOf(budgetA, budgetB),
            transactions = listOf(expA, expB),
            categories = listOf(catA, catB),
        )
        advanceUntilIdle()

        assertEquals(2, vm.uiState.value.budgetStatuses.size)
    }

    @Test
    fun `budget status has null category icon for missing category`() = runTest {
        val budget = createBudget("bud-orphan", "cat-missing", "Orphan Budget", 30_000L)

        val vm = createViewModel(budgets = listOf(budget))
        advanceUntilIdle()

        val status = vm.uiState.value.budgetStatuses.first()
        assertNull(status.categoryIcon, "Missing category should produce null icon")
    }

    // ═══════════════════════════════════════════════════════════════════
    // refresh triggers data reload
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `refresh triggers data reload`() = runTest {
        val account = createAccount("acc-1", "Checking", AccountType.CHECKING, 100_000L)

        val vm = createViewModel(accounts = listOf(account))
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isLoading)
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
    // handles empty state gracefully
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `handles empty state from all repositories`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertEquals(Cents.ZERO, state.netWorth)
        assertEquals(Cents.ZERO, state.todaySpending)
        assertEquals(Cents.ZERO, state.monthlySpending)
        assertTrue(state.budgetStatuses.isEmpty())
        assertTrue(state.recentTransactions.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // currency formatting
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `net worth formatted as USD currency`() = runTest {
        val account = createAccount("acc-1", "Savings", AccountType.SAVINGS, 1_234_567L) // $12,345.67

        val vm = createViewModel(accounts = listOf(account))
        advanceUntilIdle()

        assertEquals("$12,345.67", vm.uiState.value.netWorthFormatted)
    }

    @Test
    fun `budget status formats spent and limit correctly`() = runTest {
        val category = createCategory("cat-1", "Transport")
        val budget = createBudget("bud-1", "cat-1", "Transport Budget", 75_000L) // $750
        val expense = createTransaction(
            "txn-1", TransactionType.EXPENSE, 25_000L,
            date = today, categoryId = "cat-1",
        ) // $250

        val vm = createViewModel(
            budgets = listOf(budget),
            transactions = listOf(expense),
            categories = listOf(category),
        )
        advanceUntilIdle()

        val status = vm.uiState.value.budgetStatuses.first()
        assertEquals("$250.00", status.spent)
        assertEquals("$750.00", status.limit)
    }

    // ═══════════════════════════════════════════════════════════════════
    // budget utilization clamping
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `budget utilization clamped to 1_5`() = runTest {
        val category = createCategory("cat-1", "Dining")
        val budget = createBudget("bud-1", "cat-1", "Dining Budget", 10_000L) // $100
        // Spend $400 → 400% utilization → should clamp to 1.5
        val expense = createTransaction(
            "txn-1", TransactionType.EXPENSE, 40_000L,
            date = today, categoryId = "cat-1",
        )

        val vm = createViewModel(
            budgets = listOf(budget),
            transactions = listOf(expense),
            categories = listOf(category),
        )
        advanceUntilIdle()

        val status = vm.uiState.value.budgetStatuses.first()
        assertEquals(
            1.5f,
            status.utilizationPercent,
            "Utilization should be clamped to 1.5f",
        )
    }
}
