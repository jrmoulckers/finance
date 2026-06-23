// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import com.finance.desktop.ai.BalancePrediction
import com.finance.desktop.ai.PredictionConfidence
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for the deterministic [AiSpendWidgetFormatter].
 *
 * Covers currency formatting, freshness derivation (fresh/stale/offline),
 * privacy masking when locked, last-updated phrasing, and at-risk messaging —
 * all without a UI or a real clock.
 */
class AiSpendWidgetFormatterTest {

    private val usd = Currency.USD
    private val baseTime = 1_700_000_000_000L

    private fun snapshot(
        todaySpend: Cents = Cents(12_50),
        projected: Cents = Cents(420_00),
        willGoNegative: Boolean = false,
        generatedAt: Long = baseTime,
        connectivity: WidgetConnectivity = WidgetConnectivity.ONLINE,
        confidence: PredictionConfidence = PredictionConfidence.HIGH,
    ) = AiSpendWidgetSnapshot(
        todaySpend = todaySpend,
        prediction = BalancePrediction(
            projectedBalance = projected,
            averageDailySpend = Cents(10_00),
            horizonDays = 7,
            confidence = confidence,
            willGoNegative = willGoNegative,
            modelId = "heuristic-burnrate-v1",
        ),
        generatedAtEpochMs = generatedAt,
        connectivity = connectivity,
    )

    @Test
    fun `formats amounts and captions for a fresh snapshot`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(),
            currency = usd,
            nowEpochMs = baseTime + 60_000, // 1 minute later
            locked = false,
        )

        assertEquals("$12.50", display.todaySpendValue)
        assertEquals("+$420.00", display.predictedBalanceValue)
        assertEquals("in 7 days", display.horizonCaption)
        assertTrue(display.confidenceCaption.contains("High confidence"))
        assertEquals(WidgetFreshness.FRESH, display.freshness)
        assertEquals("Updated 1 minute ago", display.lastUpdatedCaption)
        assertNull(display.statusMessage)
        assertFalse(display.isPrivacyHidden)
    }

    @Test
    fun `masks sensitive amounts when locked`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(),
            currency = usd,
            nowEpochMs = baseTime,
            locked = true,
        )

        assertEquals(AiSpendWidgetFormatter.MASK, display.todaySpendValue)
        assertEquals(AiSpendWidgetFormatter.MASK, display.predictedBalanceValue)
        assertTrue(display.isPrivacyHidden)
        assertEquals("Hidden while locked", display.statusMessage)
        // Actions remain navigable even when masked.
        assertEquals(AiWidgetAction.VIEW_TODAY_SPEND, display.todaySpendAction)
        assertEquals(AiWidgetAction.VIEW_PREDICTED_BALANCE, display.predictedBalanceAction)
    }

    @Test
    fun `marks snapshot stale past the threshold`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(),
            currency = usd,
            nowEpochMs = baseTime + AiSpendWidgetFormatter.STALE_AFTER_MS + 1,
            locked = false,
        )

        assertEquals(WidgetFreshness.STALE, display.freshness)
        assertEquals("Data may be out of date — refresh to update", display.statusMessage)
    }

    @Test
    fun `shows offline fallback messaging`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(connectivity = WidgetConnectivity.OFFLINE),
            currency = usd,
            nowEpochMs = baseTime + 5 * 60_000,
            locked = false,
        )

        assertEquals(WidgetFreshness.OFFLINE, display.freshness)
        assertEquals("Offline — showing last known data", display.statusMessage)
        assertTrue(display.lastUpdatedCaption.startsWith("Offline · last synced"))
    }

    @Test
    fun `surfaces at-risk message and review-budgets action for negative projection`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(projected = Cents(-50_00), willGoNegative = true),
            currency = usd,
            nowEpochMs = baseTime + 60_000,
            locked = false,
        )

        assertTrue(display.isAtRisk)
        assertEquals("Heads up: balance may run low — review budgets", display.statusMessage)
        assertEquals(AiWidgetAction.REVIEW_BUDGETS, display.primaryAction)
        assertEquals("-$50.00", display.predictedBalanceValue)
    }

    @Test
    fun `narrator summary is a single coherent sentence`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(),
            currency = usd,
            nowEpochMs = baseTime,
            locked = false,
        )

        val summary = display.narratorSummary
        assertTrue(summary.contains("Today & Forecast"))
        assertTrue(summary.contains("Spent today: $12.50"))
        assertTrue(summary.contains("Predicted balance: +$420.00"))
        assertTrue(summary.contains("in 7 days"))
    }

    @Test
    fun `freshnessOf returns just now for very recent snapshot`() {
        val display = AiSpendWidgetFormatter.format(
            snapshot = snapshot(),
            currency = usd,
            nowEpochMs = baseTime,
            locked = false,
        )
        assertEquals("Updated just now", display.lastUpdatedCaption)
    }
}
