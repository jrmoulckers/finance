// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.ai.PredictionConfidence
import com.finance.models.types.Currency

/**
 * Pure, deterministic formatter turning an [AiSpendWidgetSnapshot] into a
 * display-ready [AiSpendWidgetDisplay].
 *
 * All freshness, privacy-masking, and currency formatting decisions live here
 * so they can be unit-tested without a UI, a clock, or a database. The
 * composable simply renders the strings this produces.
 *
 * ## Privacy
 *
 * When [locked] is true (auto-lock engaged or lock-screen privacy required),
 * every sensitive amount is replaced with [MASK]. The structure, captions, and
 * deep-link actions remain so the surface stays glanceable and navigable
 * without leaking figures.
 *
 * ## Freshness
 *
 * Freshness is derived from snapshot age and connectivity:
 * - **OFFLINE** when the snapshot was captured without connectivity.
 * - **STALE** when older than [STALE_AFTER_MS].
 * - **FRESH** otherwise.
 */
object AiSpendWidgetFormatter {

    /** Mask shown in place of sensitive amounts when locked. */
    const val MASK = "••••"

    /** Snapshots older than this are considered stale. */
    const val STALE_AFTER_MS = 30 * 60 * 1000L

    private const val TITLE = "Today & Forecast"

    fun format(
        snapshot: AiSpendWidgetSnapshot,
        currency: Currency,
        nowEpochMs: Long,
        locked: Boolean,
    ): AiSpendWidgetDisplay {
        val freshness = freshnessOf(snapshot, nowEpochMs)
        val prediction = snapshot.prediction
        val atRisk = prediction.willGoNegative

        val todaySpendValue = if (locked) {
            MASK
        } else {
            CurrencyFormatter.format(snapshot.todaySpend.abs(), currency)
        }
        val predictedBalanceValue = if (locked) {
            MASK
        } else {
            CurrencyFormatter.format(prediction.projectedBalance, currency, showSign = true)
        }

        return AiSpendWidgetDisplay(
            title = TITLE,
            todaySpendLabel = "Spent today",
            todaySpendValue = todaySpendValue,
            predictedBalanceLabel = "Predicted balance",
            predictedBalanceValue = predictedBalanceValue,
            horizonCaption = horizonCaption(prediction.horizonDays),
            confidenceCaption = confidenceCaption(prediction.confidence),
            lastUpdatedCaption = lastUpdatedCaption(snapshot, nowEpochMs, freshness),
            statusMessage = statusMessage(freshness, atRisk, locked),
            freshness = freshness,
            isPrivacyHidden = locked,
            isAtRisk = atRisk,
        )
    }

    /** Derives [WidgetFreshness] from connectivity and snapshot age. */
    fun freshnessOf(snapshot: AiSpendWidgetSnapshot, nowEpochMs: Long): WidgetFreshness {
        if (snapshot.connectivity == WidgetConnectivity.OFFLINE) return WidgetFreshness.OFFLINE
        val ageMs = nowEpochMs - snapshot.generatedAtEpochMs
        return if (ageMs >= STALE_AFTER_MS) WidgetFreshness.STALE else WidgetFreshness.FRESH
    }

    private fun horizonCaption(horizonDays: Int): String = when (horizonDays) {
        1 -> "in 1 day"
        7 -> "in 7 days"
        else -> "in $horizonDays days"
    }

    private fun confidenceCaption(confidence: PredictionConfidence): String =
        "On-device estimate · ${confidence.label}"

    private fun statusMessage(
        freshness: WidgetFreshness,
        atRisk: Boolean,
        locked: Boolean,
    ): String? = when {
        locked -> "Hidden while locked"
        freshness == WidgetFreshness.OFFLINE ->
            "Offline — showing last known data"
        freshness == WidgetFreshness.STALE ->
            "Data may be out of date — refresh to update"
        atRisk -> "Heads up: balance may run low — review budgets"
        else -> null
    }

    private fun lastUpdatedCaption(
        snapshot: AiSpendWidgetSnapshot,
        nowEpochMs: Long,
        freshness: WidgetFreshness,
    ): String {
        if (freshness == WidgetFreshness.OFFLINE) return "Offline · last synced ${relativeTime(snapshot, nowEpochMs)}"
        return "Updated ${relativeTime(snapshot, nowEpochMs)}"
    }

    private fun relativeTime(snapshot: AiSpendWidgetSnapshot, nowEpochMs: Long): String {
        val ageMs = (nowEpochMs - snapshot.generatedAtEpochMs).coerceAtLeast(0)
        val minutes = ageMs / 60_000
        return when {
            minutes <= 0 -> "just now"
            minutes == 1L -> "1 minute ago"
            minutes < 60 -> "$minutes minutes ago"
            minutes < 120 -> "1 hour ago"
            else -> "${minutes / 60} hours ago"
        }
    }
}
