// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong

// =============================================================================
// Narration text utilities — deterministic, locale-aware (en-US first)
// =============================================================================
//
// Pure formatting helpers shared by every narrator (the snapshot
// [TemplateNarrationGenerator] and the [ChartNarrator]). Two conventions, drawn
// from the narration contract (design §5.2) and the cockpit layout doc (§7.2):
//
//   * Money is fully spelled into words for screen-reader text
//     ("$1,240.50" -> "one thousand two hundred forty dollars and fifty cents").
//   * Percentages keep their digits and speak the symbol ("46%" -> "46 percent",
//     "5.0%" -> "5.0 percent"), matching the contract's "3.4 percent" example.
//   * Plain integer counts (days, months) and ordinal days are spelled
//     ("21 days" -> "twenty-one days", "June 25" -> "June twenty-fifth").
//
// Everything here is side-effect free and unit-tested so narration is verifiable
// with no model present at runtime.

internal object NarrationText {

    private val ONES =
        arrayOf(
            "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
            "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
            "seventeen", "eighteen", "nineteen",
        )

    private val TENS =
        arrayOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")

    private val MONTHS =
        arrayOf(
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        )

    private val ORDINALS =
        mapOf(
            1 to "first", 2 to "second", 3 to "third", 4 to "fourth", 5 to "fifth",
            6 to "sixth", 7 to "seventh", 8 to "eighth", 9 to "ninth", 10 to "tenth",
            11 to "eleventh", 12 to "twelfth", 13 to "thirteenth", 14 to "fourteenth",
            15 to "fifteenth", 16 to "sixteenth", 17 to "seventeenth", 18 to "eighteenth",
            19 to "nineteenth", 20 to "twentieth", 30 to "thirtieth",
        )

    /**
     * Banned, alarmist / shaming vocabulary derived from the Content Language
     * Guidelines (design §3, §5.4). Narration must never contain these. The
     * golden tests fail the build if any generated text includes one.
     */
    val BANNED_TERMS: List<String> =
        listOf(
            "overspent", "overspend", "over budget", "in the red", "danger",
            "behind", "deficit", "failed", "failure", "overdue", "delinquent",
            "warning", "panic", "shame", "ashamed", "disaster", "broke",
        )

    /** Returns the first banned term found in [text] (case-insensitive), or null. */
    fun firstBannedTerm(text: String): String? {
        val lower = text.lowercase(Locale.US)
        return BANNED_TERMS.firstOrNull { lower.contains(it) }
    }

    /** Capitalizes the first character (used when prose starts a new sentence). */
    fun capitalizeFirst(value: String): String =
        if (value.isEmpty()) value else value[0].uppercaseChar() + value.substring(1)

    private fun spellBelowThousand(value: Int): String {
        require(value in 0..999) { "spellBelowThousand out of range: $value" }
        return when {
            value == 0 -> ""
            value < 20 -> ONES[value]
            value < 100 -> TENS[value / 10] + if (value % 10 != 0) "-${ONES[value % 10]}" else ""
            else ->
                ONES[value / 100] + " hundred" +
                    if (value % 100 != 0) " ${spellBelowThousand(value % 100)}" else ""
        }
    }

    /** Spells a non-negative whole number into lowercase English words. */
    fun spellInt(value: Long): String =
        when {
            value < 0L -> "negative ${spellInt(-value)}"
            value == 0L -> "zero"
            else -> {
                var remaining = value
                val billions = (remaining / 1_000_000_000L).toInt(); remaining %= 1_000_000_000L
                val millions = (remaining / 1_000_000L).toInt(); remaining %= 1_000_000L
                val thousands = (remaining / 1_000L).toInt(); remaining %= 1_000L
                val rest = remaining.toInt()
                val parts = mutableListOf<String>()
                if (billions > 0) parts.add("${spellBelowThousand(billions)} billion")
                if (millions > 0) parts.add("${spellBelowThousand(millions)} million")
                if (thousands > 0) parts.add("${spellBelowThousand(thousands)} thousand")
                if (rest > 0) parts.add(spellBelowThousand(rest))
                parts.joinToString(" ")
            }
        }

