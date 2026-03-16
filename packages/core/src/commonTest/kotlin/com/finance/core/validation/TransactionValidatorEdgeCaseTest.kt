// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.validation

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Edge case tests for [TransactionValidator] covering boundary dates,
 * empty lookup sets, and multi-error combinations.
 */
class TransactionValidatorEdgeCaseTest {

    private val existingAccounts = setOf(SyncId("account-1"), SyncId("account-2"))
    private val existingCategories = setOf(SyncId("category-1"), SyncId("category-2"))

    // ═══════════════════════════════════════════════════════════════════
    // Date boundary — exactly one year from now
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_dateExactlyOneYearFromNow_noError() {
        val oneYearFromNow = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
            .plus(1, DateTimeUnit.YEAR)
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            date = oneYearFromNow,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.DateTooFarInFuture })
    }

    @Test
    fun validate_dateOneDayOverOneYear_hasError() {
        val overOneYear = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
            .plus(1, DateTimeUnit.YEAR)
            .plus(1, DateTimeUnit.DAY)
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            date = overOneYear,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.DateTooFarInFuture })
    }

    @Test
    fun validate_todaysDate_noError() {
        val today = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            date = today,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.DateTooFarInFuture })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Empty account/category lookup sets
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_emptyAccountSet_accountNotFound() {
        val txn = TestFixtures.createExpense(accountId = SyncId("account-1"))
        val errors = TransactionValidator.validate(txn, emptySet(), existingCategories)
        assertTrue(errors.any { it is ValidationError.AccountNotFound })
    }

    @Test
    fun validate_emptyCategorySet_withCategory_categoryNotFound() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            categoryId = SyncId("category-1"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, emptySet())
        assertTrue(errors.any { it is ValidationError.CategoryNotFound })
    }

    @Test
    fun validate_emptyCategorySet_withNullCategory_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            categoryId = null,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, emptySet())
        assertTrue(errors.none { it is ValidationError.CategoryNotFound })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Transfer edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_transferToSameAccount_andDestNotFound_bothErrors() {
        // Can't get both errors: if same account, account is found, so only TransferSameAccount
        // This tests that same-account check is separate from existence check
        val txn = TestFixtures.createTransaction(
            type = TransactionType.TRANSFER,
            accountId = SyncId("account-1"),
            transferAccountId = SyncId("account-1"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.TransferSameAccount })
        assertTrue(errors.none { it is ValidationError.AccountNotFound })
    }

    @Test
    fun validate_transfer_bothAccountsExist_noErrors() {
        val txn = TestFixtures.createTransaction(
            type = TransactionType.TRANSFER,
            accountId = SyncId("account-1"),
            transferAccountId = SyncId("account-2"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.TransferSameAccount })
        assertTrue(errors.none { it is ValidationError.TransferMissingDestination })
    }

    @Test
    fun validate_transfer_sourceNotFound_andDestNotFound() {
        val txn = TestFixtures.createTransaction(
            type = TransactionType.TRANSFER,
            accountId = SyncId("unknown-source"),
            transferAccountId = SyncId("unknown-dest"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        val accountNotFoundErrors = errors.filterIsInstance<ValidationError.AccountNotFound>()
        // Both source and destination should be flagged
        assertEquals(2, accountNotFoundErrors.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Non-transfer with transferAccountId set
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_expenseWithTransferAccountId_noTransferValidation() {
        // An expense should not trigger transfer validation even if transferAccountId is set
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(transferAccountId = SyncId("account-2"))

        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.TransferSameAccount })
        assertTrue(errors.none { it is ValidationError.TransferMissingDestination })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Payee/note boundary values
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_payeeExactly201_hasError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(payee = "X".repeat(201))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.PayeeTooLong })
    }

    @Test
    fun validate_payeeExactly200_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(payee = "X".repeat(200))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.PayeeTooLong })
    }

    @Test
    fun validate_payeeExactly199_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(payee = "X".repeat(199))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.PayeeTooLong })
    }

    @Test
    fun validate_noteExactly1001_hasError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(note = "N".repeat(1001))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.NoteTooLong })
    }

    @Test
    fun validate_noteExactly1000_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(note = "N".repeat(1000))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.NoteTooLong })
    }

    @Test
    fun validate_emptyPayee_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(payee = "")
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.PayeeTooLong })
    }

    @Test
    fun validate_emptyNote_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(note = "")
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.NoteTooLong })
    }

    // ═══════════════════════════════════════════════════════════════════
    // All fields valid — no errors at all
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_perfectTransaction_zeroErrors() {
        val txn = TestFixtures.createExpense(
            amount = Cents(500),
            accountId = SyncId("account-1"),
            categoryId = SyncId("category-1"),
            date = LocalDate(2024, 6, 15),
        ).copy(
            payee = "Grocery Store",
            note = "Weekly groceries",
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.isEmpty(), "Expected zero errors but got: $errors")
    }

    // ═══════════════════════════════════════════════════════════════════
    // ValidationError sealed hierarchy — exhaustiveness
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validationError_allSubtypes_haveNonBlankMessages() {
        val errors: List<ValidationError> = listOf(
            ValidationError.ZeroAmount,
            ValidationError.AccountNotFound(SyncId("x")),
            ValidationError.CategoryNotFound(SyncId("x")),
            ValidationError.TransferMissingDestination,
            ValidationError.TransferSameAccount,
            ValidationError.DateTooFarInFuture(LocalDate(2030, 1, 1)),
            ValidationError.PayeeTooLong(500),
            ValidationError.NoteTooLong(5000),
        )
        errors.forEach { error ->
            assertTrue(
                error.message.isNotBlank(),
                "${error::class.simpleName} has blank message",
            )
        }
    }

    @Test
    fun validationError_accountNotFound_includesIdInMessage() {
        val id = SyncId("my-account-id")
        val error = ValidationError.AccountNotFound(id)
        assertTrue(error.message.contains("my-account-id"))
    }

    @Test
    fun validationError_categoryNotFound_includesIdInMessage() {
        val id = SyncId("my-cat-id")
        val error = ValidationError.CategoryNotFound(id)
        assertTrue(error.message.contains("my-cat-id"))
    }
}
