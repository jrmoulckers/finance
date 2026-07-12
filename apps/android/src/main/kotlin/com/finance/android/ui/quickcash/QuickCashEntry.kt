// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickcash

import com.finance.android.ui.gig.ScheduleCPresets
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Category
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

/**
 * Deterministic, framework-free logic for the **true quick cash entry** flow (#2180).
 *
 * A cash-first user must be able to log a small expense in 1–2 taps: type an amount and
 * (optionally) pick a category/note, with the account defaulting to a cash wallet. All of
 * the rules that decide *what gets saved* live here as pure functions so they can be
 * exhaustively unit-tested on the JVM without Android, Compose, or Koin.
 *
 * Nothing in this file performs I/O or touches Android APIs — the ViewModel wires these
 * pure helpers to repositories and the Compose surface.
 */
object QuickCashEntry {

    /**
     * Upper sanity bound for a single quick cash entry: `$1,000,000.00`.
     *
     * Quick entry is meant for small, fast purchases. Anything above this is almost
     * certainly a typo (or grouping-separator confusion) and is rejected so the user
     * does not silently record a wildly wrong amount.
     */
    const val MAX_AMOUNT_CENTS: Long = 1_000_000_00L

    /** Maximum length of the optional note, mirroring the full transaction wizard. */
    const val MAX_NOTE_LENGTH: Int = 1000

    /** Tag applied to transactions created via quick cash entry, for later analytics. */
    const val QUICK_CASH_TAG = "quick-cash"

    /**
     * Parses free-form amount input into integer cents, deterministically.
     *
     * Designed for fast numpad entry, so a **single** separator is always treated as the
     * decimal point. This keeps the common case predictable and locale-tolerant for `es`
     * users who type a comma decimal (`12,50`):
     * - All characters except digits, `.` and `,` are stripped (currency symbols, spaces,
     *   letters).
     * - When **both** separators appear (e.g. a pasted, grouped number) the one that
     *   occurs **last** is the decimal separator and the other is treated as grouping and
     *   removed: `1.234,56` (es) and `1,234.56` (en) both parse to `123456`.
     * - When **one** separator appears it is the decimal separator: `12.999` → `1299`,
     *   `1234,56` → `123456`.
     * - The fractional part is truncated to two digits.
     *
     * Overflowing or empty/garbage input yields a value that fails [validate]
     * (`0` for empty, [Long.MAX_VALUE] for overflow), so the UI can surface a clear error
     * rather than crashing or silently wrapping.
     *
     * @param raw the user-entered text.
     * @return the amount as a non-negative number of cents.
     */
    fun parseAmountToCents(raw: String): Long {
        val filtered = raw.filter { it.isDigit() || it == '.' || it == ',' }
        if (filtered.isEmpty()) return 0L

        val hasDot = filtered.contains('.')
        val hasComma = filtered.contains(',')

        val normalized: String = when {
            hasDot && hasComma -> {
                val decimalSep = if (filtered.lastIndexOf('.') > filtered.lastIndexOf(',')) '.' else ','
                val grouping = if (decimalSep == '.') ',' else '.'
                filtered.replace(grouping.toString(), "").replace(decimalSep, '.')
            }

            // A single comma is the decimal separator (es-style input).
            hasComma -> filtered.replace(',', '.')

            // A single (or no) dot is already the decimal separator.
            else -> filtered
        }

        val dotParts = normalized.split('.')
        val wholeStr: String
        val fracStr: String
        if (dotParts.size == 1) {
            wholeStr = dotParts[0]
            fracStr = "00"
        } else {
            wholeStr = dotParts.dropLast(1).joinToString("")
            fracStr = dotParts.last().take(2).padEnd(2, '0')
        }

        val whole = wholeStr.ifEmpty { "0" }.toLongOrNull()
        val frac = fracStr.ifEmpty { "0" }.toLongOrNull() ?: 0L
        // Clamp overflow to MAX (so validation rejects it) instead of throwing.
        return when {
            whole == null -> Long.MAX_VALUE
            whole > (Long.MAX_VALUE - frac) / 100L -> Long.MAX_VALUE
            else -> whole * 100L + frac
        }
    }

    /**
     * Picks the cash wallet that a quick entry should default to.
     *
     * Preference order: the user's explicitly chosen [preferredAccountId] (if it still
     * exists and is usable) → the lowest-sorted [AccountType.CASH] account → the
     * lowest-sorted remaining account. Archived and deleted accounts are never chosen.
     *
     * @return the default account, or `null` when the household has no usable account.
     */
    fun selectDefaultCashAccount(
        accounts: List<Account>,
        preferredAccountId: SyncId? = null,
    ): Account? {
        val usable = accounts.filter { it.deletedAt == null && !it.isArchived }
        preferredAccountId?.let { pid ->
            usable.find { it.id == pid }?.let { return it }
        }
        return usable.filter { it.type == AccountType.CASH }.minByOrNull { it.sortOrder }
            ?: usable.minByOrNull { it.sortOrder }
    }

