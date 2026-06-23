// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickcash

import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Category
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [QuickCashEntry] — the deterministic logic behind true quick cash entry (#2180).
 *
 * Covers locale-tolerant amount parsing, cash-first default account selection, optional
 * expense category defaulting, validation rules, and transaction building.
 */
class QuickCashEntryTest {

    private val now = Clock.System.now()
    private val householdId = SyncId("household-1")
    private val date = LocalDate(2026, 6, 23)

    private fun account(
        id: String,
        name: String,
        type: AccountType = AccountType.CHECKING,
        sortOrder: Int = 0,
        archived: Boolean = false,
    ) = Account(
        id = SyncId(id),
        householdId = householdId,
        ownerId = householdId,
        name = name,
        type = type,
        currency = Currency.USD,
        currentBalance = Cents(0L),
        isArchived = archived,
        sortOrder = sortOrder,
        createdAt = now,
        updatedAt = now,
    )

    private fun category(
        id: String,
        name: String,
        isIncome: Boolean = false,
        sortOrder: Int = 0,
    ) = Category(
        id = SyncId(id),
        householdId = householdId,
        ownerId = householdId,
        name = name,
        isIncome = isIncome,
        sortOrder = sortOrder,
        createdAt = now,
        updatedAt = now,
    )

    // ── Amount parsing ──────────────────────────────────────────────────

    @Test
    fun `parses whole dollars`() {
        assertEquals(500L, QuickCashEntry.parseAmountToCents("5"))
        assertEquals(10_000L, QuickCashEntry.parseAmountToCents("100"))
    }

    @Test
    fun `parses dollars and cents`() {
        assertEquals(1250L, QuickCashEntry.parseAmountToCents("12.50"))
        assertEquals(99L, QuickCashEntry.parseAmountToCents("0.99"))
    }

    @Test
    fun `truncates fractional digits beyond two`() {
        assertEquals(1299L, QuickCashEntry.parseAmountToCents("12.999"))
    }

    @Test
    fun `strips currency symbols and whitespace`() {
        assertEquals(1250L, QuickCashEntry.parseAmountToCents("$ 12.50"))
        assertEquals(1250L, QuickCashEntry.parseAmountToCents("12.50 USD"))
    }

    @Test
    fun `parses spanish-style comma decimal`() {
        assertEquals(123456L, QuickCashEntry.parseAmountToCents("1234,56"))
    }

    @Test
    fun `parses spanish-style grouping with comma decimal`() {
        // es: 1.234,56 -> 1234.56
        assertEquals(123456L, QuickCashEntry.parseAmountToCents("1.234,56"))
    }

    @Test
    fun `parses english-style grouping with dot decimal`() {
        // en: 1,234.56 -> 1234.56
        assertEquals(123456L, QuickCashEntry.parseAmountToCents("1,234.56"))
    }

    @Test
    fun `treats single dot as decimal separator`() {
        // 1.234 -> 1.23 (truncated to two fractional digits)
        assertEquals(123L, QuickCashEntry.parseAmountToCents("1.234"))
    }

    @Test
    fun `treats single comma as decimal separator`() {
        // 1,000 (es decimal) -> 1.00
        assertEquals(100L, QuickCashEntry.parseAmountToCents("1,000"))
    }

    @Test
    fun `empty or garbage input parses to zero`() {
        assertEquals(0L, QuickCashEntry.parseAmountToCents(""))
        assertEquals(0L, QuickCashEntry.parseAmountToCents("abc"))
    }

    @Test
    fun `overflowing input clamps to max long so validation rejects it`() {
        val parsed = QuickCashEntry.parseAmountToCents("999999999999999999999")
        assertEquals(Long.MAX_VALUE, parsed)
        assertTrue(
            QuickCashError.AMOUNT_TOO_LARGE in
                QuickCashEntry.validate(QuickCashDraft(amountCents = parsed, accountId = SyncId("a"))),
        )
    }

    // ── Default account selection ───────────────────────────────────────

    @Test
    fun `prefers cash account when present`() {
        val accounts = listOf(
            account("acc-checking", "Checking", AccountType.CHECKING, sortOrder = 0),
            account("acc-cash", "Wallet", AccountType.CASH, sortOrder = 5),
        )
        assertEquals(SyncId("acc-cash"), QuickCashEntry.selectDefaultCashAccount(accounts)?.id)
    }

    @Test
    fun `falls back to lowest sorted account when no cash account`() {
        val accounts = listOf(
            account("acc-b", "B", AccountType.CHECKING, sortOrder = 2),
            account("acc-a", "A", AccountType.SAVINGS, sortOrder = 1),
        )
        assertEquals(SyncId("acc-a"), QuickCashEntry.selectDefaultCashAccount(accounts)?.id)
    }

    @Test
    fun `honors a valid preferred account over the cash default`() {
        val accounts = listOf(
            account("acc-cash", "Wallet", AccountType.CASH),
            account("acc-checking", "Checking", AccountType.CHECKING),
        )
        assertEquals(
            SyncId("acc-checking"),
            QuickCashEntry.selectDefaultCashAccount(accounts, SyncId("acc-checking"))?.id,
        )
    }

    @Test
    fun `ignores archived accounts`() {
        val accounts = listOf(
            account("acc-cash", "Old Wallet", AccountType.CASH, archived = true),
            account("acc-checking", "Checking", AccountType.CHECKING),
        )
        assertEquals(SyncId("acc-checking"), QuickCashEntry.selectDefaultCashAccount(accounts)?.id)
    }

    @Test
    fun `returns null when there are no usable accounts`() {
        assertNull(QuickCashEntry.selectDefaultCashAccount(emptyList()))
    }

    // ── Default category selection ──────────────────────────────────────

    @Test
    fun `default category excludes income categories`() {
        val categories = listOf(
            category("cat-salary", "Salary", isIncome = true, sortOrder = 0),
            category("cat-food", "Food", isIncome = false, sortOrder = 1),
        )
        assertEquals(SyncId("cat-food"), QuickCashEntry.selectDefaultCategory(categories)?.id)
    }

    @Test
    fun `default category can be null when none exist`() {
        assertNull(QuickCashEntry.selectDefaultCategory(emptyList()))
    }

    // ── Validation ──────────────────────────────────────────────────────

    @Test
    fun `valid draft has no errors`() {
        val draft = QuickCashDraft(amountCents = 1250L, accountId = SyncId("acc-cash"))
        assertTrue(QuickCashEntry.validate(draft).isEmpty())
    }

    @Test
    fun `zero amount is invalid`() {
        val draft = QuickCashDraft(amountCents = 0L, accountId = SyncId("acc-cash"))
        assertTrue(QuickCashError.INVALID_AMOUNT in QuickCashEntry.validate(draft))
    }

    @Test
    fun `missing account is invalid`() {
        val draft = QuickCashDraft(amountCents = 1250L, accountId = null)
        assertTrue(QuickCashError.NO_ACCOUNT in QuickCashEntry.validate(draft))
    }

    @Test
    fun `over-long note is invalid`() {
        val draft = QuickCashDraft(
            amountCents = 1250L,
            accountId = SyncId("acc-cash"),
            note = "x".repeat(QuickCashEntry.MAX_NOTE_LENGTH + 1),
        )
        assertTrue(QuickCashError.NOTE_TOO_LONG in QuickCashEntry.validate(draft))
    }

    // ── Transaction building ────────────────────────────────────────────

    @Test
    fun `builds a cleared negative expense tagged as quick cash`() {
        val draft = QuickCashDraft(
            amountCents = 1250L,
            accountId = SyncId("acc-cash"),
            categoryId = SyncId("cat-food"),
            note = "  Coffee  ",
        )
        val txn = QuickCashEntry.buildTransaction(draft, householdId, date, now, idSuffix = 42L)

        assertEquals(SyncId("txn-cash-42"), txn.id)
        assertEquals(TransactionType.EXPENSE, txn.type)
        assertEquals(Cents(-1250L), txn.amount)
        assertEquals(SyncId("acc-cash"), txn.accountId)
        assertEquals(SyncId("cat-food"), txn.categoryId)
        assertEquals("Coffee", txn.note)
        assertNull(txn.payee)
        assertEquals(date, txn.date)
        assertTrue(QuickCashEntry.QUICK_CASH_TAG in txn.tags)
    }

    @Test
    fun `blank note becomes null`() {
        val draft = QuickCashDraft(amountCents = 500L, accountId = SyncId("acc-cash"), note = "   ")
        val txn = QuickCashEntry.buildTransaction(draft, householdId, date, now)
        assertNull(txn.note)
    }

    @Test
    fun `building from an invalid draft throws`() {
        val invalid = QuickCashDraft(amountCents = 0L, accountId = null)
        assertFailsWith<IllegalArgumentException> {
            QuickCashEntry.buildTransaction(invalid, householdId, date, now)
        }
    }
}
