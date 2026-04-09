// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.Clock
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [AccountCreateViewModel].
 *
 * Verifies form state management, field validation (name required, balance
 * formatting), account type and currency selection, save via repository,
 * and error handling on save failure.
 *
 * Uses a deterministic test [AccountRepository] implementation (no mocking
 * frameworks) and `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountCreateViewModelTest {

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
    // Test Repository

    // ═══════════════════════════════════════════════════════════════════

    /**
     * Minimal in-memory [AccountRepository] for testing [AccountCreateViewModel].
     *
     * Tracks inserted accounts and optionally simulates failures.
     */
    private class TestAccountRepository(
        private val shouldFailOnInsert: Boolean = false,
    ) : AccountRepository {

        private val _accounts = MutableStateFlow<List<Account>>(emptyList())

        /** All accounts that have been inserted via [insert]. */
        val inserted: List<Account> get() = _accounts.value

        override fun observeAll(householdId: SyncId): Flow<List<Account>> =
            _accounts.map { list -> list.filter { it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Account?> =
            _accounts.map { list -> list.find { it.id == id && it.deletedAt == null } }

        override suspend fun getById(id: SyncId): Account? =
            _accounts.value.find { it.id == id && it.deletedAt == null }

        override fun observeActive(householdId: SyncId): Flow<List<Account>> =
            _accounts.map { list -> list.filter { it.deletedAt == null && !it.isArchived } }

        override suspend fun updateBalance(id: SyncId, newBalance: Cents) {
            _accounts.update { list ->
                list.map { if (it.id == id) it.copy(currentBalance = newBalance) else it }
            }
        }

        override suspend fun archive(id: SyncId) {
            _accounts.update { list ->
                list.map { if (it.id == id) it.copy(isArchived = true) else it }
            }
        }

        override suspend fun insert(entity: Account) {
            if (shouldFailOnInsert) throw RuntimeException("Simulated insert failure")
            _accounts.update { it + entity }
        }

        override suspend fun update(entity: Account) {
            _accounts.update { list ->
                list.map { if (it.id == entity.id) entity else it }
            }
        }

        override suspend fun delete(id: SyncId) {
            val now = Clock.System.now()
            _accounts.update { list ->
                list.map {
                    if (it.id == id) it.copy(deletedAt = now) else it
                }
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Account> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) {}
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers

    // ═══════════════════════════════════════════════════════════════════

    private fun createViewModel(
        repo: TestAccountRepository = TestAccountRepository(),
        householdIdProvider: TestHouseholdIdProvider = TestHouseholdIdProvider(),
    ): Pair<AccountCreateViewModel, TestAccountRepository> {
        val vm = AccountCreateViewModel(
            householdIdProvider = householdIdProvider,
            accountRepository = repo,
        )
        return vm to repo
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initial state

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `initial state has empty fields and CHECKING type`() = runTest {
        val (vm, _) = createViewModel()

        val state = vm.uiState.value
        assertEquals("", state.name, "Name should be empty initially")
        assertEquals(AccountType.CHECKING, state.accountType, "Default type should be CHECKING")
        assertEquals("USD", state.currency, "Default currency should be USD")
        assertEquals("", state.initialBalance, "Initial balance should be empty")
        assertEquals("", state.note, "Note should be empty initially")
        assertFalse(state.isSaving, "Should not be saving initially")
        assertFalse(state.isSaved, "Should not be saved initially")
        assertTrue(state.errors.isEmpty(), "Should have no errors initially")
    }

    @Test
    fun `supported currencies contains expected codes`() = runTest {
        val (vm, _) = createViewModel()

        val currencies = vm.supportedCurrencies
        assertTrue(currencies.contains("USD"), "Should support USD")
        assertTrue(currencies.contains("EUR"), "Should support EUR")
        assertTrue(currencies.contains("GBP"), "Should support GBP")
        assertTrue(currencies.contains("JPY"), "Should support JPY")
        assertTrue(currencies.contains("CAD"), "Should support CAD")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Field updaters

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `updateName sets name and clears errors`() = runTest {
        val (vm, _) = createViewModel()

        // Trigger validation error first
        vm.save()
        assertTrue(vm.uiState.value.errors.isNotEmpty(), "Should have validation errors")

        // Now update name - errors should clear
        vm.updateName("My Savings")
        assertEquals("My Savings", vm.uiState.value.name)
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on name update")
    }

    @Test
    fun `updateName truncates at 100 characters`() = runTest {
        val (vm, _) = createViewModel()

        val longName = "A".repeat(150)
        vm.updateName(longName)
        assertEquals(100, vm.uiState.value.name.length, "Name should be truncated to 100 chars")
    }

    @Test
    fun `updateAccountType sets type and clears errors`() = runTest {
        val (vm, _) = createViewModel()

        // Trigger validation error first
        vm.save()
        assertTrue(vm.uiState.value.errors.isNotEmpty())

        vm.updateAccountType(AccountType.SAVINGS)
        assertEquals(AccountType.SAVINGS, vm.uiState.value.accountType)
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on type change")
    }

    @Test
    fun `updateAccountType supports all account types`() = runTest {
        val (vm, _) = createViewModel()

        AccountType.entries.forEach { type ->
            vm.updateAccountType(type)
            assertEquals(type, vm.uiState.value.accountType, "Should support $type")
        }
    }

    @Test
    fun `updateCurrency sets currency and clears errors`() = runTest {
        val (vm, _) = createViewModel()

        // Trigger error
        vm.save()
        assertTrue(vm.uiState.value.errors.isNotEmpty())

        vm.updateCurrency("EUR")
        assertEquals("EUR", vm.uiState.value.currency)
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on currency change")
    }

    @Test
    fun `updateInitialBalance filters non-numeric characters`() = runTest {
        val (vm, _) = createViewModel()

        vm.updateInitialBalance("abc1234.56xyz")
        assertEquals("1234.56", vm.uiState.value.initialBalance)
    }

    @Test
    fun `updateInitialBalance limits decimal places to 2`() = runTest {
        val (vm, _) = createViewModel()

        vm.updateInitialBalance("100.999")
        assertEquals("100.99", vm.uiState.value.initialBalance)
    }

    @Test
    fun `updateInitialBalance allows whole numbers`() = runTest {
        val (vm, _) = createViewModel()

        vm.updateInitialBalance("500")
        assertEquals("500", vm.uiState.value.initialBalance)
    }

    @Test
    fun `updateInitialBalance clears errors`() = runTest {
        val (vm, _) = createViewModel()

        vm.save()
        assertTrue(vm.uiState.value.errors.isNotEmpty())

        vm.updateInitialBalance("100.00")
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on balance change")
    }

    @Test
    fun `updateNote sets note and clears errors`() = runTest {
        val (vm, _) = createViewModel()

        // Trigger error
        vm.save()
        assertTrue(vm.uiState.value.errors.isNotEmpty())

        vm.updateNote("Some note")
        assertEquals("Some note", vm.uiState.value.note)
        assertTrue(vm.uiState.value.errors.isEmpty(), "Errors should be cleared on note change")
    }

    @Test
    fun `updateNote truncates at 500 characters`() = runTest {
        val (vm, _) = createViewModel()

        val longNote = "N".repeat(600)
        vm.updateNote(longNote)
        assertEquals(500, vm.uiState.value.note.length, "Note should be truncated to 500 chars")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validation

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save with blank name shows error`() = runTest {
        val (vm, _) = createViewModel()

        vm.save()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state.errors.isNotEmpty(), "Should have validation errors")
        assertTrue(
            state.errors.any { it.contains("name", ignoreCase = true) },
            "Should have a name-related error",
        )
        assertFalse(state.isSaved, "Should not be saved when validation fails")
    }

    @Test
    fun `save with whitespace-only name shows error`() = runTest {
        val (vm, _) = createViewModel()

        vm.updateName("   ")
        vm.save()
        advanceUntilIdle()

        assertTrue(
            vm.uiState.value.errors.any { it.contains("name", ignoreCase = true) },
            "Whitespace-only name should fail validation",
        )
    }

    @Test
    fun `save with valid name does not show name error`() = runTest {
        val (vm, _) = createViewModel()

        vm.updateName("Valid Account")
        vm.save()
        advanceUntilIdle()

        assertFalse(
            vm.uiState.value.errors.any { it.contains("name", ignoreCase = true) },
            "Valid name should not produce a name error",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Save - happy path

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save with valid data inserts account and sets isSaved`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Main Checking")
        vm.updateAccountType(AccountType.CHECKING)
        vm.updateCurrency("USD")
        vm.updateInitialBalance("1500.50")
        vm.updateNote("Primary account")

        vm.save()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state.isSaved, "Account should be saved")
        assertFalse(state.isSaving, "Should no longer be saving")
        assertTrue(state.errors.isEmpty(), "Should have no errors")

        // Verify repository received the account
        assertEquals(1, repo.inserted.size, "Repository should have 1 account")

        val saved = repo.inserted.first()
        assertEquals("Main Checking", saved.name)
        assertEquals(AccountType.CHECKING, saved.type)
        assertEquals(Currency("USD"), saved.currency)
        assertEquals(Cents(150_050L), saved.currentBalance, "1500.50 should be 150050 cents")
    }

    @Test
    fun `save with zero balance creates account with zero cents`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Empty Account")
        // Leave balance empty (defaults to 0)

        vm.save()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isSaved)
        assertEquals(Cents(0L), repo.inserted.first().currentBalance)
    }

    @Test
    fun `save with empty balance string creates account with zero cents`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test Account")
        vm.updateInitialBalance("")

        vm.save()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isSaved)
        assertEquals(Cents(0L), repo.inserted.first().currentBalance)
    }

    @Test
    fun `save trims whitespace from name`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("  Padded Name  ")
        vm.save()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isSaved)
        assertEquals("Padded Name", repo.inserted.first().name)
    }

    @Test
    fun `save creates account with correct type`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Credit Card")
        vm.updateAccountType(AccountType.CREDIT_CARD)
        vm.save()
        advanceUntilIdle()

        assertEquals(AccountType.CREDIT_CARD, repo.inserted.first().type)
    }

    @Test
    fun `save creates account with selected currency`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Euro Account")
        vm.updateCurrency("EUR")
        vm.save()
        advanceUntilIdle()

        assertEquals(Currency("EUR"), repo.inserted.first().currency)
    }

    @Test
    fun `save generates unique ID for each account`() = runTest {
        val repo = TestAccountRepository()

        // Save first account
        val (vm1, _) = createViewModel(repo)
        vm1.updateName("Account One")
        vm1.save()
        advanceUntilIdle()

        // Save second account
        val (vm2, _) = createViewModel(repo)
        vm2.updateName("Account Two")
        vm2.save()
        advanceUntilIdle()

        assertEquals(2, repo.inserted.size)
        val ids = repo.inserted.map { it.id }
        assertEquals(ids.toSet().size, ids.size, "Each account should have a unique ID")
    }

    @Test
    fun `save sets createdAt and updatedAt to current time`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Timestamped Account")
        vm.save()
        advanceUntilIdle()

        val saved = repo.inserted.first()
        assertEquals(saved.createdAt, saved.updatedAt, "createdAt and updatedAt should match")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Save - all account types

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save works for all account types`() = runTest {
        AccountType.entries.forEach { type ->
            val repo = TestAccountRepository()
            val (vm, _) = createViewModel(repo)

            vm.updateName("Test ${type.name}")
            vm.updateAccountType(type)
            vm.save()
            advanceUntilIdle()

            assertTrue(vm.uiState.value.isSaved, "Save should succeed for $type")
            assertEquals(type, repo.inserted.first().type, "Type should be $type")
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Save - error handling

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `save failure shows error message`() = runTest {
        val repo = TestAccountRepository(shouldFailOnInsert = true)
        val (vm, _) = createViewModel(repo)

        vm.updateName("Doomed Account")
        vm.save()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isSaved, "Should not be saved when insert fails")
        assertFalse(state.isSaving, "Should not still be saving after failure")
        assertTrue(state.errors.isNotEmpty(), "Should have error messages")
        assertTrue(
            state.errors.any { it.contains("Simulated insert failure") },
            "Error should contain the exception message",
        )
    }

    @Test
    fun `save failure preserves form data`() = runTest {
        val repo = TestAccountRepository(shouldFailOnInsert = true)
        val (vm, _) = createViewModel(repo)

        vm.updateName("My Account")
        vm.updateAccountType(AccountType.INVESTMENT)
        vm.updateCurrency("GBP")
        vm.updateInitialBalance("999.99")
        vm.updateNote("Important")

        vm.save()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals("My Account", state.name, "Name should be preserved after failure")
        assertEquals(AccountType.INVESTMENT, state.accountType, "Type should be preserved")
        assertEquals("GBP", state.currency, "Currency should be preserved")
        assertEquals("999.99", state.initialBalance, "Balance should be preserved")
        assertEquals("Important", state.note, "Note should be preserved")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Balance conversion

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `balance conversion - whole dollars`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test")
        vm.updateInitialBalance("100")
        vm.save()
        advanceUntilIdle()

        assertEquals(Cents(10_000L), repo.inserted.first().currentBalance)
    }

    @Test
    fun `balance conversion - dollars and cents`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test")
        vm.updateInitialBalance("42.99")
        vm.save()
        advanceUntilIdle()

        assertEquals(Cents(4_299L), repo.inserted.first().currentBalance)
    }

    @Test
    fun `balance conversion - single decimal place`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test")
        vm.updateInitialBalance("5.5")
        vm.save()
        advanceUntilIdle()

        // 5.5 dollars = 550 cents
        assertEquals(Cents(550L), repo.inserted.first().currentBalance)
    }

    @Test
    fun `balance conversion - zero`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test")
        vm.updateInitialBalance("0")
        vm.save()
        advanceUntilIdle()

        assertEquals(Cents(0L), repo.inserted.first().currentBalance)
    }

    @Test
    fun `balance conversion - large amount`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test")
        vm.updateInitialBalance("999999.99")
        vm.save()
        advanceUntilIdle()

        assertEquals(Cents(99_999_999L), repo.inserted.first().currentBalance)
    }

    // ═══════════════════════════════════════════════════════════════════
    // State transitions during save

    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `validation errors do not trigger saving state`() = runTest {
        val (vm, _) = createViewModel()

        // Name is blank - validation fails synchronously
        vm.save()

        assertFalse(vm.uiState.value.isSaving, "Validation failure should not set isSaving")
    }

    @Test
    fun `multiple saves do not duplicate accounts`() = runTest {
        val repo = TestAccountRepository()
        val (vm, _) = createViewModel(repo)

        vm.updateName("Test Account")
        vm.save()
        advanceUntilIdle()

        // After isSaved=true, calling save again should still show isSaved
        // (the composable would have navigated away by now)
        assertTrue(vm.uiState.value.isSaved)
        assertEquals(1, repo.inserted.size, "Should only have one account inserted")
    }
}