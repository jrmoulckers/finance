// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.investment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.investment.AssetClass
import com.finance.core.investment.Holding
import com.finance.core.investment.InvestmentEngine
import com.finance.core.investment.Portfolio
import com.finance.core.investment.PortfolioSummary
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import timber.log.Timber

/**
 * UI representation of a holding for display.
 */
data class HoldingUi(
    val id: String,
    val symbol: String,
    val name: String,
    val assetClass: String,
    val currentValueFormatted: String,
    val gainLossFormatted: String,
    val returnPercent: String,
    val isProfit: Boolean,
)

/**
 * UI representation of an asset allocation slice.
 */
data class AllocationSlice(
    val assetClass: AssetClass,
    val label: String,
    val percentage: Double,
)

/**
 * UI representation of a performance data point for the line chart.
 */
data class PerformancePoint(
    val label: String,
    val value: Float,
)

/**
 * UI state for the Investment Portfolio View.
 */
data class InvestmentUiState(
    val isLoading: Boolean = true,
    val portfolioName: String = "",
    val totalValueFormatted: String = "",
    val totalGainLossFormatted: String = "",
    val totalReturnPercent: String = "",
    val isOverallProfit: Boolean = true,
    val holdingCount: Int = 0,
    val holdings: List<HoldingUi> = emptyList(),
    val allocation: List<AllocationSlice> = emptyList(),
    val performanceHistory: List<PerformancePoint> = emptyList(),
    val errorMessage: String? = null,
)

/**
 * ViewModel for the Investment Portfolio View (#1119).
 *
 * Loads portfolio data and delegates calculations to the KMP
 * [InvestmentEngine]. Provides formatted display data including
 * holdings, asset allocation, and performance history.
 *
 * @param householdIdProvider Provides the current user scope.
 */
class InvestmentViewModel(
    private val householdIdProvider: HouseholdIdProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InvestmentUiState())
    val uiState: StateFlow<InvestmentUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD

    init {
        loadPortfolio()
    }

    private fun loadPortfolio() {
        viewModelScope.launch {
            delay(300)
            val userId = householdIdProvider.householdId.value ?: run {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            val now = Clock.System.now()

            // Sample portfolio data
            val portfolio = Portfolio(
                id = SyncId("portfolio-1"),
                ownerId = userId,
                householdId = userId,
                name = "My Portfolio",
                holdings = listOf(
                    Holding(
                        id = SyncId("h1"), portfolioId = SyncId("portfolio-1"),
                        symbol = "AAPL", name = "Apple Inc.",
                        assetClass = AssetClass.STOCKS,
                        quantity = 50, costBasis = Cents(750000), currentValue = Cents(925000),
                        previousClose = Cents(920000), lastUpdated = now,
                    ),
                    Holding(
                        id = SyncId("h2"), portfolioId = SyncId("portfolio-1"),
                        symbol = "GOOGL", name = "Alphabet Inc.",
                        assetClass = AssetClass.STOCKS,
                        quantity = 10, costBasis = Cents(1400000), currentValue = Cents(1580000),
                        previousClose = Cents(1575000), lastUpdated = now,
                    ),
                    Holding(
                        id = SyncId("h3"), portfolioId = SyncId("portfolio-1"),
                        symbol = "BND", name = "Vanguard Total Bond",
                        assetClass = AssetClass.BONDS,
                        quantity = 100, costBasis = Cents(750000), currentValue = Cents(740000),
                        previousClose = Cents(742000), lastUpdated = now,
                    ),
                    Holding(
                        id = SyncId("h4"), portfolioId = SyncId("portfolio-1"),
                        symbol = "GLD", name = "SPDR Gold Shares",
                        assetClass = AssetClass.COMMODITIES,
                        quantity = 20, costBasis = Cents(380000), currentValue = Cents(420000),
                        previousClose = Cents(418000), lastUpdated = now,
                    ),
                    Holding(
                        id = SyncId("h5"), portfolioId = SyncId("portfolio-1"),
                        symbol = "BTC", name = "Bitcoin",
                        assetClass = AssetClass.CRYPTO,
                        quantity = 1, costBasis = Cents(3500000), currentValue = Cents(4200000),
                        previousClose = Cents(4150000), lastUpdated = now,
                    ),
                ),
                currency = currency,
                createdAt = now,
                updatedAt = now,
            )

            val summary = InvestmentEngine.summary(portfolio)
            val allocation = InvestmentEngine.assetAllocation(portfolio)

            _uiState.update {
                it.copy(
                    isLoading = false,
                    portfolioName = portfolio.name,
                    totalValueFormatted = CurrencyFormatter.format(summary.totalValue, currency),
                    totalGainLossFormatted = CurrencyFormatter.format(summary.totalGainLoss, currency, showSign = true),
                    totalReturnPercent = summary.totalReturnPercent?.let { pct ->
                        "${if (pct >= 0) "+" else ""}${"%.2f".format(pct)}%"
                    } ?: "N/A",
                    isOverallProfit = summary.totalGainLoss.isPositive(),
                    holdingCount = summary.holdingCount,
                    holdings = portfolio.holdings.map { holding ->
                        val gainLoss = InvestmentEngine.unrealisedGainLoss(holding)
                        val returnPct = InvestmentEngine.totalReturnPercent(holding)
                        HoldingUi(
                            id = holding.id.value,
                            symbol = holding.symbol,
                            name = holding.name,
                            assetClass = holding.assetClass.name,
                            currentValueFormatted = CurrencyFormatter.format(holding.currentValue, currency),
                            gainLossFormatted = CurrencyFormatter.format(gainLoss, currency, showSign = true),
                            returnPercent = returnPct?.let { pct ->
                                "${if (pct >= 0) "+" else ""}${"%.1f".format(pct)}%"
                            } ?: "N/A",
                            isProfit = holding.isProfit,
                        )
                    },
                    allocation = allocation.map { (assetClass, pct) ->
                        AllocationSlice(
                            assetClass = assetClass,
                            label = assetClass.name.lowercase().replaceFirstChar { c -> c.uppercaseChar() },
                            percentage = pct,
                        )
                    }.sortedByDescending { it.percentage },
                    performanceHistory = generateSampleHistory(),
                )
            }
            Timber.d("Portfolio loaded: %s, %d holdings", portfolio.name, portfolio.holdings.size)
        }
    }

    private fun generateSampleHistory(): List<PerformancePoint> {
        val months = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        val values = listOf(72000f, 74500f, 73000f, 76000f, 78500f, 77000f, 79500f, 81000f, 80000f, 82500f, 84000f, 86500f)
        return months.zip(values).map { (m, v) -> PerformancePoint(m, v) }
    }
}
