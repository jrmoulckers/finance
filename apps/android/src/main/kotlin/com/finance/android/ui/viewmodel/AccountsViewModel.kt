// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Transaction
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

data class AccountGroup(
    val type: AccountType,
    val displayName: String,
    val accounts: List<Account>,
    val totalBalance: Cents,
    val totalBalanceFormatted: String,
)

data class AccountsUiState(
    val isLoading: Boolean = true,
    val groups: List<AccountGroup> = emptyList(),
    val selectedAccount: Account? = null,
    val selectedAccountTransactions: List<Transaction> = emptyList(),
    val isEmpty: Boolean = false,
)

/**
 * ViewModel for the Accounts screen (#22). Loads accounts grouped by type.
 *
 * @param accountRepository Source for account data.
 * @param transactionRepository Source for transactions shown in account detail.
 */
class AccountsViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountsUiState())
    val uiState: StateFlow<AccountsUiState> = _uiState.asStateFlow()

    init { loadAccounts() }

    private fun loadAccounts() {
        viewModelScope.launch {
            delay(200)
            accountRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).collect { accounts ->
                val currency = Currency.USD
                if (accounts.isEmpty()) {
                    _uiState.update { it.copy(isLoading = false, groups = emptyList(), isEmpty = true) }
                    return@collect
                }
                val order = listOf(
                    AccountType.CHECKING,
                    AccountType.SAVINGS,
                    AccountType.CREDIT_CARD,
                    AccountType.CASH,
                    AccountType.INVESTMENT,
                    AccountType.LOAN,
                    AccountType.OTHER,
                )
                val groups = accounts.groupBy { it.type }.entries
                    .sortedBy { order.indexOf(it.key) }
                    .map { (type, accts) ->
                        val total = Cents(accts.sumOf { it.currentBalance.amount })
                        AccountGroup(
                            type = type,
                            displayName = type.displayName(),
                            accounts = accts.sortedBy { it.sortOrder },
                            totalBalance = total,
                            totalBalanceFormatted = CurrencyFormatter.format(total, currency),
                        )
                    }
                _uiState.update { it.copy(isLoading = false, groups = groups, isEmpty = false) }
            }
        }
    }

    fun selectAccount(account: Account) {
        viewModelScope.launch {
            val txns = transactionRepository.observeByAccount(account.id).first()
                .sortedByDescending { it.date }
            _uiState.update { it.copy(selectedAccount = account, selectedAccountTransactions = txns) }
        }
    }

    fun clearSelection() {
        _uiState.update { it.copy(selectedAccount = null, selectedAccountTransactions = emptyList()) }
    }

    /**
     * Creates a new account and stores it in the repository.
     *
     * @param name User-visible account name.
     * @param accountType Selected account type.
     * @param initialBalance Opening balance in the account currency's minor unit.
     * @param currency ISO 4217 account currency.
     */
    suspend fun createAccount(
        name: String,
        accountType: AccountType,
        initialBalance: Cents,
        currency: Currency,
    ) {
        val now = Clock.System.now()
        val account = Account(
            id = SyncId(UUID.randomUUID().toString()),
            householdId = PLACEHOLDER_HOUSEHOLD_ID,
            name = name.trim(),
            type = accountType,
            currency = currency,
            currentBalance = initialBalance,
            isArchived = false,
            sortOrder = 0,
            icon = null,
            color = null,
            createdAt = now,
            updatedAt = now,
            deletedAt = null,
            syncVersion = 0,
            isSynced = false,
        )
        accountRepository.insert(account)
    }
}

private fun AccountType.displayName(): String = when (this) {
    AccountType.CHECKING -> "Checking"
    AccountType.SAVINGS -> "Savings"
    AccountType.CREDIT_CARD -> "Credit Cards"
    AccountType.CASH -> "Cash"
    AccountType.INVESTMENT -> "Investments"
    AccountType.LOAN -> "Loans"
    AccountType.OTHER -> "Other"
}