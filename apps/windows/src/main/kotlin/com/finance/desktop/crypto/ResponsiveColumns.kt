// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

// ─────────────────────────────────────────────────────────────────────────────
// Pure responsive-layout logic — Issue #2176
//
// Maps an available width (in dp) to a layout tier and a concrete column count
// for the dashboard's adaptive grids. Kept free of Compose so the breakpoint
// rules can be unit-tested directly. Values mirror docs/design/
// responsive-breakpoints.md (tablet 640, desktop 1024, widescreen 1440).
// ─────────────────────────────────────────────────────────────────────────────

/** The four responsive tiers from the Finance breakpoint system. */
enum class LayoutTier { MOBILE, TABLET, DESKTOP, WIDESCREEN }

/**
 * Width thresholds (dp) and column rules for the crypto dashboard.
 *
 * The dashboard is built for ultrawide monitors: at [WIDESCREEN_MIN] and above
 * it fans cards out into four columns so the extra horizontal space carries
 * allocation, source breakdown, and gain/loss context side by side rather than
 * compressing everything into a single tall scroll.
 */
object DashboardLayout {
    const val TABLET_MIN: Int = 640
    const val DESKTOP_MIN: Int = 1024
    const val WIDESCREEN_MIN: Int = 1440

    /** Returns the [LayoutTier] that owns [widthDp]. */
    fun tierForWidth(widthDp: Int): LayoutTier = when {
        widthDp < TABLET_MIN -> LayoutTier.MOBILE
        widthDp < DESKTOP_MIN -> LayoutTier.TABLET
        widthDp < WIDESCREEN_MIN -> LayoutTier.DESKTOP
        else -> LayoutTier.WIDESCREEN
    }

    /** Number of summary-stat columns for the given [tier]. */
    fun summaryColumns(tier: LayoutTier): Int = when (tier) {
        LayoutTier.MOBILE -> 1
        LayoutTier.TABLET -> 2
        LayoutTier.DESKTOP -> 3
        LayoutTier.WIDESCREEN -> 4
    }

    /**
     * Number of holdings-card columns for [widthDp].
     *
     * Mobile stays single-column; each wider tier adds a column, with ultrawide
     * topping out at four so very wide monitors are actually used.
     */
    fun holdingsColumns(widthDp: Int): Int = when (tierForWidth(widthDp)) {
        LayoutTier.MOBILE -> 1
        LayoutTier.TABLET -> 2
        LayoutTier.DESKTOP -> 3
        LayoutTier.WIDESCREEN -> 4
    }

    /**
     * Whether the allocation panel and holdings panel sit side by side.
     *
     * Only desktop-class widths and above have the room; narrower tiers stack
     * the panels vertically so nothing is truncated.
     */
    fun isMultiPanel(widthDp: Int): Boolean =
        tierForWidth(widthDp) >= LayoutTier.DESKTOP

    /**
     * Fraction (0..1] of the available width given to the holdings panel when
     * [isMultiPanel] is true; the remainder goes to the allocation/context rail.
     * Ultrawide gives the rail a little more room than plain desktop.
     */
    fun holdingsPanelWeight(widthDp: Int): Float = when (tierForWidth(widthDp)) {
        LayoutTier.WIDESCREEN -> 0.62f
        else -> 0.66f
    }
}
