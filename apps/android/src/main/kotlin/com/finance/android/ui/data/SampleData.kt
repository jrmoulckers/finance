package com.finance.android.ui.data

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

    // -- Categories -----------------------------------------------------------

    val categories = listOf(
        category("cat-groceries", "Groceries", "shopping_cart"),
        category("cat-dining", "Dining Out", "restaurant"),
        category("cat-transport", "Transportation", "directions_car"),
        category("cat-entertainment", "Entertainment", "movie"),
        category("cat-utilities", "Utilities", "bolt"),
        category("cat-housing", "Housing", "home"),
        category("cat-healthcare", "Healthcare", "local_hospital"),
        category("cat-shopping", "Shopping", "shopping_bag"),
        category("cat-subscriptions", "Subscriptions", "subscriptions"),
        category("cat-salary", "Salary", "payments", isIncome = true),
        category("cat-freelance", "Freelance", "work", isIncome = true),
        category("cat-investments", "Investment Returns", "trending_up", isIncome = true),
        category("cat-transfer", "Transfer", "swap_horiz"),
    )

    val categoryMap: Map<SyncId, Category> = categories.associateBy { it.id }

    // -- Accounts -------------------------------------------------------------

    val accounts = listOf(
        account("acc-checking", "Main Checking", AccountType.CHECKING, 524_73L),
        account("acc-savings", "Emergency Fund", AccountType.SAVINGS, 15_420_00L),
        account("acc-savings-2", "Vacation Fund", AccountType.SAVINGS, 3_250_00L),
        account("acc-credit", "Visa Rewards", AccountType.CREDIT_CARD, 1_847_32L),
        account("acc-credit-2", "Amex Blue", AccountType.CREDIT_CARD, 523_19L),
        account("acc-investment", "401(k)", AccountType.INVESTMENT, 87_650_00L),
        account("acc-investment-2", "Brokerage", AccountType.INVESTMENT, 12_340_00L),
        account("acc-cash", "Wallet", AccountType.CASH, 85_00L),
    )

    val accountMap: Map<SyncId, Account> = accounts.associateBy { it.id }

    // -- Budgets --------------------------------------------------------------

    val budgets = listOf(
        budget("bud-groceries", "cat-groceries", "Groceries", 60_000L, BudgetPeriod.MONTHLY),
        budget("bud-dining", "cat-dining", "Dining Out", 30_000L, BudgetPeriod.MONTHLY),
        budget("bud-transport", "cat-transport", "Transportation", 20_000L, BudgetPeriod.MONTHLY),
        budget("bud-entertainment", "cat-entertainment", "Entertainment", 15_000L, BudgetPeriod.MONTHLY),
        budget("bud-shopping", "cat-shopping", "Shopping", 25_000L, BudgetPeriod.MONTHLY),
        budget("bud-subscriptions", "cat-subscriptions", "Subscriptions", 8_000L, BudgetPeriod.MONTHLY),
    )

    // -- Transactions ---------------------------------------------------------

    val transactions: List<Transaction> = buildList {
        add(expense("txn-1", "Whole Foods Market", 8_743L, "cat-groceries", "acc-checking", today))
        add(expense("txn-2", "Starbucks", 5_85L, "cat-dining", "acc-credit", today))
        add(expense("txn-3", "Uber", 14_50L, "cat-transport", "acc-credit", today))

        val yesterday = today.minus(1, DateTimeUnit.DAY)
        add(expense("txn-4", "Target", 67_42L, "cat-shopping", "acc-credit", yesterday))
        add(expense("txn-5", "Netflix", 15_99L, "cat-subscriptions", "acc-checking", yesterday))
        add(expense("txn-6", "Chipotle", 12_35L, "cat-dining", "acc-credit", yesterday))

        val twoDaysAgo = today.minus(2, DateTimeUnit.DAY)
        add(expense("txn-7", "Shell Gas Station", 52_18L, "cat-transport", "acc-checking", twoDaysAgo))
        add(expense("txn-8", "Trader Joe's", 43_87L, "cat-groceries", "acc-checking", twoDaysAgo))
        add(income("txn-9", "Acme Corp", 3_250_00L, "cat-salary", "acc-checking", twoDaysAgo))

        val threeDaysAgo = today.minus(3, DateTimeUnit.DAY)
        add(expense("txn-10", "Amazon", 34_99L, "cat-shopping", "acc-credit", threeDaysAgo))
        add(expense("txn-11", "CVS Pharmacy", 28_45L, "cat-healthcare", "acc-checking", threeDaysAgo))

        val fourDaysAgo = today.minus(4, DateTimeUnit.DAY)
        add(expense("txn-12", "Electric Company", 142_30L, "cat-utilities", "acc-checking", fourDaysAgo))
        add(expense("txn-13", "AMC Theatres", 18_50L, "cat-entertainment", "acc-credit", fourDaysAgo))
        add(expense("txn-14", "Panera Bread", 11_24L, "cat-dining", "acc-credit", fourDaysAgo))

        val fiveDaysAgo = today.minus(5, DateTimeUnit.DAY)
        add(expense("txn-15", "Costco", 156_78L, "cat-groceries", "acc-checking", fiveDaysAgo))
        add(expense("txn-16", "Spotify", 10_99L, "cat-subscriptions", "acc-checking", fiveDaysAgo))

        val sixDaysAgo = today.minus(6, DateTimeUnit.DAY)
        add(expense("txn-17", "Lyft", 22_40L, "cat-transport", "acc-credit", sixDaysAgo))
        add(expense("txn-18", "Olive Garden", 45_62L, "cat-dining", "acc-credit", sixDaysAgo))

        val sevenDaysAgo = today.minus(7, DateTimeUnit.DAY)
        add(income("txn-19", "Freelance Project", 850_00L, "cat-freelance", "acc-checking", sevenDaysAgo))
        add(expense("txn-20", "Home Depot", 89_34L, "cat-housing", "acc-checking", sevenDaysAgo))

        val payees = listOf("Kroger", "Walmart", "Best Buy", "Macy's", "Subway",
            "Pizza Hut", "Walgreens", "GameStop", "Barnes Noble", "Apple Store",
            "Nike", "Zara", "H and M", "Gap", "Nordstrom")
        val amounts = listOf(42_15L, 78_93L, 249_99L, 89_00L, 8_75L,
            24_99L, 15_67L, 59_99L, 32_45L, 199_00L,
            120_00L, 55_80L, 39_99L, 28_50L, 67_00L)
        val cats = listOf("cat-groceries", "cat-shopping", "cat-shopping", "cat-shopping",
            "cat-dining", "cat-dining", "cat-healthcare", "cat-entertainment",
            "cat-entertainment", "cat-shopping", "cat-shopping", "cat-shopping",
            "cat-shopping", "cat-shopping", "cat-shopping")
        for (i in payees.indices) {
            add(expense("txn-old-${i + 1}", payees[i], amounts[i], cats[i],
                if (i % 2 == 0) "acc-checking" else "acc-credit",
                today.minus(8 + i, DateTimeUnit.DAY)))
        }
    }

    /** Payee history for autocomplete. */
    val payeeHistory: List<String> = transactions.mapNotNull { it.payee }.distinct().sorted()

    // -- Factory helpers ------------------------------------------------------

    private fun category(id: String, name: String, icon: String, isIncome: Boolean = false) =
        Category(id = SyncId(id), householdId = SyncId("household-1"), name = name, icon = icon,
            color = null, parentId = null, isIncome = isIncome, isSystem = false, sortOrder = 0,
            createdAt = now, updatedAt = now)

    private fun account(id: String, name: String, type: AccountType, balanceCents: Long) =
        Account(id = SyncId(id), householdId = SyncId("household-1"), name = name, type = type,
            currency = Currency.USD, currentBalance = Cents(balanceCents), isArchived = false,
            sortOrder = 0, icon = null, color = null, createdAt = now, updatedAt = now)

    private fun budget(id: String, categoryId: String, name: String, amountCents: Long, period: BudgetPeriod) =
        Budget(id = SyncId(id), householdId = SyncId("household-1"), categoryId = SyncId(categoryId),
            name = name, amount = Cents(amountCents), currency = Currency.USD, period = period,
            startDate = LocalDate(today.year, today.month, 1), isRollover = false,
            createdAt = now, updatedAt = now)

    private fun expense(id: String, payee: String, amountCents: Long, categoryId: String,
        accountId: String, date: LocalDate, note: String? = null) =
        Transaction(id = SyncId(id), householdId = SyncId("household-1"),
            accountId = SyncId(accountId), categoryId = SyncId(categoryId),
            type = TransactionType.EXPENSE, status = TransactionStatus.CLEARED,
            amount = Cents(-amountCents), currency = Currency.USD, payee = payee,
            note = note, date = date, createdAt = now, updatedAt = now)

    private fun income(id: String, payee: String, amountCents: Long, categoryId: String,
        accountId: String, date: LocalDate) =
        Transaction(id = SyncId(id), householdId = SyncId("household-1"),
            accountId = SyncId(accountId), categoryId = SyncId(categoryId),
            type = TransactionType.INCOME, status = TransactionStatus.CLEARED,
            amount = Cents(amountCents), currency = Currency.USD, payee = payee,
            note = null, date = date, createdAt = now, updatedAt = now)
}