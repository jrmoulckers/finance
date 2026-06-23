// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

import android.content.SharedPreferences

/**
 * On-device persistence for predictive quick-actions (#2396).
 *
 * Stores three kinds of local state, all keyed by the non-PII
 * [QuickActionType.id]:
 *
 * - **Pinned** actions the user wants always surfaced.
 * - **Disabled** actions the user opted out of entirely.
 * - **Usage history** (activation count + last-used day) feeding the recency
 *   and frequency ranking signals.
 *
 * Everything lives on-device in the app's (encrypted) [SharedPreferences]. No
 * behavioural history is ever sent off-device, satisfying the on-device-only
 * acceptance criterion. Dismissals are deliberately **not** persisted here —
 * they are session-scoped in the ViewModel so dismissed actions can return.
 */
class QuickActionPreferences(
    private val prefs: SharedPreferences,
) {

    /** Returns the set of pinned actions. */
    fun pinned(): Set<QuickActionType> = readSet(KEY_PINNED)

    /** Returns the set of disabled actions. */
    fun disabled(): Set<QuickActionType> = readSet(KEY_DISABLED)

    /** Pins ([pinned]=true) or unpins an action. */
    fun setPinned(type: QuickActionType, pinned: Boolean) {
        val updated = pinned().toMutableSet().apply {
            if (pinned) add(type) else remove(type)
        }
        writeSet(KEY_PINNED, updated)
    }

    /** Disables an action so it is never surfaced again until re-enabled. */
    fun setDisabled(type: QuickActionType, disabled: Boolean) {
        val updated = disabled().toMutableSet().apply {
            if (disabled) add(type) else remove(type)
        }
        writeSet(KEY_DISABLED, updated)
        if (disabled) {
            // A disabled action should not keep a pin.
            setPinned(type, false)
        }
    }

    /**
     * Records one activation of [type] on day [epochDay] (days since epoch),
     * incrementing its frequency counter and refreshing its recency.
     */
    fun recordActivation(type: QuickActionType, epochDay: Long) {
        prefs.edit()
            .putInt(countKey(type), readCount(type) + 1)
            .putLong(lastDayKey(type), epochDay)
            .apply()
    }

    /**
     * Builds the per-action [ActionUsage] map relative to [todayEpochDay].
     *
     * @param todayEpochDay Current day (days since epoch) used to derive recency.
     */
    fun usage(todayEpochDay: Long): Map<QuickActionType, ActionUsage> =
        QuickActionType.entries.associateWith { type ->
            val count = readCount(type)
            val lastDay = prefs.getLong(lastDayKey(type), Long.MIN_VALUE)
            val recencyDays = if (lastDay == Long.MIN_VALUE) {
                null
            } else {
                (todayEpochDay - lastDay).coerceAtLeast(0L).toInt()
            }
            ActionUsage(activationCount = count, recencyDays = recencyDays)
        }

    private fun readCount(type: QuickActionType): Int = prefs.getInt(countKey(type), 0)

    private fun readSet(key: String): Set<QuickActionType> =
        prefs.getStringSet(key, emptySet())
            .orEmpty()
            .mapNotNull { QuickActionType.fromId(it) }
            .toSet()

    private fun writeSet(key: String, value: Set<QuickActionType>) {
        prefs.edit().putStringSet(key, value.map { it.id }.toSet()).apply()
    }

    private fun countKey(type: QuickActionType) = "qa_count_${type.id}"
    private fun lastDayKey(type: QuickActionType) = "qa_lastday_${type.id}"

    private companion object {
        const val KEY_PINNED = "qa_pinned"
        const val KEY_DISABLED = "qa_disabled"
    }
}
