// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mood

/** Privacy filters that keep mood tags out of shared visibility surfaces. */
object MoodTagPrivacyFilters {
    /** Removes mood_tag unless the user explicitly opts into device sync. */
    fun filterForSync(rowData: Map<String, String?>, syncEnabled: Boolean): Map<String, String?> =
        if (syncEnabled) rowData else rowData - MoodTags.COLUMN_NAME

    /** Mood tags are never included in household-sharing payloads. */
    fun filterForHouseholdSharing(rowData: Map<String, String?>): Map<String, String?> =
        rowData - MoodTags.COLUMN_NAME

    /** Mood tags are never included in accountability-partner payloads. */
    fun filterForAccountabilityPartner(rowData: Map<String, String?>): Map<String, String?> =
        rowData - MoodTags.COLUMN_NAME

    /** Mood tags are never included in caregiver payloads. */
    fun filterForCaregiver(rowData: Map<String, String?>): Map<String, String?> =
        rowData - MoodTags.COLUMN_NAME
}

/** Store abstraction for erasing all persisted mood tags. */
fun interface MoodTagStore {
    suspend fun eraseAllMoodTags(): Int
}

/** Coordinates local erasure and resetting mood preferences. */
class MoodTagEraseService(
    private val store: MoodTagStore,
    private val savePreferences: suspend (MoodTagPreferences) -> Unit,
) {
    suspend fun eraseAll(): Int {
        val rows = store.eraseAllMoodTags()
        savePreferences(MoodTagPreferences())
        return rows
    }
}
