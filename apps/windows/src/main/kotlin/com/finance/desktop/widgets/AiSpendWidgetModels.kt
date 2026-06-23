// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import com.finance.desktop.ai.BalancePrediction
import com.finance.models.types.Cents

/**
 * Connectivity state captured when an [AiSpendWidgetSnapshot] was produced.
 *
 * The widget is edge-first: it always renders from the local database, so
 * being offline never blanks the surface — it only changes the freshness
 * messaging shown to the user.
 */
enum class WidgetConnectivity { ONLINE, OFFLINE }

/**
 * Freshness of the data backing the widget, derived by the formatter from the
 * snapshot age and connectivity.
 */
enum class WidgetFreshness {
    /** Recently refreshed and online. */
    FRESH,

    /** Older than the staleness threshold — data may be out of date. */
    STALE,

    /** No connectivity — showing last-known on-device data. */
    OFFLINE,
}

/**
 * Deep-link actions a user can take from the AI spend widget. Each maps to a
 * `finance://` route understood by
 * [com.finance.desktop.navigation.DeepLinkHandler].
 *
 * @property deepLink The `finance://` URI to activate.
 * @property label Accessible action label (also used for Narrator).
 */
enum class AiWidgetAction(val deepLink: String, val label: String) {
    /** Tapping today's spend opens the transactions list. */
    VIEW_TODAY_SPEND("finance://transactions", "View today's transactions"),

    /** Tapping the predicted balance opens the accounts overview. */
    VIEW_PREDICTED_BALANCE("finance://accounts", "View accounts and balances"),

    /** A "review budgets" call-to-action for at-risk projections. */
    REVIEW_BUDGETS("finance://budgets", "Review budgets"),
}

/**
 * Raw, on-device snapshot the widget renders from.
 *
 * Produced by [AiFinanceWidgetProvider]; consumed by [AiSpendWidgetFormatter].
 * Holds un-formatted [Cents] plus the prediction and metadata needed to derive
 * freshness and privacy display.
 *
 * @property todaySpend Total expense spend recorded so far today.
 * @property prediction On-device short-horizon balance projection.
 * @property generatedAtEpochMs Wall-clock time the snapshot was produced.
 * @property connectivity Whether the device had connectivity at capture time.
 */
data class AiSpendWidgetSnapshot(
    val todaySpend: Cents,
    val prediction: BalancePrediction,
    val generatedAtEpochMs: Long,
    val connectivity: WidgetConnectivity = WidgetConnectivity.ONLINE,
)

/**
 * Fully formatted, display-ready view of the AI spend widget.
 *
 * Everything the UI needs is a `String` — the composable performs no
 * formatting, currency math, or privacy logic of its own. Sensitive amounts
 * are already masked when [isPrivacyHidden] is true.
 */
data class AiSpendWidgetDisplay(
    val title: String,
    val todaySpendLabel: String,
    val todaySpendValue: String,
    val predictedBalanceLabel: String,
    val predictedBalanceValue: String,
    val horizonCaption: String,
    val confidenceCaption: String,
    val lastUpdatedCaption: String,
    val statusMessage: String?,
    val freshness: WidgetFreshness,
    val isPrivacyHidden: Boolean,
    val isAtRisk: Boolean,
    val todaySpendAction: AiWidgetAction = AiWidgetAction.VIEW_TODAY_SPEND,
    val predictedBalanceAction: AiWidgetAction = AiWidgetAction.VIEW_PREDICTED_BALANCE,
    val primaryAction: AiWidgetAction =
        if (isAtRisk) AiWidgetAction.REVIEW_BUDGETS else AiWidgetAction.VIEW_PREDICTED_BALANCE,
) {
    /** Single-string summary used as the card's Narrator description. */
    val narratorSummary: String
        get() = buildString {
            append(title)
            append(". ")
            append(todaySpendLabel).append(": ").append(todaySpendValue).append(". ")
            append(predictedBalanceLabel).append(": ").append(predictedBalanceValue)
            append(" (").append(horizonCaption).append("). ")
            append(confidenceCaption).append(". ")
            statusMessage?.let { append(it).append(". ") }
            append(lastUpdatedCaption)
        }
}
