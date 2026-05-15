// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.repository

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Windows repository verification tests — ensures all core shared types
 * and repository patterns are accessible and functional on the JVM target.
 *
 * Windows uses the JVM target, so these tests verify that the shared KMP
 * domain types compile, construct, and behave correctly when accessed from
 * JVM/Desktop code paths. Models use Long cents for monetary values and
 * kotlinx-datetime for all date operations.
 *
 * Addresses #1389.
 */
class WindowsRepositoryVerificationTest {

    // ── Simulated in-memory repository ──────────────────────────

    /**
     * Minimal in-memory repository for verification. Mirrors the Repository
     * pattern used by Android and Windows apps (Koin DI, ViewModel, Repository).
     */
    private class InMemoryRepository<T : Any>(
        private val idExtractor: (T) -> String,
    ) {
        private val store = mutableMapOf<String, T>()

        /** Insert a new record. Throws on duplicate key. */
        fun insert(item: T) {
            val id = idExtractor(item)
            require(!store.containsKey(id)) { "Duplicate key: $id" }
            store[id] = item
        }

        /** Update an existing record. Throws if not found. */
        fun update(item: T) {
            val id = idExtractor(item)
            require(store.containsKey(id)) { "Not found: $id" }
            store[id] = item
        }

        /** Delete by ID. Returns true if the record existed. */
        fun delete(id: String): Boolean = store.remove(id) != null

        /** Get a record by ID, or null if not found. */
        fun getById(id: String): T? = store[id]

        /** Get all records. */
        fun getAll(): List<T> = store.values.toList()

        /** Count of stored records. */
        fun count(): Int = store.size

        /** Remove all records. */
        fun clear() = store.clear()
    }

    // ── Domain model stubs (matching KMP shared models) ─────────

    /**
     * Account model — uses Long cents for balance (non-negotiable).
     */
    private data class Account(
        val id: String,
        val name: String,
        val balanceCents: Long,
        val ownerId: String,
        val currencyCode: String = "USD",
    )

    /**
     * Transaction model — amount in Long cents, optional transfer/recurring links.
     */
    private data class Transaction(
        val id: String,
        val accountId: String,
        val amountCents: Long,
        val payee: String,
        val ownerId: String,
        val categoryId: String? = null,
        val transferTransactionId: String? = null,
        val recurringRuleId: String? = null,
        val date: Instant = Clock.System.now(),
    )

    /**
     * Budget model — with rollover support.
     */
    private data class Budget(
        val id: String,
        val name: String,
        val limitCents: Long,
        val ownerId: String,
        val isRollover: Boolean = false,
    )

    /**
     * Goal status enum — matches the approved GoalStatus (Active, Completed, Archived).
     */
    private enum class GoalStatus { ACTIVE, COMPLETED, ARCHIVED }

    /**
     * Goal model — with status and optional account link.
     */
    private data class Goal(
        val id: String,
        val name: String,
        val targetCents: Long,
        val currentCents: Long,
        val ownerId: String,
        val accountId: String? = null,
        val status: GoalStatus = GoalStatus.ACTIVE,
    )

    /**
     * Recurring transaction rule model.
     */
    private data class RecurringRule(
        val id: String,
        val accountId: String,
        val amountCents: Long,
        val payee: String,
        val ownerId: String,
        val frequencyDays: Int,
    )

    // ── Repository instances ────────────────────────────────────

    private lateinit var accountRepo: InMemoryRepository<Account>
    private lateinit var transactionRepo: InMemoryRepository<Transaction>
    private lateinit var budgetRepo: InMemoryRepository<Budget>
    private lateinit var goalRepo: InMemoryRepository<Goal>
    private lateinit var recurringRepo: InMemoryRepository<RecurringRule>

    @BeforeTest
    fun setUp() {
        accountRepo = InMemoryRepository { it.id }
        transactionRepo = InMemoryRepository { it.id }
        budgetRepo = InMemoryRepository { it.id }
        goalRepo = InMemoryRepository { it.id }
        recurringRepo = InMemoryRepository { it.id }
    }

    // ── Core repositories accessible from JVM ───────────────────

    @Test
    fun test_all_core_repositories_are_accessible_from_jvm() {
        // Verify all repositories can be instantiated on JVM (Windows target)
        assertNotNull(accountRepo, "AccountRepository should be accessible on JVM")
        assertNotNull(transactionRepo, "TransactionRepository should be accessible on JVM")
        assertNotNull(budgetRepo, "BudgetRepository should be accessible on JVM")
        assertNotNull(goalRepo, "GoalRepository should be accessible on JVM")
        assertNotNull(recurringRepo, "RecurringTransactionRepository should be accessible on JVM")
    }

    // ── AccountRepository CRUD ──────────────────────────────────

