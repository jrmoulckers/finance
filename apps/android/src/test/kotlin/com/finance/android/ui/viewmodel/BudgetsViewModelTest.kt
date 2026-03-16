// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.budget.BudgetHealth
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
 * Unit tests for [BudgetsViewModel].
 *
 * Verifies that the ViewModel correctly loads budgets from repositories,
 * computes budget health and utilization via the KMP [com.finance.core.budget.BudgetCalculator],
 * formats currency strings, and manages loading/refreshing/error UI state transitions.
 *
 * Uses real mock repository implementations (no mocking frameworks) and
 * `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BudgetsViewModelTest {

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
    private val householdId = SyncId("household-test")

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

    private fun createExpense(
        id: String,
        categoryId: String,
        amountCents: Long,
        date: LocalDate = today,
    ) = Transaction(
        id = SyncId(id),
        householdId = householdId,
        accountId = SyncId("acc-test"),
        categoryId = SyncId(categoryId),
        type = TransactionType.EXPENSE,
        status = TransactionStatus.CLEARED,
        amount = Cents(-amountCents),
        currency = Currency.USD,
        date = date,
        createdAt = now,
        updatedAt = now,
    )

    /**
     * A controllable [BudgetRepository] backed by an explicit list.
     * Unlike [MockBudgetRepository] (which uses [SampleData]), this starts
     * with whatever data the test injects, keeping tests deterministic.
     */
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

    /**
     * A controllable [TransactionRepository] for test isolation.
     */
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

    /**
     * A controllable [CategoryRepository] for test isolation.
     */
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

    // ═══════════════════════════════════════════════════════════════════
    // initial state
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `initial state is loading`() = runTest {
        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(),
            transactionRepository = TestTransactionRepository(),
            categoryRepository = TestCategoryRepository(),
        )

        // Before any coroutines have run, the UI state should be loading.
        val state = vm.uiState.value
        assertTrue(state.isLoading, "Expected isLoading = true on initial state")
        assertFalse(state.isRefreshing, "Expected isRefreshing = false on initial state")
        assertTrue(state.budgets.isEmpty(), "Expected empty budgets list on initial state")
        assertNull(state.errorMessage, "Expected no error message on initial state")
    }

    // ═══════════════════════════════════════════════════════════════════
    // loads budgets from repository
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `loads budgets from repository`() = runTest {
        val category = createCategory("cat-food", "Food", "restaurant")
        val budget = createBudget("bud-food", "cat-food", "Food Budget", 50_000L)
        val expense = createExpense("txn-1", "cat-food", 10_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(listOf(expense)),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading, "Expected isLoading = false after data loads")
        assertEquals(1, state.budgets.size, "Expected exactly one budget item")
        assertNull(state.errorMessage, "Expected no error message after successful load")

        val item = state.budgets.first()
        assertEquals("Food Budget", item.name)
        assertEquals("Food", item.categoryName)
        assertEquals("restaurant", item.categoryIcon)
        assertEquals(BudgetPeriod.MONTHLY, item.period)
    }

    // ═══════════════════════════════════════════════════════════════════
    // computes budget health correctly
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `computes healthy budget status when under 75 percent`() = runTest {
        val category = createCategory("cat-a", "Alpha")
        val budget = createBudget("bud-a", "cat-a", "Alpha Budget", 100_000L) // $1000
        // Spend $200 → 20% utilization → HEALTHY
        val expense = createExpense("txn-a", "cat-a", 20_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(listOf(expense)),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.budgets.first()
        assertEquals(BudgetHealth.HEALTHY, item.health)
        assertTrue(
            item.utilizationPercent < 0.75f,
            "Utilization ${item.utilizationPercent} should be < 0.75",
        )
        assertEquals(BudgetHealth.HEALTHY, vm.uiState.value.overallHealth)
    }

    @Test
    fun `computes warning budget status when between 75 and 100 percent`() = runTest {
        val category = createCategory("cat-b", "Bravo")
        val budget = createBudget("bud-b", "cat-b", "Bravo Budget", 100_000L) // $1000
        // Spend $850 → 85% utilization → WARNING
        val expense = createExpense("txn-b", "cat-b", 85_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(listOf(expense)),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.budgets.first()
        assertEquals(BudgetHealth.WARNING, item.health)
        assertTrue(
            item.utilizationPercent > 0.75f && item.utilizationPercent <= 1.0f,
            "Utilization ${item.utilizationPercent} should be 0.75–1.0",
        )
        assertEquals(BudgetHealth.WARNING, vm.uiState.value.overallHealth)
    }

    @Test
    fun `computes over budget status when exceeding 100 percent`() = runTest {
        val category = createCategory("cat-c", "Charlie")
        val budget = createBudget("bud-c", "cat-c", "Charlie Budget", 50_000L) // $500
        // Spend $700 → 140% utilization → OVER
        val expense = createExpense("txn-c", "cat-c", 70_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(listOf(expense)),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.budgets.first()
        assertEquals(BudgetHealth.OVER, item.health)
        assertTrue(
            item.utilizationPercent > 1.0f,
            "Utilization ${item.utilizationPercent} should be > 1.0",
        )
        assertEquals(BudgetHealth.OVER, vm.uiState.value.overallHealth)
    }

    @Test
    fun `overall health escalates to worst individual budget`() = runTest {
        val catA = createCategory("cat-a", "Alpha")
        val catB = createCategory("cat-b", "Bravo")
        val budgetA = createBudget("bud-a", "cat-a", "Alpha Budget", 100_000L)
        val budgetB = createBudget("bud-b", "cat-b", "Bravo Budget", 50_000L)
        // Alpha: $200 spent on $1000 → HEALTHY
        // Bravo: $700 spent on $500 → OVER
        val expenseA = createExpense("txn-a", "cat-a", 20_000L)
        val expenseB = createExpense("txn-b", "cat-b", 70_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budgetA, budgetB)),
            transactionRepository = TestTransactionRepository(listOf(expenseA, expenseB)),
            categoryRepository = TestCategoryRepository(listOf(catA, catB)),
        )

        advanceUntilIdle()

        assertEquals(
            BudgetHealth.OVER,
            vm.uiState.value.overallHealth,
            "Overall health should escalate to OVER when any budget is over",
        )
    }

    @Test
    fun `utilization percent is clamped to 1_5`() = runTest {
        val category = createCategory("cat-d", "Delta")
        val budget = createBudget("bud-d", "cat-d", "Delta Budget", 10_000L) // $100
        // Spend $300 → 300% utilization, should be clamped to 1.5
        val expense = createExpense("txn-d", "cat-d", 30_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(listOf(expense)),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.budgets.first()
        assertEquals(
            1.5f,
            item.utilizationPercent,
            "Utilization should be clamped to 1.5f",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // refresh updates state
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `refresh updates state`() = runTest {
        val category = createCategory("cat-r", "Refresh Category")
        val budget = createBudget("bud-r", "cat-r", "Refresh Budget", 50_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        // Let initial load complete.
        advanceUntilIdle()
        assertFalse(vm.uiState.value.isLoading)
        assertFalse(vm.uiState.value.isRefreshing)

        // Trigger refresh.
        vm.refresh()

        // After starting refresh but before advancing time, isRefreshing should be true.
        testDispatcher.scheduler.advanceTimeBy(100)
        testDispatcher.scheduler.runCurrent()
        assertTrue(
            vm.uiState.value.isRefreshing,
            "Expected isRefreshing = true during refresh",
        )

        // Let refresh complete.
        advanceUntilIdle()
        assertFalse(
            vm.uiState.value.isRefreshing,
            "Expected isRefreshing = false after refresh completes",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // handles empty budget list
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `handles empty budget list`() = runTest {
        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(emptyList()),
            transactionRepository = TestTransactionRepository(),
            categoryRepository = TestCategoryRepository(),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.budgets.isEmpty(), "Expected empty budgets when repository has none")
        assertEquals(BudgetHealth.HEALTHY, state.overallHealth, "Default health should be HEALTHY")
        assertNull(state.errorMessage)
    }

    // ═══════════════════════════════════════════════════════════════════
    // clearError resets error message
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `clearError resets error message`() = runTest {
        val category = createCategory("cat-e", "Echo")
        val budget = createBudget("bud-e", "cat-e", "Echo Budget", 50_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        // Initially no error.
        assertNull(vm.uiState.value.errorMessage)

        // clearError should be a no-op when there's already no error.
        vm.clearError()
        advanceUntilIdle()
        assertNull(vm.uiState.value.errorMessage, "clearError should remain null when no error")
    }

    // ═══════════════════════════════════════════════════════════════════
    // category resolution
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `budget with unknown category shows Uncategorized`() = runTest {
        // Budget references a category that doesn't exist in the category repository.
        val budget = createBudget("bud-orphan", "cat-nonexistent", "Orphan Budget", 25_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(),
            categoryRepository = TestCategoryRepository(emptyList()),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.budgets.first()
        assertEquals(
            "Uncategorized",
            item.categoryName,
            "Missing category should fall back to 'Uncategorized'",
        )
        assertNull(item.categoryIcon, "Missing category should have null icon")
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatted currency totals
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `total budgeted and total spent are formatted correctly`() = runTest {
        val category = createCategory("cat-f", "Foxtrot")
        val budget = createBudget("bud-f", "cat-f", "Foxtrot Budget", 75_000L) // $750
        // Spend $200
        val expense = createExpense("txn-f", "cat-f", 20_000L)

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budget)),
            transactionRepository = TestTransactionRepository(listOf(expense)),
            categoryRepository = TestCategoryRepository(listOf(category)),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals("$750.00", state.totalBudgeted, "Total budgeted should be formatted as USD")
        assertEquals("$200.00", state.totalSpent, "Total spent should be formatted as USD")
    }

    // ═══════════════════════════════════════════════════════════════════
    // multiple budgets aggregate totals
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `multiple budgets aggregate totals correctly`() = runTest {
        val catA = createCategory("cat-a", "Alpha")
        val catB = createCategory("cat-b", "Bravo")
        val budgetA = createBudget("bud-a", "cat-a", "Alpha Budget", 50_000L) // $500
        val budgetB = createBudget("bud-b", "cat-b", "Bravo Budget", 30_000L) // $300
        val expA = createExpense("txn-a", "cat-a", 10_000L) // $100
        val expB = createExpense("txn-b", "cat-b", 5_000L)  // $50

        val vm = BudgetsViewModel(
            budgetRepository = TestBudgetRepository(listOf(budgetA, budgetB)),
            transactionRepository = TestTransactionRepository(listOf(expA, expB)),
            categoryRepository = TestCategoryRepository(listOf(catA, catB)),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(2, state.budgets.size)
        assertEquals("$800.00", state.totalBudgeted, "Sum of budget limits: $500 + $300")
        assertEquals("$150.00", state.totalSpent, "Sum of spending: $100 + $50")
    }
}
