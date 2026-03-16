// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Transaction
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
import kotlin.test.assertTrue

/**
 * Unit tests for [AccountsViewModel].
 *
 * Verifies that creating an account stores the expected model values and that
 * the accounts list state refreshes from repository updates.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val householdId = SyncId("household-1")

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `createAccount inserts account and refreshes grouped state`() = runTest {
        val accountRepository = TestAccountRepository()
        val viewModel = AccountsViewModel(
            accountRepository = accountRepository,
            transactionRepository = TestTransactionRepository(),
        )

        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.isEmpty)

        viewModel.createAccount(
            name = "Emergency Fund",
            accountType = AccountType.SAVINGS,
            initialBalance = Cents(25_000L),
            currency = Currency.USD,
        )
        advanceUntilIdle()

        val createdAccount = accountRepository.currentAccounts.single()
        assertEquals(householdId, createdAccount.householdId)
        assertEquals("Emergency Fund", createdAccount.name)
        assertEquals(AccountType.SAVINGS, createdAccount.type)
        assertEquals(Cents(25_000L), createdAccount.currentBalance)
        assertEquals(Currency.USD, createdAccount.currency)
        assertFalse(createdAccount.isSynced)
        assertFalse(createdAccount.isArchived)
        assertEquals(0, createdAccount.sortOrder)
        assertTrue(createdAccount.id.value.isNotBlank())

        val uiState = viewModel.uiState.value
        assertFalse(uiState.isEmpty)
        assertFalse(uiState.isLoading)
        assertEquals(1, uiState.groups.size)
        assertEquals(AccountType.SAVINGS, uiState.groups.single().type)
        assertEquals("Emergency Fund", uiState.groups.single().accounts.single().name)
    }

    private class TestAccountRepository(
        initial: List<Account> = emptyList(),
    ) : AccountRepository {
        private val store = MutableStateFlow(initial)

        val currentAccounts: List<Account>
            get() = store.value

        override fun observeAll(householdId: SyncId): Flow<List<Account>> =
            store.map { accounts ->
                accounts.filter { it.householdId == householdId && it.deletedAt == null }
            }

        override fun observeById(id: SyncId): Flow<Account?> =
            store.map { accounts -> accounts.find { it.id == id && it.deletedAt == null } }

        override suspend fun getById(id: SyncId): Account? =
            store.value.find { it.id == id && it.deletedAt == null }

        override suspend fun insert(entity: Account) {
            store.value = store.value + entity
        }

        override suspend fun update(entity: Account) {
            store.value = store.value.map { account -> if (account.id == entity.id) entity else account }
        }

        override suspend fun delete(id: SyncId) {
            val now = Clock.System.now()
            store.value = store.value.map { account ->
                if (account.id == id) account.copy(deletedAt = now, updatedAt = now) else account
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Account> =
            store.value.filter { it.householdId == householdId && !it.isSynced }

        override suspend fun markSynced(ids: List<SyncId>) {
            val idSet = ids.toSet()
            store.value = store.value.map { account ->
                if (account.id in idSet) account.copy(isSynced = true) else account
            }
        }

        override fun observeActive(householdId: SyncId): Flow<List<Account>> =
            observeAll(householdId).map { accounts -> accounts.filterNot { it.isArchived } }

        override suspend fun updateBalance(id: SyncId, newBalance: Cents) {
            val now = Clock.System.now()
            store.value = store.value.map { account ->
                if (account.id == id) {
                    account.copy(currentBalance = newBalance, updatedAt = now, isSynced = false)
                } else {
                    account
                }
            }
        }

        override suspend fun archive(id: SyncId) {
            val now = Clock.System.now()
            store.value = store.value.map { account ->
                if (account.id == id) {
                    account.copy(isArchived = true, updatedAt = now, isSynced = false)
                } else {
                    account
                }
            }
        }
    }

    private class TestTransactionRepository : TransactionRepository {
        private val store = MutableStateFlow<List<Transaction>>(emptyList())

        override fun observeAll(householdId: SyncId): Flow<List<Transaction>> =
            store.map { transactions -> transactions.filter { it.householdId == householdId && it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Transaction?> =
            store.map { transactions -> transactions.find { it.id == id && it.deletedAt == null } }

        override suspend fun getById(id: SyncId): Transaction? =
            store.value.find { it.id == id && it.deletedAt == null }

        override suspend fun insert(entity: Transaction) {
            store.value = store.value + entity
        }

        override suspend fun update(entity: Transaction) {
            store.value = store.value.map { transaction -> if (transaction.id == entity.id) entity else transaction }
        }

        override suspend fun delete(id: SyncId) {
            val now = Clock.System.now()
            store.value = store.value.map { transaction ->
                if (transaction.id == id) transaction.copy(deletedAt = now, updatedAt = now) else transaction
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Transaction> =
            store.value.filter { it.householdId == householdId && !it.isSynced }

        override suspend fun markSynced(ids: List<SyncId>) {
            val idSet = ids.toSet()
            store.value = store.value.map { transaction ->
                if (transaction.id in idSet) transaction.copy(isSynced = true) else transaction
            }
        }

        override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
            store.map { transactions -> transactions.filter { it.accountId == accountId && it.deletedAt == null } }

        override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> =
            store.map { transactions -> transactions.filter { it.categoryId == categoryId && it.deletedAt == null } }

        override fun observeByDateRange(
            householdId: SyncId,
            start: LocalDate,
            end: LocalDate,
        ): Flow<List<Transaction>> =
            store.map { transactions ->
                transactions.filter {
                    it.householdId == householdId &&
                        it.deletedAt == null &&
                        it.date >= start &&
                        it.date <= end
                }
            }

        override suspend fun getByDateRange(
            householdId: SyncId,
            start: LocalDate,
            end: LocalDate,
        ): List<Transaction> =
            store.value.filter {
                it.householdId == householdId &&
                    it.deletedAt == null &&
                    it.date >= start &&
                    it.date <= end
            }
    }
}