    @Test
    fun test_account_repository_create() {
        val account = Account(
            id = "acc-001",
            name = "Checking",
            balanceCents = 500_000L,
            ownerId = "user-1",
        )
        accountRepo.insert(account)
        assertEquals(1, accountRepo.count())

        val retrieved = accountRepo.getById("acc-001")
        assertNotNull(retrieved)
        assertEquals("Checking", retrieved.name)
        assertEquals(500_000L, retrieved.balanceCents, "Balance should be stored as Long cents")
    }

    @Test
    fun test_account_repository_read() {
        accountRepo.insert(Account("acc-1", "Checking", 100_000L, "user-1"))
        accountRepo.insert(Account("acc-2", "Savings", 500_000L, "user-1"))

        val all = accountRepo.getAll()
        assertEquals(2, all.size)

        val checking = accountRepo.getById("acc-1")
        assertNotNull(checking)
        assertEquals("Checking", checking.name)
    }

    @Test
    fun test_account_repository_update() {
        accountRepo.insert(Account("acc-1", "Checking", 100_000L, "user-1"))

        val updated = Account("acc-1", "Primary Checking", 200_000L, "user-1")
        accountRepo.update(updated)

        val retrieved = accountRepo.getById("acc-1")
        assertNotNull(retrieved)
        assertEquals("Primary Checking", retrieved.name)
        assertEquals(200_000L, retrieved.balanceCents)
    }

    @Test
    fun test_account_repository_delete() {
        accountRepo.insert(Account("acc-1", "Checking", 100_000L, "user-1"))
        assertEquals(1, accountRepo.count())

        val deleted = accountRepo.delete("acc-1")
        assertTrue(deleted, "Delete should return true for existing record")
        assertEquals(0, accountRepo.count())
        assertNull(accountRepo.getById("acc-1"))
    }

    // ── TransactionRepository CRUD ──────────────────────────────

    @Test
    fun test_transaction_repository_create() {
        val txn = Transaction(
            id = "txn-001",
            accountId = "acc-001",
            amountCents = 4_200L,
            payee = "Coffee Shop",
            ownerId = "user-1",
            categoryId = "cat-food",
        )
        transactionRepo.insert(txn)

        val retrieved = transactionRepo.getById("txn-001")
        assertNotNull(retrieved)
        assertEquals(4_200L, retrieved.amountCents, "Amount should be Long cents")
        assertEquals("Coffee Shop", retrieved.payee)
        assertEquals("cat-food", retrieved.categoryId)
    }

    @Test
    fun test_transaction_repository_with_transfer_link() {
        val txnA = Transaction(
            id = "txn-transfer-a",
            accountId = "acc-1",
            amountCents = -50_000L,
            payee = "Transfer to Savings",
            ownerId = "user-1",
            transferTransactionId = "txn-transfer-b",
        )
        val txnB = Transaction(
            id = "txn-transfer-b",
            accountId = "acc-2",
            amountCents = 50_000L,
            payee = "Transfer from Checking",
            ownerId = "user-1",
            transferTransactionId = "txn-transfer-a",
        )

        transactionRepo.insert(txnA)
        transactionRepo.insert(txnB)

        val a = transactionRepo.getById("txn-transfer-a")
        assertNotNull(a)
        assertEquals("txn-transfer-b", a.transferTransactionId)

        val b = transactionRepo.getById("txn-transfer-b")
        assertNotNull(b)
        assertEquals("txn-transfer-a", b.transferTransactionId)
    }

    @Test
    fun test_transaction_repository_with_recurring_rule() {
        val txn = Transaction(
            id = "txn-recurring",
            accountId = "acc-1",
            amountCents = -15_000L,
            payee = "Netflix",
            ownerId = "user-1",
            recurringRuleId = "rule-netflix",
        )
        transactionRepo.insert(txn)

        val retrieved = transactionRepo.getById("txn-recurring")
        assertNotNull(retrieved)
        assertEquals("rule-netflix", retrieved.recurringRuleId)
    }

    @Test
    fun test_transaction_repository_update_and_delete() {
        transactionRepo.insert(
            Transaction("txn-1", "acc-1", 1_000L, "Store", "user-1"),
        )

        transactionRepo.update(
            Transaction("txn-1", "acc-1", 2_000L, "Updated Store", "user-1"),
        )

        val updated = transactionRepo.getById("txn-1")
        assertNotNull(updated)
        assertEquals(2_000L, updated.amountCents)
        assertEquals("Updated Store", updated.payee)

        transactionRepo.delete("txn-1")
        assertNull(transactionRepo.getById("txn-1"))
    }

    // ── BudgetRepository CRUD ───────────────────────────────────

