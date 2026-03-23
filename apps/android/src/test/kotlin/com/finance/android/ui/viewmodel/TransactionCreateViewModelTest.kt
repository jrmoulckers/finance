// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Account
import com.finance.models.AccountType
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
 * Unit tests for [TransactionCreateViewModel].
 *
 * Verifies the 3-step creation flow (AMOUNT → CATEGORY → CONFIRM),
 * per-step validation (amount > 0, payee not blank/too long,
 * category required, account required, transfer constraints),
 * saving via the repository, and field update methods.
 *
 * Uses deterministic test repository implementations (no mocking frameworks) and
 * `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TransactionCreateViewModelTest {

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
        type: AccountType = AccountType.CHECKING,
    ) = Account(
        id = SyncId(id),
        householdId = householdId,
        name = name,
        type = type,
        currency = Currency.USD,
        currentBalance = Cents(100_000L),
        createdAt = now,
        updatedAt = now,
    )

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
        var lastInserted: Transaction? = null
            private set

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
            lastInserted = entity
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

    // Shared test data
    private val testAccounts = listOf(
        createAccount("acc-1", "Checking"),
        createAccount("acc-2", "Savings", AccountType.SAVINGS),
    )
    private val testCategories = listOf(
        createCategory("cat-1", "Food", "🍔"),
        createCategory("cat-2", "Transport", "🚗"),
    )

    private fun createViewModel(
        transactions: List<Transaction> = emptyList(),
        accounts: List<Account> = testAccounts,
        categories: List<Category> = testCategories,
        transactionRepo: TestTransactionRepository? = null,
    ): Pair<TransactionCreateViewModel, TestTransactionRepository> {
        val txnRepo = transactionRepo ?: TestTransactionRepository(transactions)
        val vm = TransactionCreateViewModel(
            transactionRepository = txnRepo,
            accountRepository = TestAccountRepository(accounts),
            categoryRepository = TestCategoryRepository(categories),
        )
        return vm to txnRepo
    }

    // ═══════════════════════════════════════════════════════════════════
    // initial state
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `initial state has step AMOUNT and empty fields`() = runTest {
        val (vm, _) = createViewModel()

        val state = vm.uiState.value
        assertEquals(CreateStep.AMOUNT, state.currentStep, "Initial step should be AMOUNT")
        assertEquals(TransactionType.EXPENSE, state.transactionType, "Default type should be EXPENSE")
        assertEquals("", state.amountText, "Amount text should be empty")
        assertEquals(0L, state.amountCents, "Amount cents should be 0")
        assertEquals("", state.payee, "Payee should be empty")
        assertFalse(state.isSaving, "Should not be saving initially")
        assertFalse(state.isSaved, "Should not be saved initially")
        assertTrue(state.errors.isEmpty(), "Should have no errors initially")
    }

    @Test
    fun `init loads categories and accounts`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(2, state.categories.size, "Categories should be loaded")
        assertEquals(2, state.accounts.size, "Accounts should be loaded")
    }

    @Test
    fun `init pre-selects first account`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(SyncId("acc-1"), state.selectedAccountId, "First account should be pre-selected")
        assertEquals("Checking", state.selectedAccountName)
    }

    // ═══════════════════════════════════════════════════════════════════
    // amount validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `amount validation fails when amount is zero`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updatePayee("Test Payee")
        // Don't set amount (stays 0)
        vm.nextStep()

        val state = vm.uiState.value
        assertTrue(state.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            state.errors.any { it.contains("amount") },
            "Should have amount validation error",
        )
        assertEquals(CreateStep.AMOUNT, state.currentStep, "Should stay on AMOUNT step")
    }

    @Test
    fun `amount validation passes when amount is positive`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("50.00")
        vm.updatePayee("Test Payee")
        vm.nextStep()

        assertEquals(
            CreateStep.CATEGORY,
            vm.uiState.value.currentStep,
            "Should advance to CATEGORY step",
        )
        assertTrue(vm.uiState.value.errors.isEmpty())
    }

    @Test
    fun `updateAmount parses cents correctly`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("12.50")
        assertEquals(1_250L, vm.uiState.value.amountCents, "$12.50 = 1250 cents")
        assertEquals("12.50", vm.uiState.value.amountText)
    }

    @Test
    fun `updateAmount strips non-numeric characters`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("$12.50")
        assertEquals(1_250L, vm.uiState.value.amountCents)
    }

    @Test
    fun `updateAmount limits to 2 decimal places`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("12.999")
        assertEquals("12.99", vm.uiState.value.amountText, "Should limit to 2 decimal places")
    }

    // ═══════════════════════════════════════════════════════════════════
    // payee validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `payee validation fails when blank`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("50.00")
        // Don't set payee (stays blank)
        vm.nextStep()

        val state = vm.uiState.value
        assertTrue(state.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            state.errors.any { it.contains("payee") },
            "Should have payee validation error",
        )
        assertEquals(CreateStep.AMOUNT, state.currentStep, "Should stay on AMOUNT step")
    }

    @Test
    fun `payee validation fails when too long`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("50.00")
        vm.updatePayee("A".repeat(201)) // > 200 chars
        vm.nextStep()

        val state = vm.uiState.value
        assertTrue(state.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            state.errors.any { it.contains("long") || it.contains("200") },
            "Should have payee length validation error",
        )
    }

    @Test
    fun `payee at exactly 200 characters is valid`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("50.00")
        vm.updatePayee("A".repeat(200))
        vm.nextStep()

        assertEquals(
            CreateStep.CATEGORY,
            vm.uiState.value.currentStep,
            "200-char payee should be valid",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // step navigation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `nextStep advances from AMOUNT to CATEGORY`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()

        assertEquals(CreateStep.CATEGORY, vm.uiState.value.currentStep)
    }

    @Test
    fun `nextStep advances from CATEGORY to CONFIRM`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        // Navigate to CATEGORY step
        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()
        assertEquals(CreateStep.CATEGORY, vm.uiState.value.currentStep)

        // Set required fields and advance
        vm.selectCategory(SyncId("cat-1"))
        vm.nextStep()

        assertEquals(CreateStep.CONFIRM, vm.uiState.value.currentStep)
    }

    @Test
    fun `nextStep on CONFIRM step is no-op`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        // Navigate to CONFIRM
        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()
        vm.selectCategory(SyncId("cat-1"))
        vm.nextStep()
        assertEquals(CreateStep.CONFIRM, vm.uiState.value.currentStep)

        // Try to advance further
        vm.nextStep()
        assertEquals(
            CreateStep.CONFIRM,
            vm.uiState.value.currentStep,
            "Should stay on CONFIRM step",
        )
    }

    @Test
    fun `previousStep goes from CATEGORY to AMOUNT`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()
        assertEquals(CreateStep.CATEGORY, vm.uiState.value.currentStep)

        vm.previousStep()
        assertEquals(CreateStep.AMOUNT, vm.uiState.value.currentStep)
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on previousStep")
    }

    @Test
    fun `previousStep goes from CONFIRM to CATEGORY`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()
        vm.selectCategory(SyncId("cat-1"))
        vm.nextStep()
        assertEquals(CreateStep.CONFIRM, vm.uiState.value.currentStep)

        vm.previousStep()
        assertEquals(CreateStep.CATEGORY, vm.uiState.value.currentStep)
    }

    @Test
    fun `previousStep on AMOUNT step is no-op`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        assertEquals(CreateStep.AMOUNT, vm.uiState.value.currentStep)
        vm.previousStep()
        assertEquals(
            CreateStep.AMOUNT,
            vm.uiState.value.currentStep,
            "Should stay on AMOUNT step",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // CATEGORY step validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `category required on CATEGORY step`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()
        assertEquals(CreateStep.CATEGORY, vm.uiState.value.currentStep)

        // Don't select category
        vm.nextStep()

        assertTrue(vm.uiState.value.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            vm.uiState.value.errors.any { it.contains("category") },
            "Should have category validation error",
        )
        assertEquals(CreateStep.CATEGORY, vm.uiState.value.currentStep, "Should stay on CATEGORY step")
    }

    @Test
    fun `account required on CATEGORY step`() = runTest {
        val (vm, _) = createViewModel(accounts = emptyList())
        advanceUntilIdle()

        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.nextStep()

        vm.selectCategory(SyncId("cat-1"))
        // selectedAccountId is null since no accounts loaded
        vm.nextStep()

        assertTrue(vm.uiState.value.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            vm.uiState.value.errors.any { it.contains("account") },
            "Should have account validation error",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // transfer validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `transfer requires destination account`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.TRANSFER)
        vm.updateAmount("100.00")
        vm.updatePayee("Transfer")
        vm.nextStep()

        vm.selectCategory(SyncId("cat-1"))
        // Don't select transfer account
        vm.nextStep()

        assertTrue(vm.uiState.value.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            vm.uiState.value.errors.any { it.contains("destination") },
            "Should have destination account validation error",
        )
    }

    @Test
    fun `transfer requires different source and destination`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.TRANSFER)
        vm.updateAmount("100.00")
        vm.updatePayee("Transfer")
        vm.nextStep()

        vm.selectCategory(SyncId("cat-1"))
        // Set transfer destination same as source
        vm.selectTransferAccount(SyncId("acc-1"))
        vm.nextStep()

        assertTrue(vm.uiState.value.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            vm.uiState.value.errors.any { it.contains("differ") || it.contains("Source") },
            "Should have source/destination must differ error",
        )
    }

    @Test
    fun `transfer succeeds with different accounts`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.TRANSFER)
        vm.updateAmount("100.00")
        vm.updatePayee("Transfer")
        vm.nextStep()

        vm.selectCategory(SyncId("cat-1"))
        vm.selectTransferAccount(SyncId("acc-2"))
        vm.nextStep()

        assertEquals(
            CreateStep.CONFIRM,
            vm.uiState.value.currentStep,
            "Should advance to CONFIRM with different accounts",
        )
        assertTrue(vm.uiState.value.errors.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // CONFIRM step summary
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `CONFIRM step shows formatted summary data`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("50.00")
        vm.updatePayee("Grocery Store")
        vm.nextStep()

        vm.selectCategory(SyncId("cat-1"))
        vm.nextStep()

        val state = vm.uiState.value
        assertEquals(CreateStep.CONFIRM, state.currentStep)
        assertEquals("$50.00", state.formattedAmount, "Formatted amount should be USD")
        assertEquals("Food", state.selectedCategoryName, "Category name should be resolved")
        assertEquals("Checking", state.selectedAccountName, "Account name should be resolved")
    }

    @Test
    fun `CONFIRM step shows transfer account name for transfers`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.TRANSFER)
        vm.updateAmount("75.00")
        vm.updatePayee("Transfer")
        vm.nextStep()

        vm.selectCategory(SyncId("cat-1"))
        vm.selectTransferAccount(SyncId("acc-2"))
        vm.nextStep()

        assertEquals("Savings", vm.uiState.value.selectedTransferAccountName)
    }

    // ═══════════════════════════════════════════════════════════════════
    // save creates transaction via repository
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save creates transaction via repository`() = runTest {
        val txnRepo = TestTransactionRepository()
        val (vm, _) = createViewModel(transactionRepo = txnRepo)
        advanceUntilIdle()

        // Fill all fields
        vm.updateAmount("25.50")
        vm.updatePayee("Coffee Shop")
        vm.nextStep()
        vm.selectCategory(SyncId("cat-1"))
        vm.nextStep()
        assertEquals(CreateStep.CONFIRM, vm.uiState.value.currentStep)

        vm.save()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isSaved, "isSaved should be true after save")
        assertFalse(vm.uiState.value.isSaving, "isSaving should be false after save completes")

        val saved = txnRepo.lastInserted
        assertTrue(saved != null, "Transaction should have been inserted")
        assertEquals(Cents(-2_550L), saved!!.amount, "Expense amount should be negative")
        assertEquals("Coffee Shop", saved.payee)
        assertEquals(SyncId("cat-1"), saved.categoryId)
        assertEquals(TransactionType.EXPENSE, saved.type)
    }

    @Test
    fun `save income transaction stores positive amount`() = runTest {
        val txnRepo = TestTransactionRepository()
        val (vm, _) = createViewModel(transactionRepo = txnRepo)
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.INCOME)
        vm.updateAmount("100.00")
        vm.updatePayee("Salary")
        vm.nextStep()
        vm.selectCategory(SyncId("cat-1"))
        vm.nextStep()

        vm.save()
        advanceUntilIdle()

        val saved = txnRepo.lastInserted!!
        assertEquals(Cents(10_000L), saved.amount, "Income amount should be positive")
        assertEquals(TransactionType.INCOME, saved.type)
    }

    @Test
    fun `save fails with validation errors if required fields missing`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        // Try to save without filling any fields
        vm.save()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isSaved, "Should not be saved with validation errors")
        assertTrue(vm.uiState.value.errors.isNotEmpty(), "Should have validation errors")
    }

    // ═══════════════════════════════════════════════════════════════════
    // field update methods
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `updateTransactionType changes type and clears transfer fields`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.TRANSFER)
        vm.selectTransferAccount(SyncId("acc-2"))

        vm.updateTransactionType(TransactionType.EXPENSE)

        val state = vm.uiState.value
        assertEquals(TransactionType.EXPENSE, state.transactionType)
        assertNull(state.selectedTransferAccountId, "Transfer account should be cleared")
        assertEquals("", state.selectedTransferAccountName, "Transfer name should be cleared")
    }

    @Test
    fun `updatePayee generates suggestions for matching payees`() = runTest {
        // Create a transaction with a known payee for history
        val existingTxn = Transaction(
            id = SyncId("txn-existing"),
            householdId = householdId,
            accountId = SyncId("acc-1"),
            type = TransactionType.EXPENSE,
            status = TransactionStatus.CLEARED,
            amount = Cents(-1_000L),
            currency = Currency.USD,
            date = today,
            payee = "Starbucks",
            createdAt = now,
            updatedAt = now,
        )

        val (vm, _) = createViewModel(transactions = listOf(existingTxn))
        advanceUntilIdle()

        vm.updatePayee("Star")

        val state = vm.uiState.value
        assertTrue(
            state.payeeSuggestions.any { it == "Starbucks" },
            "Should suggest 'Starbucks' for 'Star' query",
        )
    }

    @Test
    fun `updatePayee does not suggest for short queries`() = runTest {
        val existingTxn = Transaction(
            id = SyncId("txn-existing"),
            householdId = householdId,
            accountId = SyncId("acc-1"),
            type = TransactionType.EXPENSE,
            status = TransactionStatus.CLEARED,
            amount = Cents(-1_000L),
            currency = Currency.USD,
            date = today,
            payee = "Starbucks",
            createdAt = now,
            updatedAt = now,
        )

        val (vm, _) = createViewModel(transactions = listOf(existingTxn))
        advanceUntilIdle()

        vm.updatePayee("S")

        assertTrue(
            vm.uiState.value.payeeSuggestions.isEmpty(),
            "Should not suggest for 1-char query",
        )
    }

    @Test
    fun `selectPayeeSuggestion sets payee and clears suggestions`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.selectPayeeSuggestion("Selected Payee")

        val state = vm.uiState.value
        assertEquals("Selected Payee", state.payee)
        assertTrue(state.payeeSuggestions.isEmpty(), "Suggestions should be cleared")
    }

    @Test
    fun `selectCategory updates state`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.selectCategory(SyncId("cat-2"))

        val state = vm.uiState.value
        assertEquals(SyncId("cat-2"), state.selectedCategoryId)
        assertEquals("Transport", state.selectedCategoryName)
    }

    @Test
    fun `selectAccount updates state`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.selectAccount(SyncId("acc-2"))

        val state = vm.uiState.value
        assertEquals(SyncId("acc-2"), state.selectedAccountId)
        assertEquals("Savings", state.selectedAccountName)
    }

    @Test
    fun `updateDate changes date`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        val newDate = LocalDate(2025, 6, 15)
        vm.updateDate(newDate)

        assertEquals(newDate, vm.uiState.value.date)
    }

    @Test
    fun `updateNote changes note`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateNote("Weekly groceries")

        assertEquals("Weekly groceries", vm.uiState.value.note)
    }

    // ═══════════════════════════════════════════════════════════════════
    // field updates clear errors
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `field updates clear previous errors`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        // Trigger errors
        vm.nextStep()
        assertTrue(vm.uiState.value.errors.isNotEmpty())

        // Any field update should clear errors
        vm.updateAmount("10.00")
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on amount update")
    }

    // ═══════════════════════════════════════════════════════════════════
    // save with note too long
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save validates note max length`() = runTest {
        val (vm, _) = createViewModel()
        advanceUntilIdle()

        vm.updateAmount("25.00")
        vm.updatePayee("Store")
        vm.selectCategory(SyncId("cat-1"))
        vm.updateNote("X".repeat(1001)) // > 1000 chars

        vm.save()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isSaved, "Should not save with note too long")
        assertTrue(
            vm.uiState.value.errors.any { it.contains("Note") || it.contains("1000") },
            "Should have note length error",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // save with transfer
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save transfer transaction includes transfer account ID`() = runTest {
        val txnRepo = TestTransactionRepository()
        val (vm, _) = createViewModel(transactionRepo = txnRepo)
        advanceUntilIdle()

        vm.updateTransactionType(TransactionType.TRANSFER)
        vm.updateAmount("200.00")
        vm.updatePayee("Account Transfer")
        vm.nextStep()
        vm.selectCategory(SyncId("cat-1"))
        vm.selectTransferAccount(SyncId("acc-2"))
        vm.nextStep()

        vm.save()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isSaved)
        val saved = txnRepo.lastInserted!!
        assertEquals(TransactionType.TRANSFER, saved.type)
        assertEquals(SyncId("acc-2"), saved.transferAccountId)
        assertEquals(Cents(-20_000L), saved.amount, "Transfer should store negative amount")
    }
}
