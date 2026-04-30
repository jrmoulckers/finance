// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.ui.screens.nlp.NlpInputViewModel
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
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [NlpInputViewModel] (#1118).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NlpInputViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() { Dispatchers.setMain(testDispatcher) }

    @AfterTest
    fun tearDown() { Dispatchers.resetMain() }

    private val householdId = SyncId("household-test")
    private val now = Clock.System.now()

    private fun createViewModel(): NlpInputViewModel {
        val provider = TestHouseholdIdProvider(householdId)
        val txnRepo = FakeTransactionRepository()
        val catRepo = FakeCategoryRepository()
        return NlpInputViewModel(provider, txnRepo, catRepo)
    }

    @Test
    fun `initial state is empty`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state.inputText.isEmpty())
        assertNull(state.parsedAmount)
    }

    @Test
    fun `parsing valid input extracts amount`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.onInputChanged("Coffee at Starbucks \$4.50")
        advanceUntilIdle()

        val state = vm.uiState.value
        assertNotNull(state.parsedAmount)
        assertEquals("Starbucks", state.parsedPayee)
        assertEquals("Food & Drink", state.parsedCategory)
    }

    @Test
    fun `empty input clears parsed data`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.onInputChanged("Coffee \$4.50")
        advanceUntilIdle()
        assertNotNull(vm.uiState.value.parsedAmount)

        vm.onInputChanged("")
        advanceUntilIdle()
        assertNull(vm.uiState.value.parsedAmount)
    }

    @Test
    fun `selecting suggestion updates input`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.onSuggestionSelected("Starbucks \$5.00")
        advanceUntilIdle()

        assertEquals("Starbucks \$5.00", vm.uiState.value.inputText)
        assertFalse(vm.uiState.value.showSuggestions)
    }

    @Test
    fun `reset clears all state`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.onInputChanged("Test \$10.00")
        advanceUntilIdle()

        vm.reset()
        val state = vm.uiState.value
        assertTrue(state.inputText.isEmpty())
        assertNull(state.parsedAmount)
    }

    // ── Fake repositories ─────────────────────────────────────────

    private inner class FakeTransactionRepository : TransactionRepository {
        private val txns = MutableStateFlow<List<Transaction>>(emptyList())
        override fun observeAll(householdId: SyncId): Flow<List<Transaction>> = txns
        override fun observeById(id: SyncId): Flow<Transaction?> = txns.map { it.find { t -> t.id == id } }
        override suspend fun getById(id: SyncId): Transaction? = null
        override suspend fun insert(entity: Transaction) { txns.value = txns.value + entity }
        override suspend fun update(entity: Transaction) {}
        override suspend fun delete(id: SyncId) {}
        override suspend fun getUnsynced(householdId: SyncId): List<Transaction> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
        override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> = txns
        override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> = txns
        override fun observeByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): Flow<List<Transaction>> = txns
        override suspend fun getByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): List<Transaction> = emptyList()
    }

    private inner class FakeCategoryRepository : CategoryRepository {
        private val cats = MutableStateFlow(
            listOf(
                Category(
                    id = SyncId("cat-1"), householdId = householdId,
                    ownerId = householdId,
                    name = "Food & Drink", icon = "🍕",
                    createdAt = now, updatedAt = now,
                ),
            ),
        )
        override fun observeAll(householdId: SyncId): Flow<List<Category>> = cats
        override fun observeByParent(parentId: SyncId?): Flow<List<Category>> = cats
        override fun observeIncome(householdId: SyncId): Flow<List<Category>> = cats.map { it.filter { c -> c.isIncome } }
        override fun observeExpense(householdId: SyncId): Flow<List<Category>> = cats.map { it.filter { c -> !c.isIncome } }
        override fun observeById(id: SyncId): Flow<Category?> = cats.map { it.find { c -> c.id == id } }
        override suspend fun getById(id: SyncId): Category? = cats.value.find { it.id == id }
        override suspend fun insert(entity: Category) {}
        override suspend fun update(entity: Category) {}
        override suspend fun delete(id: SyncId) {}
        override suspend fun getUnsynced(householdId: SyncId): List<Category> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
    }
}
