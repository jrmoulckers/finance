// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.tray

import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * State for the quick-add transaction popup.
 */
data class QuickAddState(
    val isVisible: Boolean = false,
    val payee: String = "",
    val amount: String = "",
    val isExpense: Boolean = true,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Manager for quick-add transaction from the system tray.
 *
 * Handles the state for the quick-add popup window and persists
 * transactions through the repository layer.
 */
class QuickAddTransactionManager(
    private val transactionRepository: TransactionRepository,
) {

    private val _state = MutableStateFlow(QuickAddState())
    val state: StateFlow<QuickAddState> = _state.asStateFlow()

    private val householdId = SyncId("d1")
    private val ownerId = SyncId("owner1")
    private val defaultAccountId = SyncId("acc1")

    fun show() {
        _state.value = QuickAddState(isVisible = true)
    }

    fun hide() {
        _state.value = QuickAddState(isVisible = false)
    }

    fun updatePayee(payee: String) {
        _state.value = _state.value.copy(payee = payee, errorMessage = null)
    }

    fun updateAmount(amount: String) {
        // Only allow numeric input with optional decimal
        val filtered = amount.filter { it.isDigit() || it == '.' }
        _state.value = _state.value.copy(amount = filtered, errorMessage = null)
    }

    fun toggleType() {
        _state.value = _state.value.copy(isExpense = !_state.value.isExpense)
    }

    /**
     * Persist the transaction and return success/failure.
     * Returns the formatted amount string on success, null on failure.
     */
    @Suppress("ReturnCount") // Input validation with early returns
    suspend fun save(): Pair<String, String>? {
        val current = _state.value

        if (current.payee.isBlank()) {
            _state.value = current.copy(errorMessage = "Payee is required")
            return null
        }

        val amountDouble = current.amount.toDoubleOrNull()
        if (amountDouble == null || amountDouble <= 0) {
            _state.value = current.copy(errorMessage = "Enter a valid amount")
            return null
        }

        _state.value = current.copy(isSaving = true)

        @Suppress("TooGenericExceptionCaught") // Tray operation must not crash the app
        return try {
            val cents = Cents.fromDollars(amountDouble)
            val now = Clock.System.now()
            val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date

            val transaction = Transaction(
                id = SyncId("quick-${now.toEpochMilliseconds()}"),
                householdId = householdId,
                ownerId = ownerId,
                accountId = defaultAccountId,
                type = if (current.isExpense) TransactionType.EXPENSE else TransactionType.INCOME,
                amount = if (current.isExpense) Cents(-cents.amount) else cents,
                currency = Currency.USD,
                payee = current.payee,
                date = today,
                createdAt = now,
                updatedAt = now,
            )

            transactionRepository.insert(transaction)

            val formatted = CurrencyFormatter.format(cents, Currency.USD)
            _state.value = QuickAddState(isVisible = false)
            current.payee to formatted
        } catch (e: Exception) {
            _state.value = current.copy(
                isSaving = false,
                errorMessage = "Failed to save: ${e.message}",
            )
            null
        }
    }
}
