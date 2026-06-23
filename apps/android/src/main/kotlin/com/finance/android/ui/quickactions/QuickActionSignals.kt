// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

/**
 * Coarse time-of-day buckets used as a ranking signal (#2396).
 *
 * Buckets are intentionally coarse so they reveal nothing precise about a
 * user's routine — only a rough sense of when common finance tasks occur.
 */
enum class TimeBucket {
    /** 05:00–10:59 — bills & planning are common. */
    MORNING,

    /** 11:00–16:59 — grocery / day-to-day spend is common. */
    MIDDAY,

    /** 17:00–21:59 — evening spend & review is common. */
    EVENING,

    /** 22:00–04:59 — low activity. */
    NIGHT,

    ;

    companion object {
        /**
         * Maps a 24-hour clock [hour] (0–23) to a [TimeBucket].
         * Values outside 0–23 are coerced.
         */
        fun fromHour(hour: Int): TimeBucket {
            val h = ((hour % 24) + 24) % 24
            return when (h) {
                in 5..10 -> MORNING
                in 11..16 -> MIDDAY
                in 17..21 -> EVENING
                else -> NIGHT
            }
        }
    }
}

/**
 * Per-action local usage statistics derived entirely on-device.
 *
 * @property activationCount How many times the user has activated this action.
 * @property recencyDays Whole days since the action was last activated, or
 *   `null` if it has never been activated.
 */
data class ActionUsage(
    val activationCount: Int = 0,
    val recencyDays: Int? = null,
)

/**
 * The complete, on-device input to the [QuickActionRanker].
 *
 * Every field is computed locally and contains **no transaction details** —
 * only aggregate counts and coarse time information. This is the privacy
 * boundary required by the acceptance criteria: nothing here is suitable for,
 * or intended to be, sent to a remote AI service.
 *
 * @property timeBucket Current coarse time-of-day bucket.
 * @property usage Per-action local usage history (recency + frequency).
 * @property pendingImportCount Number of uncategorized / pending imports
 *   awaiting review. Boosts [QuickActionType.REVIEW_IMPORTS].
 * @property upcomingBillCount Number of upcoming bills within the look-ahead
 *   window. Boosts [QuickActionType.CHECK_BILLS].
 * @property pinned Actions the user pinned (always surfaced, top of list).
 * @property disabled Actions the user disabled (never surfaced).
 * @property dismissed Actions dismissed for the current session (hidden now,
 *   eligible to return later).
 * @property modelAgeMinutes Age of the cached signal snapshot in minutes; used
 *   for the stale-model fallback. `null` means freshly computed.
 */
data class QuickActionSignals(
    val timeBucket: TimeBucket,
    val usage: Map<QuickActionType, ActionUsage> = emptyMap(),
    val pendingImportCount: Int = 0,
    val upcomingBillCount: Int = 0,
    val pinned: Set<QuickActionType> = emptySet(),
    val disabled: Set<QuickActionType> = emptySet(),
    val dismissed: Set<QuickActionType> = emptySet(),
    val modelAgeMinutes: Long? = null,
) {
    /** True when no action has ever been activated (cold-start condition). */
    val hasNoUsageHistory: Boolean
        get() = usage.values.none { it.activationCount > 0 }
}
