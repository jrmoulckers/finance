// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.validation

import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*

/**
 * Validates transactions before they are persisted.
 * Designed for pre-construction validation of raw input data,
 * complementing the model-level init checks in [Transaction].
 */
object TransactionValidator {

    /**
     * Validate a transaction, returning a list of validation errors.
     * An empty list means the transaction is valid.
     */
    fun validate(
        transaction: Transaction,
        existingAccounts: Set<SyncId>,
        existingCategories: Set<SyncId>,
    ): List<ValidationError> {
        val errors = mutableListOf<ValidationError>()

        // Amount must not be zero
        if (transaction.amount.isZero()) {
            errors.add(ValidationError.ZeroAmount)
        }

        // Account must exist
        if (transaction.accountId !in existingAccounts) {
            errors.add(ValidationError.AccountNotFound(transaction.accountId))
        }

        // Category must exist (if provided)
        val categoryId = transaction.categoryId
        if (categoryId != null && categoryId !in existingCategories) {
            errors.add(ValidationError.CategoryNotFound(categoryId))
        }

        // Transfer validation
        if (transaction.type == TransactionType.TRANSFER) {
            val transferAccountId = transaction.transferAccountId
            if (transferAccountId == null) {
                errors.add(ValidationError.TransferMissingDestination)
            } else if (transferAccountId !in existingAccounts) {
                errors.add(ValidationError.AccountNotFound(transferAccountId))
            } else if (transferAccountId == transaction.accountId) {
                errors.add(ValidationError.TransferSameAccount)
            }
        }

        // Date cannot be in the far future (more than 1 year ahead)
        val oneYearFromNow = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date
            .plus(1, DateTimeUnit.YEAR)
        if (transaction.date > oneYearFromNow) {
            errors.add(ValidationError.DateTooFarInFuture(transaction.date))
        }

        // Payee length check
        val payee = transaction.payee
        if (payee != null && payee.length > 200) {
            errors.add(ValidationError.PayeeTooLong(payee.length))
        }

        // Note length check
        val note = transaction.note
        if (note != null && note.length > 1000) {
            errors.add(ValidationError.NoteTooLong(note.length))
        }

        return errors
    }
}

/**
 * Sealed hierarchy of validation errors for type-safe error handling.
 */
sealed class ValidationError(val message: String) {
    data object ZeroAmount : ValidationError("Transaction amount cannot be zero")
    data class AccountNotFound(val id: SyncId) : ValidationError("Account not found: ${id.value}")
    data class CategoryNotFound(val id: SyncId) : ValidationError("Category not found: ${id.value}")
    data object TransferMissingDestination : ValidationError("Transfer must have a destination account")
    data object TransferSameAccount : ValidationError("Transfer source and destination must be different")
    data class DateTooFarInFuture(val date: LocalDate) : ValidationError("Date too far in the future: $date")
    data class PayeeTooLong(val length: Int) : ValidationError("Payee too long: $length chars (max 200)")
    data class NoteTooLong(val length: Int) : ValidationError("Note too long: $length chars (max 1000)")
}
