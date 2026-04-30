// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Investment Portfolio ViewModel — Sprint 22
// ─────────────────────────────────────────────────────────────────────────────

/** UI model for a single investment holding. */
data class HoldingUi(
    val id: String,
    val symbol: String,
    val name: String,
    val shares: String,
    val pricePerShare: String,
    val totalValue: String,
    val dayChange: String,
    val dayChangePercent: String,
    val totalReturn: String,
    val totalReturnPercent: String,
    val isPositive: Boolean,
    val allocationPercent: Float,
)

/** Data point for a portfolio performance chart. */
data class PerformancePoint(
    val label: String,
    val value: Float,
)

/** Slice for the allocation pie chart. */
data class AllocationSlice(
    val label: String,
    val percent: Float,
    val colorIndex: Int,
)

/** Time range selection for the performance chart. */
enum class PerformanceRange { ONE_WEEK, ONE_MONTH, THREE_MONTHS, SIX_MONTHS, ONE_YEAR, ALL_TIME }

data class InvestmentUiState(
    val isLoading: Boolean = true,
    val totalPortfolioValue: String = "",
    val totalDayChange: String = "",
    val totalDayChangePercent: String = "",
    val totalReturn: String = "",
    val totalReturnPercent: String = "",
    val isDayPositive: Boolean = true,
    val isTotalPositive: Boolean = true,
    val holdings: List<HoldingUi> = emptyList(),
    val performanceData: List<PerformancePoint> = emptyList(),
    val allocationData: List<AllocationSlice> = emptyList(),
    val selectedRange: PerformanceRange = PerformanceRange.ONE_MONTH,
)

/**
 * ViewModel for the Investment Portfolio screen.
 *
 * Loads investment accounts from [AccountRepository], computes portfolio
 * summary metrics, and provides data for performance and allocation charts.
 */
class InvestmentViewModel(
    private val accountRepository: AccountRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(InvestmentUiState())
    val uiState: StateFlow<InvestmentUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadPortfolio()
    }

    private fun loadPortfolio() {
        viewModelScope.launch {
            val accounts = accountRepository.observeAll(hid).first()
            val investmentAccounts = accounts.filter { it.type == AccountType.INVESTMENT }
            val totalValue = Cents(investmentAccounts.sumOf { it.currentBalance.amount })
            val currency = Currency.USD

            val holdings = listOf(
                HoldingUi("h1", "AAPL", "Apple Inc.", "50.00", "$198.50", "$9,925.00",
                    "+$125.00", "+1.27%", "+$2,425.00", "+32.35%", true, 0.25f),
                HoldingUi("h2", "MSFT", "Microsoft Corp.", "30.00", "$415.20", "$12,456.00",
                    "+$186.00", "+1.52%", "+$3,456.00", "+38.36%", true, 0.31f),
                HoldingUi("h3", "VTSAX", "Vanguard Total Stock Market", "85.25", "$112.30", "$9,573.58",
                    "-$42.62", "-0.44%", "+$1,573.58", "+19.67%", false, 0.24f),
                HoldingUi("h4", "BND", "Vanguard Total Bond Market", "120.00", "$72.15", "$8,658.00",
                    "+$12.00", "+0.14%", "-$342.00", "-3.80%", true, 0.20f),
            )

            val performanceData = generatePerformanceData(PerformanceRange.ONE_MONTH)

            val allocationData = listOf(
                AllocationSlice("US Stocks", 0.56f, 0),
                AllocationSlice("International", 0.12f, 1),
                AllocationSlice("Bonds", 0.20f, 2),
                AllocationSlice("Real Estate", 0.07f, 3),
                AllocationSlice("Cash", 0.05f, 4),
            )

            _uiState.value = InvestmentUiState(
                isLoading = false,
                totalPortfolioValue = CurrencyFormatter.format(totalValue, currency),
                totalDayChange = "+$280.38",
                totalDayChangePercent = "+0.69%",
                totalReturn = "+$7,112.58",
                totalReturnPercent = "+21.19%",
                isDayPositive = true,
                isTotalPositive = true,
                holdings = holdings,
                performanceData = performanceData,
                allocationData = allocationData,
            )
        }
    }

    fun setPerformanceRange(range: PerformanceRange) {
        _uiState.value = _uiState.value.copy(
            selectedRange = range,
            performanceData = generatePerformanceData(range),
        )
    }

    private fun generatePerformanceData(range: PerformanceRange): List<PerformancePoint> {
        val points = when (range) {
            PerformanceRange.ONE_WEEK -> 7
            PerformanceRange.ONE_MONTH -> 30
            PerformanceRange.THREE_MONTHS -> 12
            PerformanceRange.SIX_MONTHS -> 24
            PerformanceRange.ONE_YEAR -> 12
            PerformanceRange.ALL_TIME -> 24
        }
        val baseValue = 35000f
        val volatility = when (range) {
            PerformanceRange.ONE_WEEK -> 500f
            PerformanceRange.ONE_MONTH -> 1500f
            PerformanceRange.THREE_MONTHS -> 3000f
            PerformanceRange.SIX_MONTHS -> 5000f
            PerformanceRange.ONE_YEAR -> 8000f
            PerformanceRange.ALL_TIME -> 15000f
        }
        // Generate upward-trending data with some variation
        return (0 until points).map { i ->
            val progress = i.toFloat() / (points - 1).coerceAtLeast(1)
            val trend = volatility * progress
            val noise = (kotlin.math.sin(i.toDouble() * 1.5) * volatility * 0.15).toFloat()
            PerformancePoint(
                label = when (range) {
                    PerformanceRange.ONE_WEEK -> "Day ${i + 1}"
                    PerformanceRange.ONE_MONTH -> "Day ${i + 1}"
                    else -> "Period ${i + 1}"
                },
                value = baseValue + trend + noise,
            )
        }
    }
}