    /**
     * Picks the expense category a quick entry should default to. Income categories are
     * excluded because quick cash entry only records expenses. Category is optional, so
     * this may legitimately return `null`.
     *
     * Preference order: the user's [preferredCategoryId] (if still valid) → the
     * lowest-sorted expense category.
     */
    fun selectDefaultCategory(
        categories: List<Category>,
        preferredCategoryId: SyncId? = null,
    ): Category? {
        val usable = categories.filter { it.deletedAt == null && !it.isIncome }
        preferredCategoryId?.let { pid ->
            usable.find { it.id == pid }?.let { return it }
        }
        return usable.minByOrNull { it.sortOrder }
    }

    /**
     * Validates a [QuickCashDraft], returning every failed rule (empty when valid).
     * Returning a list keeps validation deterministic and lets the UI show all problems
     * at once rather than one-at-a-time.
     */
    fun validate(draft: QuickCashDraft): List<QuickCashError> = buildList {
        if (draft.amountCents <= 0L) add(QuickCashError.INVALID_AMOUNT)
        if (draft.amountCents > MAX_AMOUNT_CENTS) add(QuickCashError.AMOUNT_TOO_LARGE)
        if (draft.accountId == null) add(QuickCashError.NO_ACCOUNT)
        if (draft.note.length > MAX_NOTE_LENGTH) add(QuickCashError.NOTE_TOO_LONG)
    }

    /**
     * Builds the [Transaction] to persist from a *validated* [draft]. Quick cash entries
     * are always cleared expenses, so the amount is stored as negative cents and the
     * payee is left null (cash purchases rarely have a meaningful payee).
     *
     * @throws IllegalArgumentException if [draft] is not valid — callers must call
     *   [validate] first.
     */
    fun buildTransaction(
        draft: QuickCashDraft,
        householdId: SyncId,
        date: LocalDate,
        now: Instant,
        idSuffix: Long = now.toEpochMilliseconds(),
    ): Transaction {
        require(validate(draft).isEmpty()) { "Cannot build a transaction from an invalid draft" }
        val accountId = requireNotNull(draft.accountId) { "Account is required" }
        val extraTags =
            if (draft.scheduleCPresetKey != null) listOf(ScheduleCPresets.SCHEDULE_C_TAG) else emptyList()
        return Transaction(
            id = SyncId("txn-cash-$idSuffix"),
            householdId = householdId,
            ownerId = householdId,
            accountId = accountId,
            categoryId = draft.categoryId,
            type = TransactionType.EXPENSE,
            status = TransactionStatus.CLEARED,
            amount = Cents(-draft.amountCents),
            currency = draft.currency,
            payee = null,
            note = draft.note.trim().ifBlank { null },
            date = date,
            tags = listOf(QUICK_CASH_TAG) + extraTags,
            createdAt = now,
            updatedAt = now,
            isSynced = false,
        )
    }
}

/**
 * Immutable snapshot of everything needed to persist a quick cash expense.
 *
 * @property amountCents amount in positive cents (sign is applied at build time).
 * @property note optional free-form note.
 * @property categoryId optional expense category.
 * @property accountId the cash wallet/account to record against; `null` is invalid.
 * @property currency the account currency (defaults to USD).
 * @property scheduleCPresetKey optional [ScheduleCPresets] key; when set the built
 *   transaction is tagged for Schedule C export (#2141).
 */
data class QuickCashDraft(
    val amountCents: Long = 0L,
    val note: String = "",
    val categoryId: SyncId? = null,
    val accountId: SyncId? = null,
    val currency: Currency = Currency.USD,
    val scheduleCPresetKey: String? = null,
)

/** Deterministic validation failures for a [QuickCashDraft]. */
enum class QuickCashError {
    /** Amount is zero or unparseable. */
    INVALID_AMOUNT,

    /** Amount exceeds [QuickCashEntry.MAX_AMOUNT_CENTS]. */
    AMOUNT_TOO_LARGE,

    /** No cash account is available/selected to record against. */
    NO_ACCOUNT,

    /** Note exceeds [QuickCashEntry.MAX_NOTE_LENGTH]. */
    NOTE_TOO_LONG,
}
