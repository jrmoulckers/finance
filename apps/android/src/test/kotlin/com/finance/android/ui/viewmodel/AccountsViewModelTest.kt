// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Account
import com.finance.models.AccountType
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
 * Unit tests for [AccountsViewModel].
 *
 * Verifies that the ViewModel correctly loads accounts from [AccountRepository],
 * groups them by [AccountType], computes total balances per group,
 * handles account selection/deselection, formats currency via KMP
 * [com.finance.core.currency.CurrencyFormatter], and manages loading/empty
 * UI state transitions.
 *
 * Uses deterministic test repository implementations (no mocking frameworks) and
 * `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountsViewModelTest {

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
        accountId: String,
        amountCents: Long,
        type: TransactionType = TransactionType.EXPENSE,
        date: LocalDate = today,
        payee: String? = null,
    ): Transaction {
        val cents = if (type == TransactionType.INCOME) Cents(amountCents) else Cents(-amountCents)
        return Transaction(
            id = SyncId(id),
            householdId = householdId,
            accountId = SyncId(accountId),
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

    private fun createViewModel(
        accounts: List<Account> = emptyList(),
        transactions: List<Transaction> = emptyList(),
    ) = AccountsViewModel(
        accountRepository = TestAccountRepository(accounts),
        transactionRepository = TestTransactionRepository(transactions),
    )

    // ═══════════════════════════════════════════════════════════════════
    // initial state is loading
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `initial state is loading`() = runTest {
        val vm = createViewModel()

        val state = vm.uiState.value
        assertTrue(state.isLoading, "Expected isLoading = true on initial state")
        assertTrue(state.groups.isEmpty(), "Expected empty groups on initial state")
        assertNull(state.selectedAccount, "Expected no selected account on initial state")
        assertFalse(state.isEmpty, "Expected isEmpty = false on initial state (still loading)")
    }

    // ═══════════════════════════════════════════════════════════════════
    // loads and groups accounts by type
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `loads and groups accounts by type`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Main Checking", AccountType.CHECKING, 500_000L),
            createAccount("acc-2", "Emergency Savings", AccountType.SAVINGS, 1_000_000L),
            createAccount("acc-3", "Joint Checking", AccountType.CHECKING, 250_000L),
            createAccount("acc-4", "Visa Card", AccountType.CREDIT_CARD, 150_000L),
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading, "Expected isLoading = false after data loads")
        assertFalse(state.isEmpty, "Expected isEmpty = false when accounts exist")

        // Should have 3 groups: CHECKING, SAVINGS, CREDIT_CARD
        assertEquals(3, state.groups.size, "Expected 3 account type groups")

        val checkingGroup = state.groups.find { it.type == AccountType.CHECKING }!!
        assertEquals(2, checkingGroup.accounts.size, "Checking group should have 2 accounts")
        assertEquals("Checking", checkingGroup.displayName)

        val savingsGroup = state.groups.find { it.type == AccountType.SAVINGS }!!
        assertEquals(1, savingsGroup.accounts.size, "Savings group should have 1 account")
        assertEquals("Savings", savingsGroup.displayName)

        val creditGroup = state.groups.find { it.type == AccountType.CREDIT_CARD }!!
        assertEquals(1, creditGroup.accounts.size, "Credit Cards group should have 1 account")
        assertEquals("Credit Cards", creditGroup.displayName)
    }

    // ═══════════════════════════════════════════════════════════════════
    // groups sorted by type order
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `groups sorted in canonical order`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Investment", AccountType.INVESTMENT, 500_000L),
            createAccount("acc-2", "Checking", AccountType.CHECKING, 100_000L),
            createAccount("acc-3", "Credit Card", AccountType.CREDIT_CARD, 50_000L),
            createAccount("acc-4", "Savings", AccountType.SAVINGS, 200_000L),
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val groupTypes = vm.uiState.value.groups.map { it.type }
        // Expected order: CHECKING, SAVINGS, CREDIT_CARD, INVESTMENT
        assertEquals(
            listOf(AccountType.CHECKING, AccountType.SAVINGS, AccountType.CREDIT_CARD, AccountType.INVESTMENT),
            groupTypes,
            "Groups should follow canonical type ordering",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // total balance per group
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `total balance calculated per group`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Checking A", AccountType.CHECKING, 500_000L),    // $5,000
            createAccount("acc-2", "Checking B", AccountType.CHECKING, 300_000L),    // $3,000
            createAccount("acc-3", "Savings", AccountType.SAVINGS, 1_000_000L),      // $10,000
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val checkingGroup = vm.uiState.value.groups.find { it.type == AccountType.CHECKING }!!
        assertEquals(
            Cents(800_000L),
            checkingGroup.totalBalance,
            "Checking group total should be $8,000",
        )
        assertEquals("$8,000.00", checkingGroup.totalBalanceFormatted)

        val savingsGroup = vm.uiState.value.groups.find { it.type == AccountType.SAVINGS }!!
        assertEquals(
            Cents(1_000_000L),
            savingsGroup.totalBalance,
            "Savings group total should be $10,000",
        )
        assertEquals("$10,000.00", savingsGroup.totalBalanceFormatted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // individual account balance display
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `individual account balances preserved in group`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Primary", AccountType.CHECKING, 123_456L, sortOrder = 0),
            createAccount("acc-2", "Secondary", AccountType.CHECKING, 654_321L, sortOrder = 1),
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val group = vm.uiState.value.groups.first()
        val primary = group.accounts.find { it.name == "Primary" }!!
        val secondary = group.accounts.find { it.name == "Secondary" }!!
        assertEquals(Cents(123_456L), primary.currentBalance)
        assertEquals(Cents(654_321L), secondary.currentBalance)
    }

    @Test
    fun `accounts within group sorted by sortOrder`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "Second", AccountType.CHECKING, 100_000L, sortOrder = 2),
            createAccount("acc-2", "First", AccountType.CHECKING, 200_000L, sortOrder = 1),
            createAccount("acc-3", "Third", AccountType.CHECKING, 50_000L, sortOrder = 3),
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val group = vm.uiState.value.groups.first()
        assertEquals(
            listOf("First", "Second", "Third"),
            group.accounts.map { it.name },
            "Accounts should be sorted by sortOrder",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // empty state
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `empty state when no accounts exist`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading, "Expected isLoading = false after load")
        assertTrue(state.isEmpty, "Expected isEmpty = true when no accounts")
        assertTrue(state.groups.isEmpty(), "Expected empty groups when no accounts")
    }

    // ═══════════════════════════════════════════════════════════════════
    // account selection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `selectAccount sets selected account and loads transactions`() = runTest {
        val account = createAccount("acc-1", "Checking", AccountType.CHECKING, 100_000L)
        val txn1 = createTransaction("txn-1", "acc-1", 5_000L, payee = "Store A")
        val txn2 = createTransaction("txn-2", "acc-1", 3_000L, payee = "Store B")
        val txnOther = createTransaction("txn-3", "acc-other", 1_000L, payee = "Other")

        val vm = AccountsViewModel(
            accountRepository = TestAccountRepository(listOf(account)),
            transactionRepository = TestTransactionRepository(listOf(txn1, txn2, txnOther)),
        )
        advanceUntilIdle()

        vm.selectAccount(account)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(account, state.selectedAccount, "Selected account should match")
        assertEquals(
            2,
            state.selectedAccountTransactions.size,
            "Should show only transactions for the selected account",
        )
    }

    @Test
    fun `selectAccount transactions sorted by date descending`() = runTest {
        val account = createAccount("acc-1", "Checking", AccountType.CHECKING, 100_000L)
        val date1 = LocalDate(today.year, today.month, 1)
        val date2 = if (today.dayOfMonth >= 2) LocalDate(today.year, today.month, 2) else date1
        val txnOld = createTransaction("txn-old", "acc-1", 1_000L, date = date1)
        val txnNew = createTransaction("txn-new", "acc-1", 2_000L, date = date2)

        val vm = AccountsViewModel(
            accountRepository = TestAccountRepository(listOf(account)),
            transactionRepository = TestTransactionRepository(listOf(txnOld, txnNew)),
        )
        advanceUntilIdle()

        vm.selectAccount(account)
        advanceUntilIdle()

        val txns = vm.uiState.value.selectedAccountTransactions
        assertTrue(
            txns.first().date >= txns.last().date,
            "Transactions should be sorted by date descending",
        )
    }

    @Test
    fun `clearSelection resets selected account and transactions`() = runTest {
        val account = createAccount("acc-1", "Checking", AccountType.CHECKING, 100_000L)
        val txn = createTransaction("txn-1", "acc-1", 5_000L)

        val vm = AccountsViewModel(
            accountRepository = TestAccountRepository(listOf(account)),
            transactionRepository = TestTransactionRepository(listOf(txn)),
        )
        advanceUntilIdle()

        vm.selectAccount(account)
        advanceUntilIdle()

        assertEquals(account, vm.uiState.value.selectedAccount)

        vm.clearSelection()

        assertNull(vm.uiState.value.selectedAccount, "Selected account should be null after clear")
        assertTrue(
            vm.uiState.value.selectedAccountTransactions.isEmpty(),
            "Selected transactions should be empty after clear",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // display name mapping
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `all account types have correct display names`() = runTest {
        val accounts = listOf(
            createAccount("acc-1", "A", AccountType.CHECKING, 1L),
            createAccount("acc-2", "B", AccountType.SAVINGS, 1L),
            createAccount("acc-3", "C", AccountType.CREDIT_CARD, 1L),
            createAccount("acc-4", "D", AccountType.CASH, 1L),
            createAccount("acc-5", "E", AccountType.INVESTMENT, 1L),
            createAccount("acc-6", "F", AccountType.LOAN, 1L),
            createAccount("acc-7", "G", AccountType.OTHER, 1L),
        )

        val vm = createViewModel(accounts = accounts)
        advanceUntilIdle()

        val nameMap = vm.uiState.value.groups.associate { it.type to it.displayName }
        assertEquals("Checking", nameMap[AccountType.CHECKING])
        assertEquals("Savings", nameMap[AccountType.SAVINGS])
        assertEquals("Credit Cards", nameMap[AccountType.CREDIT_CARD])
        assertEquals("Cash", nameMap[AccountType.CASH])
        assertEquals("Investments", nameMap[AccountType.INVESTMENT])
        assertEquals("Loans", nameMap[AccountType.LOAN])
        assertEquals("Other", nameMap[AccountType.OTHER])
    }
}