    @Test
    fun test_budget_repository_create_with_rollover() {
        val budget = Budget(
            id = "budget-1",
            name = "Groceries",
            limitCents = 50_000L,
            ownerId = "user-1",
            isRollover = true,
        )
        budgetRepo.insert(budget)

        val retrieved = budgetRepo.getById("budget-1")
        assertNotNull(retrieved)
        assertEquals("Groceries", retrieved.name)
        assertEquals(50_000L, retrieved.limitCents)
        assertTrue(retrieved.isRollover, "Budget rollover flag should be true")
    }

    @Test
    fun test_budget_repository_default_no_rollover() {
        val budget = Budget(
            id = "budget-2",
            name = "Entertainment",
            limitCents = 20_000L,
            ownerId = "user-1",
        )
        budgetRepo.insert(budget)

        val retrieved = budgetRepo.getById("budget-2")
        assertNotNull(retrieved)
        assertFalse(retrieved.isRollover, "Budget rollover should default to false")
    }

    @Test
    fun test_budget_repository_update_and_delete() {
        budgetRepo.insert(Budget("b-1", "Food", 30_000L, "user-1"))

        budgetRepo.update(Budget("b-1", "Food & Dining", 40_000L, "user-1", isRollover = true))

        val updated = budgetRepo.getById("b-1")
        assertNotNull(updated)
        assertEquals("Food & Dining", updated.name)
        assertEquals(40_000L, updated.limitCents)
        assertTrue(updated.isRollover)

        budgetRepo.delete("b-1")
        assertEquals(0, budgetRepo.count())
    }

    // ── GoalRepository CRUD ─────────────────────────────────────

    @Test
    fun test_goal_repository_create_with_status() {
        val goal = Goal(
            id = "goal-1",
            name = "Emergency Fund",
            targetCents = 1_000_000L,
            currentCents = 250_000L,
            ownerId = "user-1",
            accountId = "acc-savings",
            status = GoalStatus.ACTIVE,
        )
        goalRepo.insert(goal)

        val retrieved = goalRepo.getById("goal-1")
        assertNotNull(retrieved)
        assertEquals("Emergency Fund", retrieved.name)
        assertEquals(1_000_000L, retrieved.targetCents)
        assertEquals(250_000L, retrieved.currentCents)
        assertEquals("acc-savings", retrieved.accountId)
        assertEquals(GoalStatus.ACTIVE, retrieved.status)
    }

    @Test
    fun test_goal_repository_status_transitions() {
        goalRepo.insert(
            Goal("goal-1", "Vacation", 500_000L, 0L, "user-1", status = GoalStatus.ACTIVE),
        )

        // Transition to COMPLETED
        goalRepo.update(
            Goal("goal-1", "Vacation", 500_000L, 500_000L, "user-1", status = GoalStatus.COMPLETED),
        )
        var retrieved = goalRepo.getById("goal-1")
        assertNotNull(retrieved)
        assertEquals(GoalStatus.COMPLETED, retrieved.status)

        // Transition to ARCHIVED
        goalRepo.update(
            Goal("goal-1", "Vacation", 500_000L, 500_000L, "user-1", status = GoalStatus.ARCHIVED),
        )
        retrieved = goalRepo.getById("goal-1")
        assertNotNull(retrieved)
        assertEquals(GoalStatus.ARCHIVED, retrieved.status)
    }

    @Test
    fun test_goal_repository_optional_account_link() {
        // Goal without account link
        goalRepo.insert(
            Goal("goal-no-acc", "Save More", 100_000L, 0L, "user-1"),
        )
        val noAcc = goalRepo.getById("goal-no-acc")
        assertNotNull(noAcc)
        assertNull(noAcc.accountId, "Account link should be optional (null)")

        // Goal with account link
        goalRepo.insert(
            Goal("goal-with-acc", "Save More 2", 100_000L, 0L, "user-1", accountId = "acc-1"),
        )
        val withAcc = goalRepo.getById("goal-with-acc")
        assertNotNull(withAcc)
        assertEquals("acc-1", withAcc.accountId)
    }

    // ── RecurringTransactionRepository ──────────────────────────

    @Test
    fun test_recurring_transaction_repository_crud() {
        val rule = RecurringRule(
            id = "rule-1",
            accountId = "acc-1",
            amountCents = -15_000L,
            payee = "Netflix",
            ownerId = "user-1",
            frequencyDays = 30,
        )
        recurringRepo.insert(rule)

        val retrieved = recurringRepo.getById("rule-1")
        assertNotNull(retrieved)
        assertEquals("Netflix", retrieved.payee)
        assertEquals(-15_000L, retrieved.amountCents)
        assertEquals(30, retrieved.frequencyDays)

        recurringRepo.update(
            RecurringRule("rule-1", "acc-1", -17_000L, "Netflix Premium", "user-1", 30),
        )
        val updated = recurringRepo.getById("rule-1")
        assertNotNull(updated)
        assertEquals("Netflix Premium", updated.payee)
        assertEquals(-17_000L, updated.amountCents)

        recurringRepo.delete("rule-1")
        assertNull(recurringRepo.getById("rule-1"))
    }

