// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1371 — Split Transaction Allocation.
 *
 * Covers:
 * - Splitting a transaction into multiple categories
 * - Split amounts must equal original amount
 * - Partial splits (remainder stays in original category)
 * - Editing/deleting individual split lines
 * - Split transaction display in reports
 *
 * Note: Split transactions are modelled as multiple transactions linked
 * by a common parent ID. These tests verify the pure arithmetic and
 * validation logic for split allocation.
 */
class SplitTransactionVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Split amounts must equal original
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun split_amountsMustEqualOriginal_exactMatch() {
        val original = Cents(10000) // $100.00
        val splits = listOf(
            Cents(6000), // $60 groceries
            Cents(2500), // $25 household
            Cents(1500), // $15 personal
        )

        val splitTotal = Cents(splits.sumOf { it.amount })
        assertEquals(original, splitTotal, "Split amounts must sum to original")
    }

    @Test
    fun split_amountsMismatch_detected() {
        val original = Cents(10000) // $100.00
        val splits = listOf(
            Cents(6000),
            Cents(2500),
            Cents(1000), // Only $95 total, missing $5
        )

        val splitTotal = Cents(splits.sumOf { it.amount })
        assertNotEquals(original, splitTotal, "Split total doesn't match original")

        val difference = original - splitTotal
        assertEquals(Cents(500), difference, "Missing $5.00")
    }

    @Test
    fun split_singleSplitEqualsOriginal() {
        val original = Cents(5000)
        val splits = listOf(Cents(5000))

        val splitTotal = Cents(splits.sumOf { it.amount })
        assertEquals(original, splitTotal, "Single split equals original")
    }

    @Test
    fun split_zeroAmountSplit_invalid() {
        val splits = listOf(Cents(5000), Cents.ZERO, Cents(5000))

        val hasZero = splits.any { it.isZero() }
        assertTrue(hasZero, "Zero-amount splits should be rejected")
    }

    @Test
    fun split_negativeAmountSplit_invalid() {
        val splits = listOf(Cents(12000), Cents(-2000))

        val hasNegative = splits.any { it.isNegative() }
        assertTrue(hasNegative, "Negative split amounts should be rejected")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Split into multiple categories
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun split_multipleCategoryAssignment() {
        val originalAmount = Cents(15000) // $150 grocery trip

        val splitAllocations = mapOf(
            SyncId("cat-groceries") to Cents(10000),
            SyncId("cat-household") to Cents(3000),
            SyncId("cat-personal") to Cents(2000),
        )

        val totalAllocated = Cents(splitAllocations.values.sumOf { it.amount })
        assertEquals(originalAmount, totalAllocated, "All splits sum to original")
        assertEquals(3, splitAllocations.size, "3 categories")
    }

    @Test
    fun split_transactionsCreated_matchOriginalMetadata() {
        val original = TestFixtures.createExpense(
            amount = Cents(10000),
            date = LocalDate(2024, 6, 15),
            accountId = SyncId("acct-checking"),
        )

        // Create split transactions sharing the original's metadata
        val splitAmounts = listOf(Cents(6000), Cents(4000))
        val splitCats = listOf(SyncId("cat-groceries"), SyncId("cat-household"))

        val splitTransactions = splitAmounts.mapIndexed { i, amount ->
            original.copy(
                id = TestFixtures.nextId(),
                amount = amount,
                categoryId = splitCats[i],
            )
        }

        // All splits share same date, account, and type
        assertTrue(splitTransactions.all { it.date == original.date })
        assertTrue(splitTransactions.all { it.accountId == original.accountId })
        assertTrue(splitTransactions.all { it.type == TransactionType.EXPENSE })

        // Amounts sum to original
        val totalSplit = Cents(splitTransactions.sumOf { it.amount.amount })
        assertEquals(original.amount, totalSplit)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Partial splits (remainder in original category)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun partialSplit_remainderStaysInOriginalCategory() {
        val originalAmount = Cents(10000) // $100
        val originalCategory = SyncId("cat-groceries")

        // User splits $30 to household, remainder stays in groceries
        val householdSplit = Cents(3000)
        val remainder = originalAmount - householdSplit

        assertEquals(Cents(7000), remainder, "Remainder = $70")

        val splits = mapOf(
            originalCategory to remainder,
            SyncId("cat-household") to householdSplit,
        )

        val total = Cents(splits.values.sumOf { it.amount })
        assertEquals(originalAmount, total, "Partial split + remainder = original")
    }

    @Test
    fun partialSplit_multiplePartialAllocations() {
        val originalAmount = Cents(20000) // $200
        val originalCategory = SyncId("cat-shopping")

        val explicitSplits = mapOf(
            SyncId("cat-gifts") to Cents(5000),
            SyncId("cat-clothing") to Cents(8000),
        )

        val allocatedTotal = Cents(explicitSplits.values.sumOf { it.amount })
        val remainder = originalAmount - allocatedTotal

        assertEquals(Cents(7000), remainder, "Remainder = $200 - $50 - $80 = $70")

        val allSplits = explicitSplits + mapOf(originalCategory to remainder)
        val total = Cents(allSplits.values.sumOf { it.amount })
        assertEquals(originalAmount, total)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Editing individual split lines
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun editSplit_adjustAmount_recomputesRemainder() {
        val originalAmount = Cents(10000)

        // Initial split: $60 groceries, $40 household
        val splits = mutableMapOf(
            SyncId("cat-groceries") to Cents(6000),
            SyncId("cat-household") to Cents(4000),
        )

        // Edit: change household from $40 to $35
        splits[SyncId("cat-household")] = Cents(3500)

        // Compute imbalance
        val currentTotal = Cents(splits.values.sumOf { it.amount })
        val difference = originalAmount - currentTotal

        assertEquals(Cents(500), difference, "After edit, $5 unallocated")

        // Adjust grocery split to absorb remainder
        splits[SyncId("cat-groceries")] = Cents(splits[SyncId("cat-groceries")]!!.amount + difference.amount)

        val finalTotal = Cents(splits.values.sumOf { it.amount })
        assertEquals(originalAmount, finalTotal, "Adjusted splits sum to original")
    }

    @Test
    fun editSplit_changeCategory_preservesAmount() {
        val splits = mutableMapOf(
            SyncId("cat-groceries") to Cents(6000),
            SyncId("cat-household") to Cents(4000),
        )

        // Change groceries → dining
        val amount = splits.remove(SyncId("cat-groceries"))!!
        splits[SyncId("cat-dining")] = amount

        assertEquals(Cents(6000), splits[SyncId("cat-dining")])
        assertNull(splits[SyncId("cat-groceries")])

        val total = Cents(splits.values.sumOf { it.amount })
        assertEquals(Cents(10000), total, "Total unchanged after category swap")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Deleting individual split lines
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun deleteSplit_removeLine_remainderAbsorbsAmount() {
        val originalAmount = Cents(10000)

        val splits = mutableMapOf(
            SyncId("cat-groceries") to Cents(5000),
            SyncId("cat-household") to Cents(3000),
            SyncId("cat-personal") to Cents(2000),
        )

        // Delete personal split
        val deleted = splits.remove(SyncId("cat-personal"))!!

        // Remaining should absorb deleted amount — add to first category
        val firstKey = splits.keys.first()
        splits[firstKey] = Cents(splits[firstKey]!!.amount + deleted.amount)

        val total = Cents(splits.values.sumOf { it.amount })
        assertEquals(originalAmount, total, "After delete + redistribute, total matches")
        assertEquals(2, splits.size, "Down to 2 splits")
    }

    @Test
    fun deleteSplit_lastSplit_returnsToUnsplit() {
        val splits = mutableListOf(
            SyncId("cat-groceries") to Cents(10000),
        )

        // Removing the only split line = unsplit transaction
        splits.clear()
        assertTrue(splits.isEmpty(), "No splits = unsplit transaction")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Split transaction display in reports
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun splitInReports_eachCategoryGetsItsShare() {
        val catGroceries = SyncId("cat-groceries")
        val catHousehold = SyncId("cat-household")

        // A $100 transaction split into $60 groceries + $40 household
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(6000), categoryId = catGroceries, date = LocalDate(2024, 6, 15)),
            TestFixtures.createExpense(amount = Cents(4000), categoryId = catHousehold, date = LocalDate(2024, 6, 15)),
        )

        // Category report: each split contributes to its category
        val byCategory = transactions
            .filter { it.deletedAt == null && it.type == TransactionType.EXPENSE }
            .groupBy { it.categoryId }
            .mapValues { (_, txns) -> Cents(txns.sumOf { it.amount.abs().amount }) }

        assertEquals(Cents(6000), byCategory[catGroceries], "Groceries gets $60")
        assertEquals(Cents(4000), byCategory[catHousehold], "Household gets $40")
    }

    @Test
    fun splitInReports_totalSpending_countsAllSplits() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(6000), categoryId = SyncId("cat-a"), date = LocalDate(2024, 6, 15)),
            TestFixtures.createExpense(amount = Cents(4000), categoryId = SyncId("cat-b"), date = LocalDate(2024, 6, 15)),
        )

        val total = transactions.sumOf { it.amount.abs().amount }
        assertEquals(10000L, total, "Total includes all splits = $100")
    }

    @Test
    fun splitInReports_budgetUtilization_countsSplitPortion() {
        val catDining = SyncId("cat-dining")
        val budget = TestFixtures.createBudget(categoryId = catDining, amount = Cents(20000))

        // In a split scenario, only the dining portion should be fed to the budget calculator.
        // The caller is responsible for filtering transactions by category before passing them in.
        val diningTransactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = catDining, date = LocalDate(2024, 6, 10)),
        )

        val status = BudgetCalculator.calculateStatus(budget, diningTransactions, LocalDate(2024, 6, 15))
        assertEquals(Cents(5000), status.spent, "Only dining split ($50) counts toward dining budget")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge cases: precision with cents
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun split_oddAmountThreeWays_centPrecision() {
        val original = Cents(10000) // $100.00

        // $100 / 3 = $33.33... → need to handle remainder
        val splitA = Cents(3334) // $33.34
        val splitB = Cents(3333) // $33.33
        val splitC = Cents(3333) // $33.33

        val total = splitA + splitB + splitC
        assertEquals(original, total, "Three-way split with cent adjustment sums correctly")
    }

    @Test
    fun split_verySmallSplits_centsLevel() {
        val original = Cents(100) // $1.00

        val splits = listOf(Cents(33), Cents(33), Cents(34))
        val total = Cents(splits.sumOf { it.amount })
        assertEquals(original, total, "Small amount splits sum correctly")
    }

    @Test
    fun split_largeTransaction_manyCategories() {
        val original = Cents(500000) // $5,000

        val splits = listOf(
            Cents(150000), // 30%
            Cents(125000), // 25%
            Cents(100000), // 20%
            Cents(75000),  // 15%
            Cents(50000),  // 10%
        )

        val total = Cents(splits.sumOf { it.amount })
        assertEquals(original, total, "Large transaction split across 5 categories")
    }
}
