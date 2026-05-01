// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for [NotificationContentBuilder].
 *
 * Validates that:
 * - All notification types produce non-null content
 * - Content never contains sensitive financial data
 * - Titles and bodies are non-empty
 */
class NotificationContentBuilderTest {

    private val builder = NotificationContentBuilder()

    @Test
    fun `daily snapshot produces non-null content`() {
        val content = builder.build(NotificationType.DAILY_SNAPSHOT)
        assertNotNull(content)
    }

    @Test
    fun `weekly insight produces non-null content`() {
        val content = builder.build(NotificationType.WEEKLY_INSIGHT)
        assertNotNull(content)
    }

    @Test
    fun `monthly reflection produces non-null content`() {
        val content = builder.build(NotificationType.MONTHLY_REFLECTION)
        assertNotNull(content)
    }

    @Test
    fun `all content has non-empty titles`() {
        NotificationType.entries
            .filter { it != NotificationType.SYNC_STATUS }
            .forEach { type ->
                val content = builder.build(type)
                assertNotNull(content, "${type.name} returned null")
                assertTrue(content.title.isNotBlank(), "${type.name} has blank title")
            }
    }

    @Test
    fun `all content has non-empty bodies`() {
        NotificationType.entries
            .filter { it != NotificationType.SYNC_STATUS }
            .forEach { type ->
                val content = builder.build(type)
                assertNotNull(content, "${type.name} returned null")
                assertTrue(content.body.isNotBlank(), "${type.name} has blank body")
            }
    }

    @Test
    fun `no content contains dollar signs (no exact amounts on lock screen)`() {
        // Security: notifications should not show exact financial amounts
        // because they're visible on the lock screen.
        NotificationType.entries
            .filter { it != NotificationType.SYNC_STATUS }
            .forEach { type ->
                val content = builder.build(type)
                assertNotNull(content)
                assertFalse(
                    content.title.contains("$") || content.body.contains("$"),
                    "${type.name} contains dollar signs — potential sensitive data leak",
                )
            }
    }

    @Test
    fun `no content contains account numbers or card numbers`() {
        val sensitivePatterns = listOf(
            Regex("\\d{4}[- ]?\\d{4}"), // card number pattern
            Regex("\\d{8,}"),            // long number sequences
        )

        NotificationType.entries
            .filter { it != NotificationType.SYNC_STATUS }
            .forEach { type ->
                val content = builder.build(type)
                assertNotNull(content)
                val fullText = "${content.title} ${content.body}"
                sensitivePatterns.forEach { pattern ->
                    assertFalse(
                        pattern.containsMatchIn(fullText),
                        "${type.name} may contain sensitive number pattern: $fullText",
                    )
                }
            }
    }

    @Test
    fun `daily snapshot title mentions today`() {
        val content = builder.build(NotificationType.DAILY_SNAPSHOT)
        assertNotNull(content)
        assertTrue(
            content.title.contains("today", ignoreCase = true) ||
                content.title.contains("snapshot", ignoreCase = true),
        )
    }

    @Test
    fun `weekly insight title mentions week`() {
        val content = builder.build(NotificationType.WEEKLY_INSIGHT)
        assertNotNull(content)
        assertTrue(
            content.title.contains("week", ignoreCase = true),
        )
    }

    @Test
    fun `monthly reflection title mentions month`() {
        val content = builder.build(NotificationType.MONTHLY_REFLECTION)
        assertNotNull(content)
        assertTrue(
            content.title.contains("month", ignoreCase = true),
        )
    }
}
