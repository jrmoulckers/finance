// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.ui.data.SampleData
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Transaction
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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

/** ViewModel for the Accounts screen (#22). Loads accounts grouped by type. */
class AccountsViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(AccountsUiState())
    val uiState: StateFlow<AccountsUiState> = _uiState.asStateFlow()

    init { loadAccounts() }

    private fun loadAccounts() {
        viewModelScope.launch {
            delay(200)
            val accounts = SampleData.accounts
            val currency = Currency.USD
            if (accounts.isEmpty()) {
                _uiState.update { it.copy(isLoading = false, isEmpty = true) }
                return@launch
            }
            val order = listOf(AccountType.CHECKING, AccountType.SAVINGS, AccountType.CREDIT_CARD,
                AccountType.CASH, AccountType.INVESTMENT, AccountType.LOAN, AccountType.OTHER)
            val groups = accounts.groupBy { it.type }.entries
                .sortedBy { order.indexOf(it.key) }
                .map { (type, accts) ->
                    val total = Cents(accts.sumOf { it.currentBalance.amount })
                    AccountGroup(type = type, displayName = type.displayName(),
                        accounts = accts.sortedBy { it.sortOrder }, totalBalance = total,
                        totalBalanceFormatted = CurrencyFormatter.format(total, currency))
                }
            _uiState.update { it.copy(isLoading = false, groups = groups, isEmpty = false) }
        }
    }

    fun selectAccount(account: Account) {
        val txns = SampleData.transactions
            .filter { it.accountId == account.id && it.deletedAt == null }
            .sortedByDescending { it.date }
        _uiState.update { it.copy(selectedAccount = account, selectedAccountTransactions = txns) }
    }

    fun clearSelection() {
        _uiState.update { it.copy(selectedAccount = null, selectedAccountTransactions = emptyList()) }
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