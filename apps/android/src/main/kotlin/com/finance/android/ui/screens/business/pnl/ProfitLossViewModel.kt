// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.pnl

import androidx.lifecycle.ViewModel
import com.finance.android.ui.screens.business.BusinessCategory
import com.finance.android.ui.screens.business.MoneyScope
import com.finance.android.ui.screens.business.ScopedTransaction
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/** A formatted P&L line for display. */
data class PnlLineUi(
    val label: String,
    val amountFormatted: String,
    val percentLabel: String,
)

data class ProfitLossUiState(
    val isLoading: Boolean = true,
    val grouping: PnlGrouping = PnlGrouping.WEEKLY,
    val periodLabel: String = "",
    val revenueFormatted: String = "$0.00",
    val grossProfitFormatted: String = "$0.00",
    val netProfitFormatted: String = "$0.00",
    val foodCostPercentLabel: String = "0%",
    val laborPercentLabel: String = "0%",
    val grossMarginLabel: String = "0%",
    val netMarginLabel: String = "0%",
    val isProfitable: Boolean = false,
    val revenueLines: List<PnlLineUi> = emptyList(),
    val expenseLines: List<PnlLineUi> = emptyList(),
)

/**
 * ViewModel for the food-truck weekly/monthly P&L (#2184).
 *
 * Computes gross and net margin from business-tagged transactions using the
 * pure [FoodTruckPnl] calculator so the owner can see food-cost % and whether
 * labor erased the month's profit.
 */
class ProfitLossViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(ProfitLossUiState())
    val uiState: StateFlow<ProfitLossUiState> = _uiState.asStateFlow()

    init {
        recompute(PnlGrouping.WEEKLY)
    }

    fun setGrouping(grouping: PnlGrouping) {
        Timber.d("P&L grouping changed to %s", grouping.name)
        recompute(grouping)
    }

    private fun recompute(grouping: PnlGrouping) {
        val label = when (grouping) {
            PnlGrouping.WEEKLY -> "This week"
            PnlGrouping.MONTHLY -> "This month"
        }
        val txns = sampleTransactions(grouping)
        val pnl = FoodTruckPnl.compute(label, grouping, txns)

        _uiState.update {
            it.copy(
                isLoading = false,
                grouping = grouping,
                periodLabel = label,
                revenueFormatted = CurrencyFormatter.format(pnl.revenue, Currency.USD),
                grossProfitFormatted = CurrencyFormatter.format(pnl.grossProfit, Currency.USD, showSign = true),
                netProfitFormatted = CurrencyFormatter.format(pnl.netProfit, Currency.USD, showSign = true),
                foodCostPercentLabel = percentLabel(pnl.foodCostPercent),
                laborPercentLabel = percentLabel(pnl.laborPercent),
                grossMarginLabel = percentLabel(pnl.grossMarginPercent),
                netMarginLabel = percentLabel(pnl.netMarginPercent),
                isProfitable = pnl.isProfitable,
                revenueLines = pnl.revenueLines.map { l -> l.toUi() },
                expenseLines = pnl.expenseLines.map { l -> l.toUi() },
            )
        }
    }

    private fun PnlLine.toUi(): PnlLineUi = PnlLineUi(
        label = label,
        amountFormatted = CurrencyFormatter.format(amount, Currency.USD),
        percentLabel = percentLabel(percentOfRevenue),
    )

    private fun percentLabel(value: Double): String {
        val rounded = (value * 10).toLong() / 10.0
        return "$rounded%"
    }

    private fun sampleTransactions(grouping: PnlGrouping): List<ScopedTransaction> {
        val scale = if (grouping == PnlGrouping.MONTHLY) 4 else 1
        fun money(dollars: Double) = Cents.fromDollars(dollars * scale)
        return listOf(
            ScopedTransaction("r1", "Festival sales", money(2450.0), true, MoneyScope.BUSINESS, BusinessCategory.SALES),
            ScopedTransaction("r2", "Catering gig", money(680.0), true, MoneyScope.BUSINESS, BusinessCategory.OTHER_INCOME),
            ScopedTransaction("c1", "Produce & meat", money(742.0), false, MoneyScope.BUSINESS, BusinessCategory.COGS),
            ScopedTransaction("c2", "Paper goods", money(88.0), false, MoneyScope.BUSINESS, BusinessCategory.SUPPLIES),
            ScopedTransaction("l1", "Payroll", money(760.0), false, MoneyScope.BUSINESS, BusinessCategory.LABOR),
            ScopedTransaction("l2", "Payroll taxes", money(96.0), false, MoneyScope.BUSINESS, BusinessCategory.PAYROLL_TAX),
            ScopedTransaction("o1", "Fuel & propane", money(120.0), false, MoneyScope.BUSINESS, BusinessCategory.FUEL),
            ScopedTransaction("o2", "Commissary rent", money(212.0), false, MoneyScope.BUSINESS, BusinessCategory.COMMISSARY_RENT),
            ScopedTransaction("o3", "Permit", money(45.0), false, MoneyScope.BUSINESS, BusinessCategory.PERMITS),
            // Personal txns are excluded from the P&L automatically.
            ScopedTransaction("p1", "Home groceries", money(150.0), false, MoneyScope.PERSONAL),
        )
    }
}
