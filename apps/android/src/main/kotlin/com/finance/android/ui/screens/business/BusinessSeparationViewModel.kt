// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business

import androidx.lifecycle.ViewModel
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/** A summarised business/personal breakdown for the current filter. */
data class ScopeSummaryUi(
    val filter: ScopeFilter,
    val incomeFormatted: String,
    val expenseFormatted: String,
    val netFormatted: String,
    val netIsPositive: Boolean,
    val transactionCount: Int,
)

/** A single transaction row shown in the separation screen. */
data class ScopedTransactionUi(
    val id: String,
    val payee: String,
    val amountFormatted: String,
    val isIncome: Boolean,
    val scope: MoneyScope,
    val categoryLabel: String?,
    val needsReview: Boolean,
)

data class BusinessSeparationUiState(
    val isLoading: Boolean = true,
    val filter: ScopeFilter = ScopeFilter.ALL,
    /** Combined view summary, always shown side-by-side with the business view. */
    val combined: ScopeSummaryUi? = null,
    /** Business-only summary for the "how is the truck doing?" question. */
    val businessOnly: ScopeSummaryUi? = null,
    val filtered: ScopeSummaryUi? = null,
    val transactions: List<ScopedTransactionUi> = emptyList(),
    val reviewCount: Int = 0,
)

/**
 * ViewModel powering business-vs-personal separation (#2182).
 *
 * Lets the owner filter every rollup by business/personal/combined, see the
 * business-only and combined views side-by-side, and reclassify transactions
 * that were flagged as ambiguous (e.g. propane bought on the household card).
 */
class BusinessSeparationViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(BusinessSeparationUiState())
    val uiState: StateFlow<BusinessSeparationUiState> = _uiState.asStateFlow()

    private var transactions: List<ScopedTransaction> = sampleTransactions()

    init {
        recompute(ScopeFilter.ALL)
    }

    fun setFilter(filter: ScopeFilter) {
        Timber.d("Money scope filter changed to %s", filter.id)
        recompute(filter)
    }

    /** Reclassify a flagged transaction into a definite scope (#2182 cleanup). */
    fun reclassify(id: String, scope: MoneyScope) {
        transactions = transactions.map {
            if (it.id == id) {
                it.copy(
                    scope = scope,
                    needsReview = false,
                    businessCategory = if (scope == MoneyScope.PERSONAL) null else it.businessCategory,
                )
            } else {
                it
            }
        }
        recompute(_uiState.value.filter)
    }

    private fun recompute(filter: ScopeFilter) {
        _uiState.update {
            it.copy(
                isLoading = false,
                filter = filter,
                combined = summarise(ScopeFilter.ALL, transactions),
                businessOnly = summarise(ScopeFilter.BUSINESS_ONLY, transactions),
                filtered = summarise(filter, transactions),
                transactions = transactions
                    .filter { t -> filter.includes(t.scope) }
                    .map { t -> t.toUi() },
                reviewCount = transactions.count { t -> t.needsReview },
            )
        }
    }

    private fun summarise(filter: ScopeFilter, all: List<ScopedTransaction>): ScopeSummaryUi {
        val visible = all.filter { filter.includes(it.scope) }
        val income = visible.filter { it.isIncome }.fold(Cents.ZERO) { a, t -> a + t.amount }
        val expense = visible.filterNot { it.isIncome }.fold(Cents.ZERO) { a, t -> a + t.amount }
        val net = income - expense
        return ScopeSummaryUi(
            filter = filter,
            incomeFormatted = CurrencyFormatter.format(income, Currency.USD),
            expenseFormatted = CurrencyFormatter.format(expense, Currency.USD),
            netFormatted = CurrencyFormatter.format(net, Currency.USD, showSign = true),
            netIsPositive = net.amount >= 0L,
            transactionCount = visible.size,
        )
    }

    private fun ScopedTransaction.toUi(): ScopedTransactionUi = ScopedTransactionUi(
        id = id,
        payee = payee,
        amountFormatted = CurrencyFormatter.format(amount, Currency.USD, showSign = false),
        isIncome = isIncome,
        scope = scope,
        categoryLabel = businessCategory?.label,
        needsReview = needsReview,
    )

    private fun sampleTransactions(): List<ScopedTransaction> = listOf(
        ScopedTransaction("t1", "Weekend festival sales", Cents.fromDollars(2450.0), true, MoneyScope.BUSINESS, BusinessCategory.SALES),
        ScopedTransaction("t2", "Restaurant Depot — produce", Cents.fromDollars(612.40), false, MoneyScope.BUSINESS, BusinessCategory.COGS),
        ScopedTransaction("t3", "Commissary rent", Cents.fromDollars(850.0), false, MoneyScope.BUSINESS, BusinessCategory.COMMISSARY_RENT),
        ScopedTransaction("t4", "Payroll — 2 staff", Cents.fromDollars(1180.0), false, MoneyScope.BUSINESS, BusinessCategory.LABOR),
        ScopedTransaction("t5", "Home groceries", Cents.fromDollars(146.22), false, MoneyScope.PERSONAL),
        ScopedTransaction("t6", "Paycheck (spouse)", Cents.fromDollars(1900.0), true, MoneyScope.PERSONAL),
        ScopedTransaction("t7", "Costco — mixed run", Cents.fromDollars(233.11), false, MoneyScope.SPLIT, BusinessCategory.SUPPLIES, needsReview = true),
        ScopedTransaction("t8", "Shell — fuel/propane", Cents.fromDollars(94.60), false, MoneyScope.SPLIT, BusinessCategory.FUEL, needsReview = true),
    )
}
