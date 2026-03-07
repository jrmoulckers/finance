package com.finance.android.ui.data

import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.Category
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime

/**
 * Realistic sample financial data for development and previews.
 *
 * All amounts are in [Cents] (USD). This data is used by ViewModels
 * until a live database is available.
 */
object SampleData {

    private val now = Clock.System.now()
    private val tz = TimeZone.currentSystemDefault()
    private val today: LocalDate = now.toLocalDateTime(tz).date

    // ── Categories ──────────────────────────────────────────────────────

    val categories = listOf(
        category("cat-groceries", "Groceries", "shopping_cart"),
        category("cat-dining", "Dining Out", "restaurant"),
        category("cat-transport", "Transportation", "directions_car"),
        category("cat-entertainment", "Entertainment", "movie"),
        category("cat-utilities", "Utilities", "bolt"),
        category("cat-shopping", "Shopping", "shopping_bag"),
        category("cat-subscriptions", "Subscriptions", "subscriptions"),
        category("cat-salary", "Salary", "payments", isIncome = true),
        category("cat-freelance", "Freelance", "work", isIncome = true),
    )

    val categoryMap: Map<SyncId, Category> = categories.associateBy { it.id }

    // ── Budgets ─────────────────────────────────────────────────────────

    val budgets = listOf(
        budget("bud-groceries", "cat-groceries", "Groceries", 60_000L, BudgetPeriod.MONTHLY),
        budget("bud-dining", "cat-dining", "Dining Out", 30_000L, BudgetPeriod.MONTHLY),
        budget("bud-transport", "cat-transport", "Transportation", 20_000L, BudgetPeriod.MONTHLY),
        budget("bud-entertainment", "cat-entertainment", "Entertainment", 15_000L, BudgetPeriod.MONTHLY),
        budget("bud-shopping", "cat-shopping", "Shopping", 25_000L, BudgetPeriod.MONTHLY),
        budget("bud-subscriptions", "cat-subscriptions", "Subscriptions", 8_000L, BudgetPeriod.MONTHLY),
    )

    // ── Goals ───────────────────────────────────────────────────────────

    val goals = listOf(
        goal("goal-emergency", "Emergency Fund", 1_000_000L, 600_000L, "shield", "#2E7D32",
            targetDate = LocalDate(today.year + 1, 6, 30)),
        goal("goal-vacation", "Vacation Fund", 300_000L, 150_000L, "flight", "#1565C0",
            targetDate = LocalDate(today.year, 12, 15)),
        goal("goal-laptop", "New Laptop", 200_000L, 180_000L, "laptop", "#7570B3",
            targetDate = LocalDate(today.year + 1, 3, 31)),
        goal("goal-home", "Home Down Payment", 5_000_000L, 1_250_000L, "home", "#D95F02",
            targetDate = LocalDate(today.year + 2, 6, 1)),
        goal("goal-car", "Car Fund", 2_500_000L, 2_500_000L, "directions_car", "#66A61E",
            status = GoalStatus.COMPLETED),
    )

    /** Simulated monthly contribution history per goal (cents per month). */
    val goalContributions: Map<String, List<Long>> = mapOf(
        "goal-emergency" to listOf(80_000L, 90_000L, 85_000L, 95_000L, 75_000L, 100_000L),
        "goal-vacation" to listOf(25_000L, 30_000L, 20_000L, 28_000L, 22_000L, 25_000L),
        "goal-laptop" to listOf(30_000L, 35_000L, 25_000L, 30_000L, 30_000L, 30_000L),
        "goal-home" to listOf(150_000L, 175_000L, 200_000L, 160_000L, 190_000L, 175_000L),
        "goal-car" to listOf(200_000L, 250_000L, 225_000L, 300_000L, 275_000L, 250_000L),
    )

    // ── Transactions ────────────────────────────────────────────────────

