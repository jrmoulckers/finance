// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mood

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MoodTagPrivacyFiltersTest {
    private val row = mapOf("id" to "txn-1", "mood_tag" to "😊", "amount" to "1200")

    @Test fun syncFilter_removesMoodTagWhenSyncOff() {
        val filtered = MoodTagPrivacyFilters.filterForSync(row, syncEnabled = false)
        assertFalse("mood_tag" in filtered)
    }

    @Test fun syncFilter_keepsMoodTagWhenSyncOn() {
        val filtered = MoodTagPrivacyFilters.filterForSync(row, syncEnabled = true)
        assertEquals("😊", filtered["mood_tag"])
    }

    @Test fun householdAndVisibilityFiltersAlwaysRemoveMoodTag() {
        assertFalse("mood_tag" in MoodTagPrivacyFilters.filterForHouseholdSharing(row))
        assertFalse("mood_tag" in MoodTagPrivacyFilters.filterForAccountabilityPartner(row))
        assertFalse("mood_tag" in MoodTagPrivacyFilters.filterForCaregiver(row))
    }

    @Test fun preferencesDefaultOff() {
        val prefs = MoodTagPreferences()
        assertFalse(prefs.enabled)
        assertFalse(prefs.syncEnabled)
        assertFalse(prefs.effectiveSyncEnabled)
    }

    @Test fun allowedTagsAreSixEmoji() {
        assertEquals(6, MoodTags.allowed.size)
        assertTrue(MoodTags.isAllowed("😴"))
        assertFalse(MoodTags.isAllowed("x"))
    }
}
