// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

/**
 * UI state for the Transaction Detail screen (#530).
 *
 * Models all observable display states: loading, success, not found, and deleted.
 */
sealed interface TransactionDetailUiState {

    /** Initial state while the transaction is being fetched from the repository. */
    data object Loading : TransactionDetailUiState

    /**
     * The requested transaction does not exist, was never inserted, or has been
     * soft-deleted externally (e.g. by another device via sync).
     */
    data object NotFound : TransactionDetailUiState

    /**
     * The transaction was successfully soft-deleted by the user.
     * The screen should call [onBack][com.finance.android.ui.screens.TransactionDetailScreen]
     * when it observes this state.
     */
    data object Deleted : TransactionDetailUiState

    /**
     * Transaction data is loaded and ready for display.
     *
     * @property transactionId The entity's [SyncId] — used for edit / delete actions.
     * @property accountId The owning account's [SyncId] — forwarded to the edit route.
     * @property payee Human-readable payee name (defaults to "Unknown" when absent).
     * @property formattedAmount Currency-formatted amount string including sign.
     * @property formattedDate Human-readable date: "Today", "Yesterday", or "Month D, YYYY".
     * @property type [TransactionType] value used for amount colour coding.
     * @property typeLabel Capitalised display label derived from [type].
     * @property statusLabel Capitalised display label for the transaction status.
     * @property categoryName Category display name, or `null` when uncategorised.
     * @property categoryIcon Icon slug from [com.finance.models.Category.icon], or `null`.
     * @property accountName Display name of the originating account.
     * @property note Free-text note, or `null` when absent or blank.
     * @property tags User-assigned tag strings (may be empty).
     * @property isDeleting `true` while the delete coroutine is in-flight.
     */
    data class Success(
        val transactionId: SyncId,
        val accountId: SyncId,
        val payee: String,
        val formattedAmount: String,
        val formattedDate: String,
        val type: TransactionType,
        val typeLabel: String,
        val statusLabel: String,
        val categoryName: String?,
        val categoryIcon: String?,
        val accountName: String,
        val note: String?,
        val tags: List<String>,
        val isDeleting: Boolean = false,
    ) : TransactionDetailUiState
}

/**
 * ViewModel for the Transaction Detail screen (#530).
 *
 * Reactively observes a single [com.finance.models.Transaction] via
 * [transactionRepository.observeById][TransactionRepository.observeById] and resolves
 * display names for its category and account. Exposes a single [uiState] flow of
 * [TransactionDetailUiState] for the Compose UI layer.
 *
 * The transaction ID is read from the navigation [SavedStateHandle] under key `"id"`,
 * which is populated automatically by Navigation Compose from the route argument.
 *
 * @param savedStateHandle Navigation argument handle — must contain key `"id"`.
 * @param transactionRepository Source of truth for [com.finance.models.Transaction] data.
 * @param categoryRepository Used for category name and icon resolution.
 * @param accountRepository Used for account name resolution.
 */
class TransactionDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val transactionId: SyncId = SyncId(
        checkNotNull(savedStateHandle["id"]) {
            "TransactionDetailViewModel requires navigation argument 'id'"
        },
    )

    private val _uiState = MutableStateFlow<TransactionDetailUiState>(TransactionDetailUiState.Loading)

    /**
     * Reactive UI state consumed by
     * [TransactionDetailScreen][com.finance.android.ui.screens.TransactionDetailScreen].
     */
    val uiState: StateFlow<TransactionDetailUiState> = _uiState.asStateFlow()

    /**
     * Tracks whether a user-initiated delete is in-flight. When the repository emits
     * `null` for the observed transaction this flag distinguishes a deliberate deletion
     * (→ [TransactionDetailUiState.Deleted]) from an unexpected disappearance
     * (→ [TransactionDetailUiState.NotFound]).
     */
    private var isDeletingSnapshot = false

    init {
        viewModelScope.launch {
            transactionRepository.observeById(transactionId).collectLatest { txn ->
                if (txn == null) {
                    _uiState.value = if (isDeletingSnapshot) {
                        TransactionDetailUiState.Deleted
                    } else {
                        Timber.w("Transaction not found: id=%s", transactionId.value)
                        TransactionDetailUiState.NotFound
                    }
                    return@collectLatest
                }

                val category = txn.categoryId?.let { categoryRepository.getById(it) }
                val account = accountRepository.getById(txn.accountId)
                val today = Clock.System.now()
                    .toLocalDateTime(TimeZone.currentSystemDefault()).date

                _uiState.value = TransactionDetailUiState.Success(
                    transactionId = txn.id,
                    accountId = txn.accountId,
                    payee = txn.payee ?: "Unknown",
                    formattedAmount = CurrencyFormatter.format(txn.amount, txn.currency, showSign = true),
                    formattedDate = formatDetailDate(txn.date, today),
                    type = txn.type,
                    typeLabel = txn.type.name.lowercase().replaceFirstChar { it.uppercase() },
                    statusLabel = txn.status.toDisplayLabel(),
                    categoryName = category?.name,
                    categoryIcon = category?.icon,
                    accountName = account?.name ?: "Unknown Account",
                    note = txn.note?.takeIf { it.isNotBlank() },
                    tags = txn.tags,
                    isDeleting = isDeletingSnapshot,
                )
            }
        }
    }

    /**
     * Soft-deletes the current transaction.
     *
     * Immediately sets [TransactionDetailUiState.Success.isDeleting] to `true` for
     * optimistic UI feedback, then delegates to [transactionRepository.delete].
     * Once the repository emits `null` for the observed ID the state transitions to
     * [TransactionDetailUiState.Deleted] and the screen should navigate back.
     *
     * No-op when the current state is not [TransactionDetailUiState.Success].
     */
    fun deleteTransaction() {
        val current = _uiState.value as? TransactionDetailUiState.Success ?: return
        Timber.d("Deleting transaction id=%s", transactionId.value)
        isDeletingSnapshot = true
        _uiState.value = current.copy(isDeleting = true)
        viewModelScope.launch {
            transactionRepository.delete(transactionId)
        }
    }

    private fun formatDetailDate(date: LocalDate, today: LocalDate): String {
        val yesterday = today.minus(1, DateTimeUnit.DAY)
        return when (date) {
            today -> "Today"
            yesterday -> "Yesterday"
            else -> {
                val month = date.month.name.lowercase().replaceFirstChar { it.uppercase() }
                "$month ${date.dayOfMonth}, ${date.year}"
            }
        }
    }

    private fun TransactionStatus.toDisplayLabel(): String = when (this) {
        TransactionStatus.PENDING -> "Pending"
        TransactionStatus.CLEARED -> "Cleared"
        TransactionStatus.RECONCILED -> "Reconciled"
        TransactionStatus.VOID -> "Void"
    }
}