    val transactions: List<Transaction> = buildList {
        add(expense("txn-1", "Whole Foods Market", 8_743L, "cat-groceries", today))
        add(expense("txn-2", "Starbucks", 5_85L, "cat-dining", today))
        add(expense("txn-3", "Uber", 14_50L, "cat-transport", today))

        val yesterday = today.minus(1, DateTimeUnit.DAY)
        add(expense("txn-4", "Target", 67_42L, "cat-shopping", yesterday))
        add(expense("txn-5", "Netflix", 15_99L, "cat-subscriptions", yesterday))
        add(expense("txn-6", "Chipotle", 12_35L, "cat-dining", yesterday))

        val twoDaysAgo = today.minus(2, DateTimeUnit.DAY)
        add(expense("txn-7", "Shell Gas Station", 52_18L, "cat-transport", twoDaysAgo))
        add(expense("txn-8", "Trader Joe's", 43_87L, "cat-groceries", twoDaysAgo))
        add(income("txn-9", "Acme Corp", 3_250_00L, "cat-salary", twoDaysAgo))

        val threeDaysAgo = today.minus(3, DateTimeUnit.DAY)
        add(expense("txn-10", "Amazon", 34_99L, "cat-shopping", threeDaysAgo))

        val fourDaysAgo = today.minus(4, DateTimeUnit.DAY)
        add(expense("txn-12", "Electric Company", 142_30L, "cat-utilities", fourDaysAgo))
        add(expense("txn-13", "AMC Theatres", 18_50L, "cat-entertainment", fourDaysAgo))
        add(expense("txn-14", "Panera Bread", 11_24L, "cat-dining", fourDaysAgo))

        val fiveDaysAgo = today.minus(5, DateTimeUnit.DAY)
        add(expense("txn-15", "Costco", 156_78L, "cat-groceries", fiveDaysAgo))
        add(expense("txn-16", "Spotify", 10_99L, "cat-subscriptions", fiveDaysAgo))

        val sixDaysAgo = today.minus(6, DateTimeUnit.DAY)
        add(expense("txn-17", "Lyft", 22_40L, "cat-transport", sixDaysAgo))
        add(expense("txn-18", "Olive Garden", 45_62L, "cat-dining", sixDaysAgo))

        val sevenDaysAgo = today.minus(7, DateTimeUnit.DAY)
        add(income("txn-19", "Freelance Project", 850_00L, "cat-freelance", sevenDaysAgo))
    }

    /** Last-month transactions for month-over-month budget comparison. */
    val lastMonthTransactions: List<Transaction> = buildList {
        val lastMonth = today.minus(30, DateTimeUnit.DAY)
        add(expense("lt-01", "Whole Foods", 55_000L, "cat-groceries", lastMonth))
        add(expense("lt-02", "Trader Joe's", 12_000L, "cat-groceries",
            lastMonth.minus(5, DateTimeUnit.DAY)))
        add(expense("lt-03", "Sushi Place", 16_000L, "cat-dining",
            lastMonth.minus(3, DateTimeUnit.DAY)))
        add(expense("lt-04", "Gas Station", 8_500L, "cat-transport",
            lastMonth.minus(7, DateTimeUnit.DAY)))
        add(expense("lt-05", "Movie Night", 7_500L, "cat-entertainment",
            lastMonth.minus(10, DateTimeUnit.DAY)))
        add(expense("lt-06", "Electric Bill", 12_500L, "cat-utilities",
            lastMonth.minus(2, DateTimeUnit.DAY)))
        add(expense("lt-07", "Amazon", 18_000L, "cat-shopping",
            lastMonth.minus(8, DateTimeUnit.DAY)))
        add(expense("lt-08", "Spotify+Netflix", 2_700L, "cat-subscriptions",
            lastMonth.minus(1, DateTimeUnit.DAY)))
    }

    // ── Factory helpers ─────────────────────────────────────────────────

    private fun category(
        id: String,
        name: String,
        icon: String,
        isIncome: Boolean = false,
    ) = Category(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        name = name,
        icon = icon,
        isIncome = isIncome,
        createdAt = now,
        updatedAt = now,
    )

    private fun budget(
        id: String,
        categoryId: String,
        name: String,
        amountCents: Long,
        period: BudgetPeriod,
    ) = Budget(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        categoryId = SyncId(categoryId),
        name = name,
        amount = Cents(amountCents),
        currency = Currency.USD,
        period = period,
        startDate = LocalDate(today.year, today.monthNumber, 1),
        createdAt = now,
        updatedAt = now,
    )

    private fun goal(
        id: String,
        name: String,
        targetCents: Long,
        currentCents: Long,
        icon: String,
        color: String,
        targetDate: LocalDate? = null,
        status: GoalStatus = GoalStatus.ACTIVE,
    ) = Goal(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        name = name,
        targetAmount = Cents(targetCents),
        currentAmount = Cents(currentCents),
        currency = Currency.USD,
        targetDate = targetDate,
        status = status,
        icon = icon,
        color = color,
        createdAt = now,
        updatedAt = now,
    )

    private fun expense(
        id: String,
        payee: String,
        amountCents: Long,
        categoryId: String,
        date: LocalDate,
    ) = Transaction(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        accountId = SyncId("acc-checking"),
        categoryId = SyncId(categoryId),
        type = TransactionType.EXPENSE,
        status = TransactionStatus.CLEARED,
        amount = Cents(-amountCents),
        currency = Currency.USD,
        payee = payee,
        date = date,
        createdAt = now,
        updatedAt = now,
    )

    private fun income(
        id: String,
        payee: String,
        amountCents: Long,
        categoryId: String,
        date: LocalDate,
    ) = Transaction(
        id = SyncId(id),
        householdId = SyncId("household-1"),
        accountId = SyncId("acc-checking"),
        categoryId = SyncId(categoryId),
        type = TransactionType.INCOME,
        status = TransactionStatus.CLEARED,
        amount = Cents(amountCents),
        currency = Currency.USD,
        payee = payee,
        date = date,
        createdAt = now,
        updatedAt = now,
    )
}