    /** Spells an ordinal day of month (1..31) into words: 25 -> "twenty-fifth". */
    fun ordinalDay(day: Int): String {
        require(day in 1..31) { "ordinalDay out of range: $day" }
        ORDINALS[day]?.let { return it }
        val tens = (day / 10) * 10
        val ones = day % 10
        return spellInt(tens.toLong()) + "-" + ORDINALS.getValue(ones)
    }

    /** Inserts thousands separators: 124050 -> "124,050". */
    fun groupThousands(value: Long): String {
        val negative = value < 0
        val digits = abs(value).toString()
        val sb = StringBuilder()
        val rem = digits.length % 3
        for (i in digits.indices) {
            if (i != 0 && (i - rem) % 3 == 0) sb.append(',')
            sb.append(digits[i])
        }
        return (if (negative) "-" else "") + sb.toString()
    }

    // -- Money --------------------------------------------------------------

    /** Visible currency glyph form of integer cents: 124050 -> "$1,240.50". */
    fun formatCents(cents: Long): String {
        val negative = cents < 0
        val absCents = abs(cents)
        val dollars = absCents / 100
        val frac = absCents % 100
        val body = "$${groupThousands(dollars)}.${frac.toString().padStart(2, '0')}"
        return if (negative) "-$body" else body
    }

    /** Spelled form of integer cents: 124050 -> "one thousand … forty dollars and fifty cents". */
    fun spellCents(cents: Long): String {
        val prefix = if (cents < 0) "negative " else ""
        val absCents = abs(cents)
        val dollars = absCents / 100
        val frac = absCents % 100
        val dollarWords = "${spellInt(dollars)} dollar${if (dollars == 1L) "" else "s"}"
        return if (frac == 0L) {
            prefix + dollarWords
        } else {
            "$prefix$dollarWords and ${spellInt(frac)} cent${if (frac == 1L) "" else "s"}"
        }
    }

    /** Visible whole-dollar glyph form: 35000 -> "$35,000". */
    fun formatWholeDollars(dollars: Long): String {
        val negative = dollars < 0
        val body = "$${groupThousands(abs(dollars))}"
        return if (negative) "-$body" else body
    }

    /** Spelled whole-dollar form: 35000 -> "thirty-five thousand dollars". */
    fun spellWholeDollars(dollars: Long): String {
        val prefix = if (dollars < 0) "negative " else ""
        val absDollars = abs(dollars)
        return "$prefix${spellInt(absDollars)} dollar${if (absDollars == 1L) "" else "s"}"
    }

    // -- Percent ------------------------------------------------------------

    /** Integer percent from a 0..1 fraction: 0.56 -> 56. */
    fun percentInt(fraction: Double): Int = (fraction * 100.0).roundToInt()

    /** One-decimal value, locale-stable: 5.0 -> "5.0", 21.249 -> "21.2". */
    fun oneDecimal(value: Double): String = String.format(Locale.US, "%.1f", value)

    // -- Dates --------------------------------------------------------------

    /** Visible "Month D" from an ISO date "YYYY-MM-DD": "2026-06-25" -> "June 25". */
    fun monthDayVisible(iso: String): String {
        val (month, day) = parseMonthDay(iso)
        return "${MONTHS[month - 1]} $day"
    }

    /** Spoken "Month Dth" from an ISO date: "2026-06-25" -> "June twenty-fifth". */
    fun monthDayOrdinal(iso: String): String {
        val (month, day) = parseMonthDay(iso)
        return "${MONTHS[month - 1]} ${ordinalDay(day)}"
    }

    private fun parseMonthDay(iso: String): Pair<Int, Int> {
        val datePart = iso.substringBefore('T')
        val pieces = datePart.split('-')
        val month = pieces.getOrNull(1)?.toIntOrNull() ?: 1
        val day = pieces.getOrNull(2)?.toIntOrNull() ?: 1
        return month to day
    }

    /** Rounds a Float/Double dollar amount to whole dollars (charts use Floats). */
    fun roundDollars(value: Double): Long = value.roundToLong()
}
