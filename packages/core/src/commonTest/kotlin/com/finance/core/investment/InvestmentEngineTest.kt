// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.investment

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.*

class InvestmentEngineTest {

    private val now = Instant.parse("2024-06-15T12:00:00Z")
    private fun holding(id: String = "h1", sym: String = "AAPL", name: String = "Apple Inc.", ac: AssetClass = AssetClass.STOCKS, qty: Long = 10, cost: Cents = Cents(100000), value: Cents = Cents(120000), prev: Cents? = Cents(118000)) = Holding(SyncId(id), SyncId("p1"), sym, name, ac, qty, cost, value, prev, Currency.USD, now)
    private fun portfolio(holdings: List<Holding> = emptyList()) = Portfolio(SyncId("p1"), SyncId("o1"), SyncId("h1"), "Test Portfolio", holdings, Currency.USD, now, now)

    @Test fun totalReturn_positive() { assertEquals(20.0, InvestmentEngine.totalReturnPercent(holding(cost = Cents(100000), value = Cents(120000)))!!, 0.01) }
    @Test fun totalReturn_negative() { assertEquals(-20.0, InvestmentEngine.totalReturnPercent(holding(cost = Cents(100000), value = Cents(80000)))!!, 0.01) }
    @Test fun totalReturn_zeroCost() { assertNull(InvestmentEngine.totalReturnPercent(holding(cost = Cents.ZERO, value = Cents(50000)))) }

    @Test fun gainLoss_gain() { val gl = InvestmentEngine.unrealisedGainLoss(holding(cost = Cents(100000), value = Cents(150000))); assertEquals(Cents(50000), gl); assertTrue(gl.isPositive()) }
    @Test fun gainLoss_loss() { val gl = InvestmentEngine.unrealisedGainLoss(holding(cost = Cents(100000), value = Cents(70000))); assertEquals(Cents(-30000), gl); assertTrue(gl.isNegative()) }

    @Test fun dailyReturn() { assertEquals(2.0, InvestmentEngine.dailyReturnPercent(Cents(102000), Cents(100000))!!, 0.01) }
    @Test fun dailyReturn_zero() { assertNull(InvestmentEngine.dailyReturnPercent(Cents(100000), Cents.ZERO)) }

    @Test fun portfolioValue() { assertEquals(Cents(300000), InvestmentEngine.portfolioValue(portfolio(listOf(holding(id = "h1", value = Cents(100000)), holding(id = "h2", sym = "MSFT", name = "Microsoft", value = Cents(200000)))))) }
    @Test fun portfolioCostBasis() { assertEquals(Cents(230000), InvestmentEngine.portfolioCostBasis(portfolio(listOf(holding(id = "h1", cost = Cents(80000)), holding(id = "h2", sym = "MSFT", name = "Microsoft", cost = Cents(150000)))))) }
    @Test fun portfolioGainLoss() { assertEquals(Cents(10000), InvestmentEngine.portfolioGainLoss(portfolio(listOf(holding(id = "h1", cost = Cents(80000), value = Cents(100000)), holding(id = "h2", sym = "MSFT", name = "Microsoft", cost = Cents(150000), value = Cents(140000)))))) }
    @Test fun portfolioReturn() { assertEquals(10.0, InvestmentEngine.portfolioReturnPercent(portfolio(listOf(holding(id = "h1", cost = Cents(100000), value = Cents(110000)))))!!, 0.01) }

    @Test fun assetAllocation() {
        val p = portfolio(listOf(holding(id = "h1", ac = AssetClass.STOCKS, value = Cents(60000)), holding(id = "h2", sym = "AGG", name = "Bond Fund", ac = AssetClass.BONDS, value = Cents(30000)), holding(id = "h3", sym = "GLD", name = "Gold ETF", ac = AssetClass.COMMODITIES, value = Cents(10000))))
        val a = InvestmentEngine.assetAllocation(p)
        assertEquals(60.0, a[AssetClass.STOCKS]!!, 0.01); assertEquals(30.0, a[AssetClass.BONDS]!!, 0.01); assertEquals(10.0, a[AssetClass.COMMODITIES]!!, 0.01)
    }
    @Test fun assetAllocation_empty() { assertTrue(InvestmentEngine.assetAllocation(portfolio()).isEmpty()) }

    @Test fun topHoldings() {
        val p = portfolio(listOf(holding(id = "h1", sym = "AAPL", name = "Apple", value = Cents(50000)), holding(id = "h2", sym = "MSFT", name = "Microsoft", value = Cents(100000)), holding(id = "h3", sym = "GOOG", name = "Google", value = Cents(75000))))
        val top2 = InvestmentEngine.topHoldings(p, 2); assertEquals(2, top2.size); assertEquals("MSFT", top2[0].symbol)
    }

    @Test fun topGainers() {
        val p = portfolio(listOf(holding(id = "h1", sym = "AAPL", name = "Apple", cost = Cents(80000), value = Cents(100000)), holding(id = "h2", sym = "MSFT", name = "Microsoft", cost = Cents(100000), value = Cents(90000)), holding(id = "h3", sym = "GOOG", name = "Google", cost = Cents(50000), value = Cents(80000))))
        val g = InvestmentEngine.topGainers(p, 5); assertEquals(2, g.size); assertTrue(g.all { it.gainLoss.isPositive() }); assertEquals("GOOG", g[0].holding.symbol)
    }

    @Test fun topLosers() {
        val p = portfolio(listOf(holding(id = "h1", sym = "AAPL", name = "Apple", cost = Cents(100000), value = Cents(120000)), holding(id = "h2", sym = "META", name = "Meta", cost = Cents(100000), value = Cents(70000))))
        val l = InvestmentEngine.topLosers(p, 5); assertEquals(1, l.size); assertEquals("META", l[0].holding.symbol)
    }

    @Test fun summary() {
        val p = portfolio(listOf(holding(id = "h1", ac = AssetClass.STOCKS, cost = Cents(100000), value = Cents(130000)), holding(id = "h2", sym = "BND", name = "Bond ETF", ac = AssetClass.BONDS, cost = Cents(50000), value = Cents(52000))))
        val s = InvestmentEngine.summary(p); assertEquals(Cents(182000), s.totalValue); assertEquals(Cents(150000), s.totalCostBasis); assertEquals(Cents(32000), s.totalGainLoss); assertEquals(2, s.holdingCount); assertNotNull(s.totalReturnPercent)
    }

    @Test fun holding_blankSymbol() { assertFailsWith<IllegalArgumentException> { holding(sym = "") } }
    @Test fun holding_blankName() { assertFailsWith<IllegalArgumentException> { holding(name = "") } }
    @Test fun holding_negQty() { assertFailsWith<IllegalArgumentException> { holding(qty = -1) } }
    @Test fun holding_isProfit() { assertTrue(holding(cost = Cents(100000), value = Cents(120000)).isProfit); assertFalse(holding(cost = Cents(100000), value = Cents(80000)).isProfit) }
    @Test fun portfolio_blankName() { assertFailsWith<IllegalArgumentException> { portfolio().copy(name = "") } }
}
