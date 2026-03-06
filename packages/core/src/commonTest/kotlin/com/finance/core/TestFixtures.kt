package com.finance.core

import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*

/**
 * Test data factories for creating model instances in tests.
 * Provides sensible defaults so tests only specify what they care about.
 */
object TestFixtures {
    private var idCounter = 0

    fun reset() { idCounter = 0 }

    fun nextId(): SyncId = SyncId("test-${++idCounter}")

    /** Fixed instant for deterministic tests — 2024-06-15T12:00:00Z */
    val fixedInstant: Instant = Instant.parse("2024-06-15T12:00:00Z")

    /** Fixed date for deterministic tests — 2024-06-15 */
    val fixedDate: LocalDate = LocalDate(2024, 6, 15)

    fun now(): Instant = Clock.System.now()
    fun today(): LocalDate = Clock.System.now().toLocalDateTime(TimeZone.UTC).date

    // ── Account Factory ──────────────────────────────────────────────

    fun createAccount(
        id: SyncId = nextId(),
        householdId: SyncId = SyncId("household-1"),
        name: String = "Test Account",
        type: AccountType = AccountType.CHECKING,
        currency: Currency = Currency.USD,
        currentBalance: Cents = Cents(10000), // $100.00
        isArchived: Boolean = false,
        createdAt: Instant = fixedInstant,
        updatedAt: Instant = fixedInstant,
        deletedAt: Instant? = null,
    ): Account = Account(
        id = id,
        householdId = householdId,
        name = name,
        type = type,
        currency = currency,
        currentBalance = currentBalance,
        isArchived = isArchived,
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

    // ── Transaction Factory ──────────────────────────────────────────

    fun createTransaction(
        id: SyncId = nextId(),
        householdId: SyncId = SyncId("household-1"),
        accountId: SyncId = SyncId("account-1"),
        categoryId: SyncId? = SyncId("category-1"),
        type: TransactionType = TransactionType.EXPENSE,
        status: TransactionStatus = TransactionStatus.CLEARED,
        amount: Cents = Cents(2500), // $25.00
        currency: Currency = Currency.USD,
        payee: String? = null,
        note: String? = null,
        date: LocalDate = fixedDate,
        transferAccountId: SyncId? = null,
        createdAt: Instant = fixedInstant,
        updatedAt: Instant = fixedInstant,
        deletedAt: Instant? = null,
    ): Transaction = Transaction(
        id = id,
        householdId = householdId,
        accountId = accountId,
        categoryId = categoryId,
        type = type,
        status = status,
        amount = amount,
        currency = currency,
        payee = payee,
        note = note,
        date = date,
        transferAccountId = transferAccountId,
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

    fun createExpense(
        amount: Cents = Cents(2500),
        date: LocalDate = fixedDate,
        categoryId: SyncId? = SyncId("category-1"),
        accountId: SyncId = SyncId("account-1"),
        status: TransactionStatus = TransactionStatus.CLEARED,
        deletedAt: Instant? = null,
    ): Transaction = createTransaction(
        type = TransactionType.EXPENSE,
        amount = amount,
        date = date,
        categoryId = categoryId,
        accountId = accountId,
        status = status,
        deletedAt = deletedAt,
    )

    fun createIncome(
        amount: Cents = Cents(5000),
        date: LocalDate = fixedDate,
        categoryId: SyncId? = SyncId("income-category"),
        accountId: SyncId = SyncId("account-1"),
        status: TransactionStatus = TransactionStatus.CLEARED,
        deletedAt: Instant? = null,
    ): Transaction = createTransaction(
        type = TransactionType.INCOME,
        amount = amount,
        date = date,
        categoryId = categoryId,
        accountId = accountId,
        status = status,
        deletedAt = deletedAt,
    )

    // ── Budget Factory ───────────────────────────────────────────────

    fun createBudget(
        id: SyncId = nextId(),
        householdId: SyncId = SyncId("household-1"),
        categoryId: SyncId = SyncId("category-1"),
        name: String = "Test Budget",
        amount: Cents = Cents(50000), // $500.00
        currency: Currency = Currency.USD,
        period: BudgetPeriod = BudgetPeriod.MONTHLY,
        startDate: LocalDate = LocalDate(2024, 6, 1),
        createdAt: Instant = fixedInstant,
        updatedAt: Instant = fixedInstant,
    ): Budget = Budget(
        id = id,
        householdId = householdId,
        categoryId = categoryId,
        name = name,
        amount = amount,
        currency = currency,
        period = period,
        startDate = startDate,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}
