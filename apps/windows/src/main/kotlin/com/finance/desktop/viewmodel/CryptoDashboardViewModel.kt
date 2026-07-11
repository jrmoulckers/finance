// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.crypto.CryptoFormat
import com.finance.desktop.crypto.CryptoHoldingsSource
import com.finance.desktop.crypto.CryptoPortfolioAggregator
import com.finance.desktop.crypto.CryptoPriceSource
import com.finance.desktop.crypto.CryptoRefreshScheduler
import com.finance.desktop.crypto.CryptoTaxEngine
import com.finance.desktop.crypto.CryptoTaxEventSource
import com.finance.desktop.crypto.DeFiHoldingsSource
import com.finance.desktop.crypto.DeFiPortfolioAggregator
import com.finance.desktop.crypto.LockState
import com.finance.desktop.crypto.LotMethod
import com.finance.desktop.crypto.MarketDataConfig
import com.finance.desktop.crypto.MarketDataSettings
import com.finance.desktop.crypto.MockCryptoPriceSource
import com.finance.desktop.crypto.PortfolioComposition
import com.finance.desktop.crypto.SampleCryptoHoldingsSource
import com.finance.desktop.crypto.SampleCryptoTaxEventSource
import com.finance.desktop.crypto.SampleDeFiHoldingsSource
import com.finance.desktop.crypto.TaxReport
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

/** UI projection of a single DeFi position (#2172). */
data class DeFiPositionUi(
    val id: String,
    val protocol: String,
    val chain: String,
    val type: String,
    val asset: String,
    val quantity: String,
    val value: String,
    val apy: String,
    val pendingRewards: String,
    val rewardSymbol: String,
    val lockState: String,
    val isLocked: Boolean,
    val pnl: String,
    val isPnlPositive: Boolean,
    val accessibilityLabel: String,
)

/** UI projection of portfolio composition: spot vs locked vs rewards (#2172). */
data class CompositionUi(
    val spotValue: String,
    val lockedValue: String,
    val pendingRewards: String,
    val totalValue: String,
    val spotPercent: Float,
    val lockedPercent: Float,
    val rewardsPercent: Float,
)

/** UI projection of the crypto tax summary (#2168). */
data class TaxSummaryUi(
    val method: String,
    val realizedGain: String,
    val isGainPositive: Boolean,
    val shortTermGain: String,
    val longTermGain: String,
    val totalIncome: String,
    val totalFees: String,
    val openLotCount: Int,
    val eventCount: Int,
    val warnings: List<String>,
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
    // ── DeFi separation (#2172) ──
    val defiPositions: List<DeFiPositionUi> = emptyList(),
    val defiTotalValue: String = "",
    val defiPendingRewards: String = "",
    val defiWeightedApy: String = "",
    val composition: CompositionUi? = null,
    // ── Chain-aware cost basis + tax (#2168) ──
    val taxSummary: TaxSummaryUi? = null,
    val selectedLotMethod: LotMethod = LotMethod.FIFO,
    // ── Live pipeline gate (#2702) ──
    val liveFeedStatus: String = "",
    val autoRefreshEnabled: Boolean = false,
)

/**
 * Loads crypto holdings, values them against the injected [priceSource], tracks
 * DeFi positions separately from spot holdings (#2172), computes chain-aware
 * cost-basis / taxable-event summaries (#2168), and drives a gated near-real-time
 * refresh loop (#2702).
 *
 * @param holdingsSource Where spot positions come from (offline sample by default).
 * @param priceSource Near-real-time prices (offline mock by default).
 * @param defiSource DeFi positions source (offline sample by default).
 * @param taxEventSource Taxable crypto event history (offline sample by default).
 * @param settings Market-data gate; when live is disabled/unconfigured the
 *   offline sources are used (#2702).
 * @param clock Supplies "now" for staleness + relative-time labels.
 * @param currency Display currency for all monetary formatting.
 */
