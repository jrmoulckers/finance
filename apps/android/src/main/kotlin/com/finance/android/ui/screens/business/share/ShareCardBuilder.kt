// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.share

import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency

/** The kind of celebratory moment a teen can share (#2210). */
enum class WinType(val label: String, val emoji: String) {
    GOAL_MILESTONE("Goal milestone", "\uD83C\uDFAF"),
    GOAL_COMPLETE("Goal complete", "\uD83C\uDFC6"),
    BADGE_UNLOCK("Badge unlocked", "\uD83C\uDF96\uFE0F"),
    STREAK_MILESTONE("Streak", "\uD83D\uDD25"),
}

/**
 * A shareable win. Dollar figures are optional and never leave the device
 * unless the teen explicitly opts to include them (#2210).
 */
data class ShareableWin(
    val id: String,
    val type: WinType,
    val title: String,
    /** 0..100 progress for goal milestones; ignored for badges. */
    val percentComplete: Int = 0,
    /** Optional streak length in days for [WinType.STREAK_MILESTONE]. */
    val streakDays: Int = 0,
    /** The private amounts — only ever surfaced when [ShareCardOptions.hideAmounts] is false. */
    val savedAmount: Cents = Cents.ZERO,
    val goalAmount: Cents = Cents.ZERO,
)

/**
 * Privacy controls the teen sets before sharing. Defaults are the safest:
 * amounts hidden, percent shown, no linked balances (#2210).
 */
data class ShareCardOptions(
    val hideAmounts: Boolean = true,
    val showPercentOnly: Boolean = true,
)

/**
 * Builds privacy-safe share text and card captions for teen wins (#2210).
 *
 * The core privacy guarantee lives here: when [ShareCardOptions.hideAmounts]
 * is true (the default), no dollar figure ever appears in the generated text,
 * so a screenshot or share-sheet payload cannot leak balances.
 */
object ShareCardBuilder {

    /**
     * Generate the caption body for [win] under [options]. Never includes an
     * amount when [ShareCardOptions.hideAmounts] is set.
     */
    fun caption(win: ShareableWin, options: ShareCardOptions): String {
        val headline = when (win.type) {
            WinType.GOAL_MILESTONE ->
                "${win.type.emoji} ${win.percentComplete}% of the way to ${win.title}!"
            WinType.GOAL_COMPLETE ->
                "${win.type.emoji} I hit my ${win.title} goal!"
            WinType.BADGE_UNLOCK ->
                "${win.type.emoji} Unlocked the “${win.title}” badge!"
            WinType.STREAK_MILESTONE ->
                "${win.type.emoji} ${win.streakDays}-day saving streak on ${win.title}!"
        }

        val detail = when {
            options.hideAmounts && win.type == WinType.GOAL_MILESTONE && !options.showPercentOnly ->
                ""
            !options.hideAmounts && win.goalAmount.amount > 0L ->
                " (${CurrencyFormatter.format(win.savedAmount, Currency.USD)} of " +
                    "${CurrencyFormatter.format(win.goalAmount, Currency.USD)})"
            else -> ""
        }

        return "$headline$detail #SavingsWin"
    }

    /**
     * The full share-sheet payload. Appends a non-identifying app tag but never
     * a balance, account, or deep link to private data.
     */
    fun shareText(win: ShareableWin, options: ShareCardOptions): String =
        "${caption(win, options)}\nTracked with Finance."

    /**
     * Whether the current options are guaranteed not to expose any private
     * dollar amount — used to show the "Private" safety indicator (#2210).
     */
    fun isFullyPrivate(options: ShareCardOptions): Boolean = options.hideAmounts
}
