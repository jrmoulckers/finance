// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.validation

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class TransactionValidatorTest {

    private val existingAccounts = setOf(SyncId("account-1"), SyncId("account-2"))
    private val existingCategories = setOf(SyncId("category-1"), SyncId("category-2"))

    // ═══════════════════════════════════════════════════════════════════
    // Valid transaction — no errors
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_validTransaction_returnsEmptyList() {
        val txn = TestFixtures.createExpense(
            amount = Cents(2500),
            date = LocalDate(2024, 6, 15),
            categoryId = SyncId("category-1"),
            accountId = SyncId("account-1"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.isEmpty(), "Expected no validation errors but got: $errors")
    }

    @Test
    fun validate_validIncome_returnsEmptyList() {
        val txn = TestFixtures.createIncome(
            amount = Cents(100000),
            date = LocalDate(2024, 6, 1),
            accountId = SyncId("account-1"),
            categoryId = SyncId("category-1"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Zero amount — tested via model-level init
    // Note: Transaction.init enforces amount != 0, so the validator's
    // ZeroAmount check is defense-in-depth and cannot be reached through
    // normal Transaction construction.
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun transactionInit_zeroAmount_throwsAtConstruction() {
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createExpense(amount = Cents(0))
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Account not found
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_accountNotFound() {
        val txn = TestFixtures.createExpense(accountId = SyncId("unknown-account"))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)

        assertEquals(1, errors.size)
        assertTrue(errors[0] is ValidationError.AccountNotFound)
        assertEquals(SyncId("unknown-account"), (errors[0] as ValidationError.AccountNotFound).id)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Category not found
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_categoryNotFound() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            categoryId = SyncId("unknown-category"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)

        assertEquals(1, errors.size)
        assertTrue(errors[0] is ValidationError.CategoryNotFound)
    }

    @Test
    fun validate_nullCategory_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            categoryId = null,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.CategoryNotFound })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Transfer validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_validTransfer() {
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
    fun validate_transferToSameAccount() {
        val txn = TestFixtures.createTransaction(
            type = TransactionType.TRANSFER,
            accountId = SyncId("account-1"),
            transferAccountId = SyncId("account-1"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.TransferSameAccount })
    }

    @Test
    fun validate_transferDestinationNotFound() {
        val txn = TestFixtures.createTransaction(
            type = TransactionType.TRANSFER,
            accountId = SyncId("account-1"),
            transferAccountId = SyncId("unknown-dest"),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.AccountNotFound })
        assertEquals(SyncId("unknown-dest"), (errors.first { it is ValidationError.AccountNotFound } as ValidationError.AccountNotFound).id)
    }

    // Note: TransferMissingDestination cannot be tested because Transaction.init
    // already requires transferAccountId != null for transfers.
    @Test
    fun transactionInit_transferWithoutDestination_throwsAtConstruction() {
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createTransaction(
                type = TransactionType.TRANSFER,
                transferAccountId = null,
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Date too far in future
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_dateTooFarInFuture() {
        val futureDate = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
            .plus(2, DateTimeUnit.YEAR) // 2 years from now
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            date = futureDate,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.any { it is ValidationError.DateTooFarInFuture })
    }

    @Test
    fun validate_dateWithinOneYear_noError() {
        val nearFuture = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
            .plus(6, DateTimeUnit.MONTH)
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            date = nearFuture,
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.DateTooFarInFuture })
    }

    @Test
    fun validate_pastDate_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
            date = LocalDate(2020, 1, 1),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.DateTooFarInFuture })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Payee too long
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_payeeTooLong() {
        val longPayee = "A".repeat(201)
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(payee = longPayee)
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)

        assertTrue(errors.any { it is ValidationError.PayeeTooLong })
        assertEquals(201, (errors.first { it is ValidationError.PayeeTooLong } as ValidationError.PayeeTooLong).length)
    }

    @Test
    fun validate_payeeExactly200_noError() {
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(payee = "A".repeat(200))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.PayeeTooLong })
    }

    @Test
    fun validate_nullPayee_noError() {
        val txn = TestFixtures.createExpense(accountId = SyncId("account-1"))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.PayeeTooLong })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Note too long
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_noteTooLong() {
        val longNote = "N".repeat(1001)
        val txn = TestFixtures.createExpense(
            accountId = SyncId("account-1"),
        ).copy(note = longNote)
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)

        assertTrue(errors.any { it is ValidationError.NoteTooLong })
        assertEquals(1001, (errors.first { it is ValidationError.NoteTooLong } as ValidationError.NoteTooLong).length)
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
    fun validate_nullNote_noError() {
        val txn = TestFixtures.createExpense(accountId = SyncId("account-1"))
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)
        assertTrue(errors.none { it is ValidationError.NoteTooLong })
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple validation errors
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validate_multipleErrors() {
        val futureDate = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
            .plus(2, DateTimeUnit.YEAR)
        val txn = TestFixtures.createExpense(
            accountId = SyncId("unknown-account"),
            categoryId = SyncId("unknown-category"),
            date = futureDate,
        ).copy(
            payee = "X".repeat(201),
            note = "Y".repeat(1001),
        )
        val errors = TransactionValidator.validate(txn, existingAccounts, existingCategories)

        // Should have at least: AccountNotFound, CategoryNotFound, DateTooFarInFuture,
        // PayeeTooLong, NoteTooLong
        assertTrue(errors.size >= 5, "Expected at least 5 errors, got ${errors.size}: $errors")
        assertTrue(errors.any { it is ValidationError.AccountNotFound })
        assertTrue(errors.any { it is ValidationError.CategoryNotFound })
        assertTrue(errors.any { it is ValidationError.DateTooFarInFuture })
        assertTrue(errors.any { it is ValidationError.PayeeTooLong })
        assertTrue(errors.any { it is ValidationError.NoteTooLong })
    }

    // ═══════════════════════════════════════════════════════════════════
    // ValidationError messages
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun validationError_messages_areDescriptive() {
        assertTrue(ValidationError.ZeroAmount.message.contains("zero"))
        assertTrue(ValidationError.TransferMissingDestination.message.contains("destination"))
        assertTrue(ValidationError.TransferSameAccount.message.contains("different"))
    }
}
