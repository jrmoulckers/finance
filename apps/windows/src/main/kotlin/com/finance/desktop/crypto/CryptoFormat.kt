// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.math.abs

// ─────────────────────────────────────────────────────────────────────────────
// Pure presentation formatting for the crypto dashboard — Issue #2176
//
// Locale-stable, platform-free helpers for the "last updated" / staleness chip
// and signed percent labels. No java.text, no Compose — unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

object CryptoFormat {

    /**
     * A coarse "updated N ago" label for the freshness chip.
     *
     * @param deltaMs Milliseconds elapsed since the last successful update.
     */
    fun relativeUpdated(deltaMs: Long): String {
        val d = abs(deltaMs)
        return when {
            d < 5_000L -> "Updated just now"
            d < 60_000L -> "Updated ${d / 1_000L}s ago"
            d < 3_600_000L -> "Updated ${d / 60_000L}m ago"
            d < 86_400_000L -> "Updated ${d / 3_600_000L}h ago"
            else -> "Updated ${d / 86_400_000L}d ago"
        }
    }

    /**
     * Signed percent with one decimal place (locale-stable), e.g. `"+2.4%"`,
     * `"-1.8%"`, `"0.0%"`. Used so movement is conveyed in text, never by
     * colour alone.
     */
    fun signedPercent(value: Double): String {
        val rounded = (value * 10).let { kotlin.math.round(it) } / 10.0
        val sign = when {
            rounded > 0.0 -> "+"
            rounded < 0.0 -> "-"
            else -> ""
        }
        val magnitude = abs(rounded)
        val whole = magnitude.toLong()
        val tenths = (kotlin.math.round((magnitude - whole) * 10)).toLong()
        return "$sign$whole.$tenths%"
    }

    /** A short spoken-friendly direction word for screen-reader descriptions. */
    fun directionWord(value: Double): String = when {
        value > 0.0 -> "up"
        value < 0.0 -> "down"
        else -> "flat"
    }
}
