// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.investment

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * Investment portfolio models and performance calculation engine.
 * All monetary values use [Cents] (Long-backed). All dates use kotlinx-datetime.
 */
object InvestmentEngine {

    fun totalReturnPercent(holding: Holding): Double? {
        if (holding.costBasis.isZero()) return null
        return ((holding.currentValue.amount - holding.costBasis.amount).toDouble() / holding.costBasis.amount) * 100.0
    }

    fun unrealisedGainLoss(holding: Holding): Cents = holding.currentValue - holding.costBasis

    fun dailyReturnPercent(currentValue: Cents, previousClose: Cents): Double? {
        if (previousClose.isZero()) return null
        return ((currentValue.amount - previousClose.amount).toDouble() / previousClose.amount) * 100.0
    }

    fun portfolioValue(portfolio: Portfolio): Cents = Cents(portfolio.holdings.sumOf { it.currentValue.amount })
    fun portfolioCostBasis(portfolio: Portfolio): Cents = Cents(portfolio.holdings.sumOf { it.costBasis.amount })
    fun portfolioGainLoss(portfolio: Portfolio): Cents = portfolioValue(portfolio) - portfolioCostBasis(portfolio)

    fun portfolioReturnPercent(portfolio: Portfolio): Double? {
        val costBasis = portfolioCostBasis(portfolio)
        if (costBasis.isZero()) return null
        return ((portfolioValue(portfolio).amount - costBasis.amount).toDouble() / costBasis.amount) * 100.0
    }

    fun assetAllocation(portfolio: Portfolio): Map<AssetClass, Double> {
        val totalValue = portfolioValue(portfolio).amount
        if (totalValue == 0L) return emptyMap()
        return portfolio.holdings.groupBy { it.assetClass }.mapValues { (_, holdings) -> (holdings.sumOf { it.currentValue.amount }.toDouble() / totalValue) * 100.0 }
    }

    fun topHoldings(portfolio: Portfolio, n: Int): List<Holding> {
        require(n > 0) { "n must be positive" }
        return portfolio.holdings.sortedByDescending { it.currentValue.amount }.take(n)
    }

    fun topGainers(portfolio: Portfolio, n: Int): List<HoldingPerformance> {
        require(n > 0) { "n must be positive" }
        return portfolio.holdings.map { HoldingPerformance(it, unrealisedGainLoss(it), totalReturnPercent(it)) }.filter { it.gainLoss.isPositive() }.sortedByDescending { it.gainLoss.amount }.take(n)
    }

    fun topLosers(portfolio: Portfolio, n: Int): List<HoldingPerformance> {
        require(n > 0) { "n must be positive" }
        return portfolio.holdings.map { HoldingPerformance(it, unrealisedGainLoss(it), totalReturnPercent(it)) }.filter { it.gainLoss.isNegative() }.sortedBy { it.gainLoss.amount }.take(n)
    }

    fun summary(portfolio: Portfolio): PortfolioSummary {
        val totalValue = portfolioValue(portfolio); val costBasis = portfolioCostBasis(portfolio)
        return PortfolioSummary(portfolio.id, totalValue, costBasis, totalValue - costBasis, portfolioReturnPercent(portfolio), portfolio.holdings.size, assetAllocation(portfolio))
    }
}

@Serializable enum class AssetClass { STOCKS, BONDS, CASH, REAL_ESTATE, COMMODITIES, CRYPTO, ALTERNATIVES, OTHER }

@Serializable
data class Holding(
    val id: SyncId, val portfolioId: SyncId, val symbol: String, val name: String,
    val assetClass: AssetClass, val quantity: Long, val costBasis: Cents, val currentValue: Cents,
    val previousClose: Cents? = null, val currency: Currency = Currency.USD, val lastUpdated: Instant,
) {
    init { require(symbol.isNotBlank()) { "Holding symbol cannot be blank" }; require(name.isNotBlank()) { "Holding name cannot be blank" }; require(quantity >= 0) { "Quantity cannot be negative" } }
    val gainLoss: Cents get() = currentValue - costBasis
    val isProfit: Boolean get() = currentValue.amount > costBasis.amount
}

@Serializable
data class Portfolio(
    val id: SyncId, val ownerId: SyncId, val householdId: SyncId, val name: String,
    val holdings: List<Holding> = emptyList(), val currency: Currency = Currency.USD,
    val createdAt: Instant, val updatedAt: Instant, val deletedAt: Instant? = null,
) { init { require(name.isNotBlank()) { "Portfolio name cannot be blank" } } }

data class HoldingPerformance(val holding: Holding, val gainLoss: Cents, val returnPercent: Double?)
data class PortfolioSummary(val portfolioId: SyncId, val totalValue: Cents, val totalCostBasis: Cents, val totalGainLoss: Cents, val totalReturnPercent: Double?, val holdingCount: Int, val assetAllocation: Map<AssetClass, Double>)
