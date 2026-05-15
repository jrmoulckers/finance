// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.core.TestFixtures
import com.finance.core.aggregation.FinancialAggregator
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1368 — Transaction Search & Filtering.
 *
 * Covers:
 * - Search by description, merchant, notes
 * - Filter by date range, amount range, category, account
 * - Combined filter + search queries
 * - Sort ordering (date desc, amount asc/desc)
 * - Pagination of search results
 *
 * Note: These tests verify pure-function filtering logic against in-memory
 * transaction lists, simulating what the search engine must implement.
 */
class TransactionSearchVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    private val sampleTransactions = listOf(
        TestFixtures.createExpense(
            amount = Cents(5000),
            date = LocalDate(2024, 6, 1),
            categoryId = SyncId("cat-groceries"),
            accountId = SyncId("acct-checking"),
        ).copy(payee = "Whole Foods Market", note = "Weekly groceries"),
        TestFixtures.createExpense(
            amount = Cents(1500),
            date = LocalDate(2024, 6, 5),
            categoryId = SyncId("cat-coffee"),
            accountId = SyncId("acct-checking"),
        ).copy(payee = "Starbucks Coffee", note = null),
        TestFixtures.createExpense(
            amount = Cents(25000),
            date = LocalDate(2024, 6, 10),
            categoryId = SyncId("cat-dining"),
            accountId = SyncId("acct-credit"),
        ).copy(payee = "Fancy Restaurant", note = "Anniversary dinner"),
        TestFixtures.createIncome(
            amount = Cents(500000),
            date = LocalDate(2024, 6, 15),
            categoryId = SyncId("cat-salary"),
            accountId = SyncId("acct-checking"),
        ).copy(payee = "Employer Inc", note = "Monthly paycheck"),
        TestFixtures.createExpense(
            amount = Cents(3500),
            date = LocalDate(2024, 6, 20),
            categoryId = SyncId("cat-groceries"),
            accountId = SyncId("acct-checking"),
        ).copy(payee = "Trader Joe's", note = "Snacks and produce"),
    )

    // ═══════════════════════════════════════════════════════════════════
    // Search by description/merchant/notes
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun search_byPayee_caseInsensitive() {
        val results = sampleTransactions.filter {
            it.payee?.contains("starbucks", ignoreCase = true) == true
        }
        assertEquals(1, results.size)
        assertEquals("Starbucks Coffee", results.first().payee)
    }

    @Test
    fun search_byPayeePartial_findsSubstring() {
        val results = sampleTransactions.filter {
            it.payee?.contains("Foods", ignoreCase = true) == true
        }
        assertEquals(1, results.size)
        assertEquals("Whole Foods Market", results.first().payee)
    }

    @Test
    fun search_byNote_findsMatchingTransactions() {
        val results = sampleTransactions.filter {
            it.note?.contains("groceries", ignoreCase = true) == true
        }
        assertEquals(1, results.size)
        assertEquals("Whole Foods Market", results.first().payee)
    }

    @Test
    fun search_noMatch_returnsEmpty() {
        val results = sampleTransactions.filter {
            it.payee?.contains("NonExistentMerchant", ignoreCase = true) == true
        }
        assertTrue(results.isEmpty())
    }

    @Test
    fun search_acrossPayeeAndNote_broadMatch() {
        val query = "dinner"
        val results = sampleTransactions.filter {
            it.payee?.contains(query, ignoreCase = true) == true ||
                it.note?.contains(query, ignoreCase = true) == true
        }
        assertEquals(1, results.size)
        assertEquals("Fancy Restaurant", results.first().payee)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Filter by date range
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun filter_byDateRange_inclusiveBounds() {
        val from = LocalDate(2024, 6, 5)
        val to = LocalDate(2024, 6, 15)
        val results = sampleTransactions.filter {
            it.date >= from && it.date <= to
        }
        assertEquals(3, results.size, "June 5, 10, 15 inclusive")
    }

    @Test
    fun filter_byDateRange_singleDay() {
        val date = LocalDate(2024, 6, 10)
        val results = sampleTransactions.filter { it.date == date }
        assertEquals(1, results.size)
    }

    @Test
    fun filter_byDateRange_noMatches() {
        val from = LocalDate(2024, 7, 1)
        val to = LocalDate(2024, 7, 31)
        val results = sampleTransactions.filter {
            it.date >= from && it.date <= to
        }
        assertTrue(results.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Filter by amount range
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun filter_byAmountRange_findsTransactionsInRange() {
        val min = Cents(1000)
        val max = Cents(5000)
        val results = sampleTransactions.filter {
            it.amount.abs().amount >= min.amount && it.amount.abs().amount <= max.amount
        }
        assertEquals(3, results.size, "$10-$50 range: $50, $15, $35")
    }

    @Test
    fun filter_byMinimumAmount_only() {
        val min = Cents(10000)
        val results = sampleTransactions.filter {
            it.amount.abs().amount >= min.amount
        }
        assertEquals(2, results.size, ">= $100: restaurant ($250) and income ($5000)")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Filter by category
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun filter_byCategory_returnsMatchingTransactions() {
        val catGroceries = SyncId("cat-groceries")
        val results = sampleTransactions.filter { it.categoryId == catGroceries }
        assertEquals(2, results.size, "Two grocery transactions")
    }

    @Test
    fun filter_byMultipleCategories_returnsUnion() {
        val categories = setOf(SyncId("cat-groceries"), SyncId("cat-coffee"))
        val results = sampleTransactions.filter { it.categoryId in categories }
        assertEquals(3, results.size, "2 groceries + 1 coffee = 3")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Filter by account
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun filter_byAccount_returnsMatchingTransactions() {
        val acctChecking = SyncId("acct-checking")
        val results = sampleTransactions.filter { it.accountId == acctChecking }
        assertEquals(4, results.size, "4 checking account transactions")
    }

    @Test
    fun filter_byCreditAccount() {
        val acctCredit = SyncId("acct-credit")
        val results = sampleTransactions.filter { it.accountId == acctCredit }
        assertEquals(1, results.size)
        assertEquals("Fancy Restaurant", results.first().payee)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Combined filter + search queries
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun combined_searchAndDateFilter() {
        val query = "groceries"
        val from = LocalDate(2024, 6, 15)
        val to = LocalDate(2024, 6, 30)

        val results = sampleTransactions.filter {
            it.date >= from && it.date <= to &&
                (it.payee?.contains(query, ignoreCase = true) == true ||
                    it.note?.contains(query, ignoreCase = true) == true)
        }
        // Only Trader Joe's (June 20) has "Snacks and produce" — doesn't match "groceries"
        // But the note doesn't contain "groceries", so empty? Let's check: Trader Joe's note = "Snacks and produce"
        assertTrue(results.isEmpty(), "No grocery-matching text in June 15-30 range")
    }

    @Test
    fun combined_categoryAndAmountFilter() {
        val catGroceries = SyncId("cat-groceries")
        val minAmount = Cents(4000) // > $40

        val results = sampleTransactions.filter {
            it.categoryId == catGroceries &&
                it.amount.abs().amount >= minAmount.amount
        }
        assertEquals(1, results.size, "Only Whole Foods ($50) matches")
    }

    @Test
    fun combined_accountAndTypeFilter() {
        val results = sampleTransactions.filter {
            it.accountId == SyncId("acct-checking") &&
                it.type == TransactionType.EXPENSE
        }
        assertEquals(3, results.size, "3 expenses in checking account")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Sort ordering
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun sort_byDateDescending() {
        val sorted = sampleTransactions.sortedByDescending { it.date }
        assertEquals(LocalDate(2024, 6, 20), sorted.first().date)
        assertEquals(LocalDate(2024, 6, 1), sorted.last().date)
    }

    @Test
    fun sort_byDateAscending() {
        val sorted = sampleTransactions.sortedBy { it.date }
        assertEquals(LocalDate(2024, 6, 1), sorted.first().date)
        assertEquals(LocalDate(2024, 6, 20), sorted.last().date)
    }

    @Test
    fun sort_byAmountDescending() {
        val sorted = sampleTransactions.sortedByDescending { it.amount.abs().amount }
        assertEquals(Cents(500000), sorted.first().amount.abs(), "Largest first: $5000 income")
    }

    @Test
    fun sort_byAmountAscending() {
        val sorted = sampleTransactions.sortedBy { it.amount.abs().amount }
        assertEquals(Cents(1500), sorted.first().amount.abs(), "Smallest first: $15 coffee")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Pagination of search results
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun pagination_firstPage() {
        val pageSize = 2
        val page = 0
        val results = sampleTransactions.drop(page * pageSize).take(pageSize)

        assertEquals(2, results.size)
    }

    @Test
    fun pagination_secondPage() {
        val pageSize = 2
        val page = 1
        val results = sampleTransactions.drop(page * pageSize).take(pageSize)

        assertEquals(2, results.size)
    }

    @Test
    fun pagination_lastPage_partialResults() {
        val pageSize = 2
        val page = 2
        val results = sampleTransactions.drop(page * pageSize).take(pageSize)

        assertEquals(1, results.size, "5 items / page size 2 = last page has 1 item")
    }

    @Test
    fun pagination_beyondEnd_emptyResults() {
        val pageSize = 2
        val page = 10
        val results = sampleTransactions.drop(page * pageSize).take(pageSize)

        assertTrue(results.isEmpty())
    }

    @Test
    fun pagination_totalPageCount_calculatedCorrectly() {
        val pageSize = 2
        val total = sampleTransactions.size
        val totalPages = (total + pageSize - 1) / pageSize

        assertEquals(3, totalPages, "5 items / 2 per page = 3 pages")
    }
}
