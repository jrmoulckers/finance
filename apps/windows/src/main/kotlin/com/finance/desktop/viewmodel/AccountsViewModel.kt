// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.*
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class AccountGroupUi(val type: AccountType, val displayName: String, val accounts: List<Account>, val totalBalanceFormatted: String)
data class AccountsUiState(val isLoading: Boolean = true, val groups: List<AccountGroupUi> = emptyList(), val selectedAccount: Account? = null, val selectedAccountTransactions: List<Transaction> = emptyList())

class AccountsViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {
    private val _uiState = MutableStateFlow(AccountsUiState())
    val uiState: StateFlow<AccountsUiState> = _uiState.asStateFlow()
    private val hid = SyncId("d1")
    init { loadAccounts() }
    fun selectAccount(account: Account) {
        viewModelScope.launch {
            val txns = transactionRepository.observeByAccount(account.id).first().sortedByDescending { it.date }
            _uiState.value = _uiState.value.copy(selectedAccount = account, selectedAccountTransactions = txns)
        }
    }
    private fun loadAccounts() {
        viewModelScope.launch {
            val accounts = accountRepository.observeAll(hid).first()
            val currency = Currency.USD
            val groups = accounts.groupBy { it.type }.entries.map { (type, accts) ->
                val total = Cents(accts.sumOf { it.currentBalance.amount })
                AccountGroupUi(type, type.name.lowercase().replaceFirstChar { it.uppercase() }, accts.sortedBy { it.sortOrder }, CurrencyFormatter.format(total, currency))
            }
            _uiState.value = AccountsUiState(isLoading = false, groups = groups)
        }
    }
}