class CryptoDashboardViewModel(
    private val holdingsSource: CryptoHoldingsSource = SampleCryptoHoldingsSource(),
    private val priceSource: CryptoPriceSource = MockCryptoPriceSource(),
    private val defiSource: DeFiHoldingsSource = SampleDeFiHoldingsSource(),
    private val taxEventSource: CryptoTaxEventSource = SampleCryptoTaxEventSource(),
    private val settings: MarketDataSettings = MarketDataConfig.fromEnvironment(),
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val currency: Currency = Currency.USD,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(CryptoDashboardUiState())
    val uiState: StateFlow<CryptoDashboardUiState> = _uiState.asStateFlow()

    private var lotMethod: LotMethod = LotMethod.FIFO

    private val scheduler = CryptoRefreshScheduler(
        scope = viewModelScope,
        baseIntervalMs = settings.refreshIntervalMs,
        onError = { error ->
            _uiState.value = _uiState.value.copy(
                isStale = true,
                stalenessLabel = "Prices may be out of date",
                errorMessage = error.message,
            )
        },
    )

    init {
        refresh()
        // The gated live pipeline (#2702): only auto-poll when a live feed is
        // configured. The offline mock is loaded once and does not self-poll to
        // avoid pointless churn.
        if (settings.useLiveFeed) {
            startAutoRefresh()
        }
    }

    /** Starts the near-real-time polling loop (#2702). */
    fun startAutoRefresh() {
        scheduler.start { refreshSuspending() }
        _uiState.value = _uiState.value.copy(autoRefreshEnabled = true)
    }

    /** Stops the near-real-time polling loop. */
    fun stopAutoRefresh() {
        scheduler.stop()
        _uiState.value = _uiState.value.copy(autoRefreshEnabled = false)
    }

    /** Recomputes the tax report under a different [method] (#2168). */
    fun setLotMethod(method: LotMethod) {
        lotMethod = method
        refresh()
    }

    override fun onCleared() {
        scheduler.stop()
        super.onCleared()
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
        viewModelScope.launch { refreshSuspending() }
    }

    @Suppress("LongMethod") // Cohesive mapping of the full dashboard snapshot.
    private suspend fun refreshSuspending() {
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

            // ── DeFi separation (#2172) ──
            val defiSummary = DeFiPortfolioAggregator.aggregate(defiSource.positions())
            val composition = DeFiPortfolioAggregator.compose(summary.totalValueCents, defiSummary)
            val defiPositions = defiSummary.positions.map { mapDeFiPosition(it) }

            // ── Chain-aware cost basis + tax (#2168) ──
            val taxReport = CryptoTaxEngine.process(taxEventSource.events(), lotMethod)

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
                defiPositions = defiPositions,
                defiTotalValue = CurrencyFormatter.format(Cents(defiSummary.totalValueCents), currency),
                defiPendingRewards = CurrencyFormatter.format(
                    Cents(defiSummary.totalPendingRewardsCents), currency,
                ),
                defiWeightedApy = CryptoFormat.signedPercent(defiSummary.weightedApyPercent)
                    .removePrefix("+"),
                composition = mapComposition(composition),
                taxSummary = mapTaxSummary(taxReport),
                selectedLotMethod = lotMethod,
                liveFeedStatus = settings.statusLabel,
                autoRefreshEnabled = scheduler.isRunning,
            )
        } catch (e: IllegalStateException) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                isRefreshing = false,
                errorMessage = e.message ?: "Could not refresh prices",
            )
        }
    }

    private fun mapDeFiPosition(p: com.finance.desktop.crypto.DeFiPosition): DeFiPositionUi {
        val pnlWord = if (p.unrealizedPnlCents >= 0) "gain" else "loss"
        return DeFiPositionUi(
            id = p.id,
            protocol = p.protocol,
            chain = p.chain.displayName,
            type = p.type.displayName,
            asset = p.assetSymbol,
            quantity = formatQuantity(p.quantity),
            value = CurrencyFormatter.format(Cents(p.valueCents), currency),
            apy = CryptoFormat.signedPercent(p.apyPercent).removePrefix("+"),
            pendingRewards = CurrencyFormatter.format(Cents(p.pendingRewardsCents), currency),
            rewardSymbol = p.rewardSymbol,
            lockState = p.lockState.displayName,
            isLocked = p.lockState != LockState.LIQUID,
            pnl = CurrencyFormatter.format(Cents(p.unrealizedPnlCents), currency, showSign = true),
            isPnlPositive = p.unrealizedPnlCents >= 0,
            accessibilityLabel = buildString {
                append("${p.protocol} ${p.type.displayName} on ${p.chain.displayName}, ")
                append("${formatQuantity(p.quantity)} ${p.assetSymbol} ")
                append("worth ${CurrencyFormatter.format(Cents(p.valueCents), currency)}, ")
                append("${p.apyPercent} percent APY, ")
                append("${p.lockState.displayName}, ")
                append("pending rewards ${CurrencyFormatter.format(Cents(p.pendingRewardsCents), currency)} ${p.rewardSymbol}, ")
                append("$pnlWord of ${CurrencyFormatter.format(Cents(p.unrealizedPnlCents).abs(), currency)}")
            },
        )
    }

    private fun mapComposition(c: PortfolioComposition): CompositionUi = CompositionUi(
        spotValue = CurrencyFormatter.format(Cents(c.spotValueCents), currency),
        lockedValue = CurrencyFormatter.format(Cents(c.lockedValueCents), currency),
        pendingRewards = CurrencyFormatter.format(Cents(c.pendingRewardsCents), currency),
        totalValue = CurrencyFormatter.format(Cents(c.totalValueCents), currency),
        spotPercent = (c.spotPercent / 100.0).toFloat(),
        lockedPercent = (c.lockedPercent / 100.0).toFloat(),
        rewardsPercent = (c.rewardsPercent / 100.0).toFloat(),
    )

    private fun mapTaxSummary(report: TaxReport): TaxSummaryUi = TaxSummaryUi(
        method = report.method.displayName,
        realizedGain = CurrencyFormatter.format(
            Cents(report.totalRealizedGainCents), currency, showSign = true,
        ),
        isGainPositive = report.totalRealizedGainCents >= 0,
        shortTermGain = CurrencyFormatter.format(
            Cents(report.shortTermGainCents), currency, showSign = true,
        ),
        longTermGain = CurrencyFormatter.format(
            Cents(report.longTermGainCents), currency, showSign = true,
        ),
        totalIncome = CurrencyFormatter.format(Cents(report.totalIncomeCents), currency),
        totalFees = CurrencyFormatter.format(Cents(report.totalFeesCents), currency),
        openLotCount = report.openLots.size,
        eventCount = report.realizedGains.size + report.incomeEvents.size,
        warnings = report.warnings.map { it.message },
    )

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
