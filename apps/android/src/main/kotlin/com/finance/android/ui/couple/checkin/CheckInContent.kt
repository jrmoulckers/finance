// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.checkin

import android.content.SharedPreferences
import org.json.JSONArray
import timber.log.Timber

/** How often the couple wants to be nudged for a money check-in (#2150). */
enum class CheckInFrequency(val displayName: String, val days: Int) {
    WEEKLY("Weekly", 7),
    MONTHLY("Monthly", 30),
}

/**
 * A discussion prompt for a couples money check-in.
 *
 * @property topic Short topic label used for grouping.
 * @property prompt A collaborative, non-accusatory conversation starter.
 */
data class CheckInPrompt(val topic: String, val prompt: String)

/**
 * Static, supportive content for couples money check-ins (#2150).
 *
 * Every prompt is phrased to invite conversation rather than assign blame —
 * the goal is better communication, not surveillance. The list is intentionally
 * rotated so each check-in surfaces a fresh, balanced mix.
 */
object CheckInContent {

    /** A short, warm framing shown at the top of every check-in. */
    const val INTRO =
        "A quick, judgment-free money moment for the two of you. Start with what's " +
            "going well, then talk through anything on your mind together."

    val PROMPTS: List<CheckInPrompt> = listOf(
        CheckInPrompt(
            "Fun money",
            "What feels like a fair amount of no-questions-asked \"fun money\" for each of us?",
        ),
        CheckInPrompt(
            "Account structure",
            "How are we feeling about joint vs. separate accounts right now — any changes worth trying?",
        ),
        CheckInPrompt(
            "Upcoming shared expenses",
            "What shared costs are coming up soon, and how do we want to split them?",
        ),
        CheckInPrompt(
            "Wedding",
            "Are we comfortable with our wedding spending pace, or should we adjust anything?",
        ),
        CheckInPrompt(
            "Wins",
            "What's one money thing we did well together since our last check-in?",
        ),
        CheckInPrompt(
            "Goals",
            "Does our house down-payment timeline still feel right for both of us?",
        ),
        CheckInPrompt(
            "Boundaries",
            "Is there a spending category where we'd each like a little more breathing room?",
        ),
        CheckInPrompt(
            "Stress check",
            "On a scale of calm to stressed, how is money feeling for each of us this week?",
        ),
    )

    /**
     * Returns a rotating subset of [count] prompts, seeded by [rotation] so the
     * mix changes each check-in without ever feeling random or repetitive.
     */
    fun promptsFor(rotation: Int, count: Int = 4): List<CheckInPrompt> {
        if (PROMPTS.isEmpty()) return emptyList()
        val start = ((rotation % PROMPTS.size) + PROMPTS.size) % PROMPTS.size
        return (0 until count.coerceAtMost(PROMPTS.size)).map { PROMPTS[(start + it) % PROMPTS.size] }
    }
}

/** Persisted preferences and history for couples check-ins (#2150). */
class CheckInRepository(
    private val prefs: SharedPreferences,
) {

    /** Whether check-ins are opted in (default off — this is invitation, not enforcement). */
    fun isEnabled(): Boolean = prefs.getBoolean(KEY_ENABLED, false)

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun frequency(): CheckInFrequency =
        runCatching { CheckInFrequency.valueOf(prefs.getString(KEY_FREQ, null) ?: "") }
            .getOrDefault(CheckInFrequency.WEEKLY)

    fun setFrequency(frequency: CheckInFrequency) {
        prefs.edit().putString(KEY_FREQ, frequency.name).apply()
    }

    /** Whether the couple shares neutral summaries with each other. */
    fun shareSummaries(): Boolean = prefs.getBoolean(KEY_SHARE_SUMMARY, true)

    fun setShareSummaries(share: Boolean) {
        prefs.edit().putBoolean(KEY_SHARE_SUMMARY, share).apply()
    }

    /** Epoch day of the most recent completed check-in, or null. */
    fun lastCheckInEpochDay(): Long? =
        prefs.getLong(KEY_LAST, -1L).takeIf { it >= 0L }

    /** Number of completed check-ins (drives prompt rotation). */
    fun completedCount(): Int = history().size

    /** Records a completed check-in on [epochDay]. */
    fun recordCheckIn(epochDay: Long) {
        val updated = (history() + epochDay).takeLast(MAX_HISTORY)
        val array = JSONArray()
        updated.forEach { array.put(it) }
        prefs.edit()
            .putString(KEY_HISTORY, array.toString())
            .putLong(KEY_LAST, epochDay)
            .apply()
    }

    /** Completed check-in epoch days, oldest first. */
    fun history(): List<Long> {
        val raw = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).map { array.getLong(it) }
        }.getOrElse {
            Timber.w(it, "Failed to parse check-in history")
            emptyList()
        }
    }

    private companion object {
        const val KEY_ENABLED = "couple_checkin_enabled"
        const val KEY_FREQ = "couple_checkin_frequency"
        const val KEY_SHARE_SUMMARY = "couple_checkin_share_summary"
        const val KEY_LAST = "couple_checkin_last_epoch_day"
        const val KEY_HISTORY = "couple_checkin_history_v1"
        const val MAX_HISTORY = 52
    }
}
