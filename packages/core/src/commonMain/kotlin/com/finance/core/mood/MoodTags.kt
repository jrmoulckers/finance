// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mood

/** Shared alpha-tier mood tag constants and preference keys. */
object MoodTags {
    const val ENABLED_PREF_KEY = "experimental.moodTags.enabled"
    const val SYNC_ENABLED_PREF_KEY = "experimental.moodTags.syncEnabled"
    const val COLUMN_NAME = "mood_tag"

    val allowed: Set<String> = setOf("😊", "😐", "😟", "😡", "🤩", "😴")

    /** Returns true when [tag] is null or one of the six allowed emoji tags. */
    fun isAllowed(tag: String?): Boolean = tag == null || tag in allowed

    /** Returns [tag] when allowed, otherwise null. */
    fun normalize(tag: String?): String? = tag?.takeIf { it in allowed }
}

/** Persisted mood tagging preferences. Both toggles are off by default. */
data class MoodTagPreferences(
    val enabled: Boolean = false,
    val syncEnabled: Boolean = false,
) {
    val effectiveSyncEnabled: Boolean get() = enabled && syncEnabled
}

/** Neutral user-facing strings used by mood tag surfaces. */
object MoodTagCopy {
    const val SETTINGS_SECTION = "Experimental"
    const val ALLOW_LABEL = "Allow mood tags on transactions"
    const val ALLOW_DESCRIPTION = "Add an optional emoji to saved transactions."
    const val SYNC_LABEL = "Sync mood tags across my devices"
    const val SYNC_DESCRIPTION = "Keep emoji tags local unless you turn this on."
    const val ERASE_LABEL = "Erase all mood data"
    const val ERASE_CONFIRM_TITLE = "Erase all mood data?"
    const val ERASE_CONFIRM_MESSAGE = "This removes mood tags from your transactions on this device."
    const val ERASE_CONFIRM_ACTION = "Erase mood data"
    const val PICKER_LABEL = "Mood tag"
    const val PICKER_HINT = "Optional mood or energy emoji"
    const val CLEAR_LABEL = "Remove mood tag"
}
