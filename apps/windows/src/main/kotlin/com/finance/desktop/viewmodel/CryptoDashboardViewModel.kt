// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.crypto.CryptoFormat
import com.finance.desktop.crypto.CryptoHoldingsSource
import com.finance.desktop.crypto.CryptoPortfolioAggregator
import com.finance.desktop.crypto.CryptoPriceSource
import com.finance.desktop.crypto.MockCryptoPriceSource
import com.finance.desktop.crypto.SampleCryptoHoldingsSource
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Crypto portfolio dashboard ViewModel — Issue #2176
//
// Mirrors the Android architecture: a StateFlow-backed holder that maps the
// pure aggregation model (CryptoPortfolioAggregator) into display strings. The
// price feed is injected through CryptoPriceSource so the live adapter (#2702)
// can replace the offline mock with zero UI changes.
// ─────────────────────────────────────────────────────────────────────────────

/** UI projection of a single crypto position. */
data class CryptoPositionUi(
    val id: String,
    val symbol: String,
    val name: String,
    val quantity: String,
    val price: String,
    val value: String,
    val allocationPercent: Float,
    val allocationLabel: String,
    val change24h: String,
    val change24hPercent: String,
    val is24hPositive: Boolean,
    val pnl: String,
    val pnlPercent: String,
    val isPnlPositive: Boolean,
    val isStale: Boolean,
    /** Full spoken description so movement is conveyed without colour. */
    val accessibilityLabel: String,
)

data class CryptoDashboardUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val totalValue: String = "",
    val totalPnl: String = "",
    val totalPnlPercent: String = "",
    val isPnlPositive: Boolean = true,
    val total24hChange: String = "",
    val total24hChangePercent: String = "",
    val is24hPositive: Boolean = true,
    val positions: List<CryptoPositionUi> = emptyList(),
    val sourceName: String = "",
    val lastUpdatedLabel: String = "",
    val isStale: Boolean = false,
    val stalenessLabel: String = "",
    val missingSymbols: List<String> = emptyList(),
    val errorMessage: String? = null,
)

/**
 * Loads crypto holdings, values them against the injected [priceSource], and
 * exposes a formatted [uiState].
 *
 * @param holdingsSource Where positions come from (offline sample by default).
 * @param priceSource Near-real-time prices (offline mock by default).
 * @param clock Supplies "now" for staleness + relative-time labels.
 * @param currency Display currency for all monetary formatting.
 */
class CryptoDashboardViewModel(
    private val holdingsSource: CryptoHoldingsSource = SampleCryptoHoldingsSource(),
    private val priceSource: CryptoPriceSource = MockCryptoPriceSource(),
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val currency: Currency = Currency.USD,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(CryptoDashboardUiState())
    val uiState: StateFlow<CryptoDashboardUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    /**
     * Re-fetches prices and re-aggregates the portfolio.
     *
     * TODO(human): Wire [holdingsSource] to the real SQLDelight investment
     * tables (crypto accounts tagged separately from traditional investments)
     * and replace [priceSource] with the live market-data adapter once the
     * #2702 refresh pipeline and its credentials are available. See the
     * "## Needs Human Action" section of the PR for details.
     */
    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true, errorMessage = null)
            try {
                val holdings = holdingsSource.holdings()
                val symbols = holdings.map { it.symbol }
                val prices = priceSource.latestPrices(symbols)
                val now = clock()
                val summary = CryptoPortfolioAggregator.aggregate(
                    holdings = holdings,
                    prices = prices,
                    nowEpochMs = now,
                )

                val positions = summary.positions.map { p ->
                    val directionWord = CryptoFormat.directionWord(p.change24hPercent)
                    val pnlWord = if (p.unrealizedPnlCents >= 0) "gain" else "loss"
                    CryptoPositionUi(
                        id = p.id,
                        symbol = p.symbol,
                        name = p.name,
                        quantity = formatQuantity(p.quantity),
                        price = CurrencyFormatter.format(Cents(p.priceCents), currency),
                        value = CurrencyFormatter.format(Cents(p.marketValueCents), currency),
                        allocationPercent = (p.allocationPercent / 100.0).toFloat(),
                        allocationLabel = CryptoFormat.signedPercent(p.allocationPercent)
                            .removePrefix("+"),
                        change24h = CurrencyFormatter.format(
                            Cents(p.change24hCents), currency, showSign = true,
                        ),
                        change24hPercent = CryptoFormat.signedPercent(p.change24hPercent),
                        is24hPositive = p.change24hCents >= 0,
                        pnl = CurrencyFormatter.format(
                            Cents(p.unrealizedPnlCents), currency, showSign = true,
                        ),
                        pnlPercent = CryptoFormat.signedPercent(p.unrealizedPnlPercent),
                        isPnlPositive = p.unrealizedPnlCents >= 0,
                        isStale = p.isPriceStale,
                        accessibilityLabel = buildString {
                            append("${p.name}, ${formatQuantity(p.quantity)} ${p.symbol}, ")
                            append("worth ${CurrencyFormatter.format(Cents(p.marketValueCents), currency)}, ")
                            append("$directionWord ${CryptoFormat.signedPercent(p.change24hPercent).trimStart('+', '-')} ")
                            append("over 24 hours, ")
                            append("$pnlWord of ${CurrencyFormatter.format(Cents(p.unrealizedPnlCents).abs(), currency)}")
                            if (p.isPriceStale) append(", price may be out of date")
                        },
                    )
                }

                val deltaMs = now - summary.oldestPriceEpochMs
                _uiState.value = CryptoDashboardUiState(
                    isLoading = false,
                    isRefreshing = false,
                    totalValue = CurrencyFormatter.format(Cents(summary.totalValueCents), currency),
                    totalPnl = CurrencyFormatter.format(
                        Cents(summary.totalPnlCents), currency, showSign = true,
                    ),
                    totalPnlPercent = CryptoFormat.signedPercent(summary.totalPnlPercent),
                    isPnlPositive = summary.totalPnlCents >= 0,
                    total24hChange = CurrencyFormatter.format(
                        Cents(summary.total24hChangeCents), currency, showSign = true,
                    ),
                    total24hChangePercent = CryptoFormat.signedPercent(summary.total24hChangePercent),
                    is24hPositive = summary.total24hChangeCents >= 0,
                    positions = positions,
                    sourceName = priceSource.sourceName,
                    lastUpdatedLabel = if (summary.hasData) {
                        CryptoFormat.relativeUpdated(deltaMs)
                    } else {
                        "No price data"
                    },
                    isStale = summary.isStale,
                    stalenessLabel = if (summary.isStale) "Prices may be out of date" else "Live",
                    missingSymbols = summary.missingPriceSymbols,
                )
            } catch (e: IllegalStateException) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = e.message ?: "Could not refresh prices",
                )
            }
        }
    }

    private fun formatQuantity(quantity: Double): String {
        // Trim trailing zeros while keeping small fractional crypto amounts readable.
        val rounded = (kotlin.math.round(quantity * 100_000.0) / 100_000.0)
        val asLong = rounded.toLong()
        return if (rounded == asLong.toDouble()) {
            asLong.toString()
        } else {
            rounded.toString().trimEnd('0').trimEnd('.')
        }
    }
}