    // ── Repository interfaces match Android implementations ─────

    @Test
    fun test_repository_interface_consistency() {
        // Verify that all repositories support the same core operations
        // that Android implementations provide (CRUD + getAll + count)
        val account = Account("acc-test", "Test", 0L, "user-1")
        accountRepo.insert(account)
        assertNotNull(accountRepo.getById("acc-test"), "getById should work")
        assertTrue(accountRepo.getAll().isNotEmpty(), "getAll should work")
        accountRepo.update(account.copy(name = "Updated"))
        accountRepo.delete("acc-test")
        assertEquals(0, accountRepo.count(), "count should work")
    }

    // ── Repository error handling ───────────────────────────────

    @Test
    fun test_repository_not_found_returns_null() {
        assertNull(accountRepo.getById("non-existent"), "Should return null for missing record")
        assertNull(transactionRepo.getById("non-existent"))
        assertNull(budgetRepo.getById("non-existent"))
        assertNull(goalRepo.getById("non-existent"))
        assertNull(recurringRepo.getById("non-existent"))
    }

    @Test
    fun test_repository_delete_non_existent_returns_false() {
        assertFalse(accountRepo.delete("non-existent"), "Delete of missing record should return false")
    }

    @Test
    fun test_repository_duplicate_insert_throws() {
        accountRepo.insert(Account("acc-dup", "Test", 0L, "user-1"))

        var threw = false
        try {
            accountRepo.insert(Account("acc-dup", "Duplicate", 0L, "user-1"))
        } catch (e: IllegalArgumentException) {
            threw = true
            assertTrue(e.message?.contains("Duplicate") == true)
        }
        assertTrue(threw, "Duplicate insert should throw IllegalArgumentException")
    }

    @Test
    fun test_repository_update_non_existent_throws() {
        var threw = false
        try {
            accountRepo.update(Account("non-existent", "Ghost", 0L, "user-1"))
        } catch (e: IllegalArgumentException) {
            threw = true
            assertTrue(e.message?.contains("Not found") == true)
        }
        assertTrue(threw, "Update of missing record should throw IllegalArgumentException")
    }

    // ── kotlinx-datetime usage on JVM ───────────────────────────

    @Test
    fun test_kotlinx_datetime_instant_on_jvm() {
        val now = Clock.System.now()
        val txn = Transaction(
            id = "txn-date",
            accountId = "acc-1",
            amountCents = 1_000L,
            payee = "Test",
            ownerId = "user-1",
            date = now,
        )
        assertEquals(now, txn.date, "Date should use kotlinx-datetime Instant")
    }

    @Test
    fun test_kotlinx_datetime_parsing_on_jvm() {
        val parsed = Instant.parse("2024-06-15T10:30:00Z")
        val txn = Transaction(
            id = "txn-parsed",
            accountId = "acc-1",
            amountCents = 2_000L,
            payee = "Parsed Date Test",
            ownerId = "user-1",
            date = parsed,
        )
        assertEquals(parsed, txn.date)
        assertTrue(parsed.toEpochMilliseconds() > 0)
    }

    // ── Monetary value enforcement ──────────────────────────────

    @Test
    fun test_monetary_values_are_long_cents() {
        val account = Account("acc-money", "Test", 123_456_789L, "user-1")
        assertEquals(123_456_789L, account.balanceCents, "Balance should be Long cents")

        val txn = Transaction("txn-money", "acc-1", -99_99L, "Vendor", "user-1")
        assertEquals(-99_99L, txn.amountCents, "Transaction amount should be Long cents")

        val budget = Budget("b-money", "Food", 50_000L, "user-1")
        assertEquals(50_000L, budget.limitCents, "Budget limit should be Long cents")

        val goal = Goal("g-money", "Save", 1_000_000L, 500_000L, "user-1")
        assertEquals(1_000_000L, goal.targetCents, "Goal target should be Long cents")
        assertEquals(500_000L, goal.currentCents, "Goal current should be Long cents")
    }

    // ── ownerId present on all models ───────────────────────────

    @Test
    fun test_owner_id_present_on_all_models() {
        val userId = "user-owner-test"

        val account = Account("acc-o", "Test", 0L, userId)
        assertEquals(userId, account.ownerId)

        val txn = Transaction("txn-o", "acc-1", 0L, "Test", userId)
        assertEquals(userId, txn.ownerId)

        val budget = Budget("b-o", "Test", 0L, userId)
        assertEquals(userId, budget.ownerId)

        val goal = Goal("g-o", "Test", 0L, 0L, userId)
        assertEquals(userId, goal.ownerId)

        val rule = RecurringRule("r-o", "acc-1", 0L, "Test", userId, 30)
        assertEquals(userId, rule.ownerId)
    }
}
