// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [NotificationType].
 *
 * Validates that all notification types have correct metadata,
 * unique channel IDs, and descriptive display names.
 */
class NotificationTypeTest {

    @Test
    fun `has exactly five notification types`() {
        assertEquals(5, NotificationType.entries.size)
    }

    @Test
    fun `all channel IDs are unique`() {
        val channelIds = NotificationType.entries.map { it.channelId }
        assertEquals(channelIds.size, channelIds.toSet().size)
    }

    @Test
    fun `all display names are non-empty`() {
        NotificationType.entries.forEach { type ->
            assertTrue(type.displayName.isNotBlank(), "${type.name} has blank displayName")
        }
    }

    @Test
    fun `all descriptions are non-empty`() {
        NotificationType.entries.forEach { type ->
            assertTrue(type.description.isNotBlank(), "${type.name} has blank description")
        }
    }

    @Test
    fun `all channel names are non-empty`() {
        NotificationType.entries.forEach { type ->
            assertTrue(type.channelName.isNotBlank(), "${type.name} has blank channelName")
        }
    }

    @Test
    fun `daily snapshot has correct channel ID`() {
        assertEquals("finance_daily_snapshot", NotificationType.DAILY_SNAPSHOT.channelId)
    }

    @Test
    fun `weekly insight has correct channel ID`() {
        assertEquals("finance_weekly_insight", NotificationType.WEEKLY_INSIGHT.channelId)
    }

    @Test
    fun `monthly reflection has correct channel ID`() {
        assertEquals("finance_monthly_reflection", NotificationType.MONTHLY_REFLECTION.channelId)
    }
}
