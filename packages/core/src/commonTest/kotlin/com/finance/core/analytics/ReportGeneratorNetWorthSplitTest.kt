// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tests for the division-by-zero fix in [ReportGenerator.estimateAssetLiabilitySplit] (#3710).
 *
 * The previous implementation divided by `currentAssets - currentLiabilities`,
 * which produced `Infinity`/`NaN` (and a nonsensical split) whenever current
 * assets equalled current liabilities. The fix holds liabilities constant and
 * lets assets absorb the delta, always reconstructing `netWorth` exactly with
 * both parts non-negative.
 */
class ReportGeneratorNetWorthSplitTest {

    private fun assertReconstructs(netWorth: Cents, assets: Cents, liabilities: Cents) {
        val (a, l) = ReportGenerator.estimateAssetLiabilitySplit(netWorth, assets, liabilities)
        assertTrue(a.amount >= 0L, "assets must be non-negative")
        assertTrue(l.amount >= 0L, "liabilities must be non-negative")
        assertEquals(netWorth.amount, a.amount - l.amount, "assets - liabilities must equal net worth")
    }

    @Test
    fun equalAssetsAndLiabilities_doesNotDivideByZero() {
        // Previously: (currentAssets - currentLiabilities) == 0 → Infinity.
        val (assets, liabilities) = ReportGenerator.estimateAssetLiabilitySplit(
            netWorth = Cents(30000),
            currentAssets = Cents(50000),
            currentLiabilities = Cents(50000),
        )
        assertEquals(Cents(80000), assets)
        assertEquals(Cents(50000), liabilities)
    }

    @Test
    fun zeroNetWorth_splitsCleanly() {
        assertReconstructs(Cents.ZERO, Cents(50000), Cents(50000))
    }

    @Test
    fun negativeNetWorth_withinLiabilities_staysNonNegative() {
        assertReconstructs(Cents(-20000), Cents(50000), Cents(50000))
    }

    @Test
    fun negativeNetWorth_beyondLiabilities_zerosAssets() {
        val (assets, liabilities) = ReportGenerator.estimateAssetLiabilitySplit(
            netWorth = Cents(-80000),
            currentAssets = Cents(50000),
            currentLiabilities = Cents(50000),
        )
        assertEquals(Cents.ZERO, assets)
        assertEquals(Cents(80000), liabilities)
    }

    @Test
    fun noAccounts_positiveNetWorth_allAssets() {
        val (assets, liabilities) = ReportGenerator.estimateAssetLiabilitySplit(
            netWorth = Cents(30000),
            currentAssets = Cents.ZERO,
            currentLiabilities = Cents.ZERO,
        )
        assertEquals(Cents(30000), assets)
        assertEquals(Cents.ZERO, liabilities)
    }

    @Test
    fun noAccounts_negativeNetWorth_allLiabilities() {
        val (assets, liabilities) = ReportGenerator.estimateAssetLiabilitySplit(
            netWorth = Cents(-30000),
            currentAssets = Cents.ZERO,
            currentLiabilities = Cents.ZERO,
        )
        assertEquals(Cents.ZERO, assets)
        assertEquals(Cents(30000), liabilities)
    }
}
