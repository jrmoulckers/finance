// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for [SecurityEvent] sealed class hierarchy.
 */
class SecurityEventTest {

    @Test
    fun `RootDetected with high confidence is CRITICAL`() {
        val event = SecurityEvent.RootDetected(
            confidence = 0.8f,
            signals = listOf("su_binary", "root_app"),
        )
        assertEquals(SecurityEvent.Severity.CRITICAL, event.severity)
        assertTrue(event.message.contains("80%"))
    }

    @Test
    fun `RootDetected with low confidence is WARNING`() {
        val event = SecurityEvent.RootDetected(
            confidence = 0.3f,
            signals = listOf("test_keys"),
        )
        assertEquals(SecurityEvent.Severity.WARNING, event.severity)
    }

    @Test
    fun `DebuggerAttached is CRITICAL`() {
        assertEquals(SecurityEvent.Severity.CRITICAL, SecurityEvent.DebuggerAttached.severity)
    }

    @Test
    fun `EmulatorDetected is WARNING`() {
        assertEquals(SecurityEvent.Severity.WARNING, SecurityEvent.EmulatorDetected.severity)
    }

    @Test
    fun `TamperDetected is CRITICAL`() {
        assertEquals(SecurityEvent.Severity.CRITICAL, SecurityEvent.TamperDetected.severity)
    }

    @Test
    fun `AppCloningDetected is WARNING`() {
        assertEquals(SecurityEvent.Severity.WARNING, SecurityEvent.AppCloningDetected.severity)
    }

    @Test
    fun `all events have non-empty messages`() {
        val events: List<SecurityEvent> = listOf(
            SecurityEvent.RootDetected(0.5f, listOf("su_binary")),
            SecurityEvent.DebuggerAttached,
            SecurityEvent.EmulatorDetected,
            SecurityEvent.TamperDetected,
            SecurityEvent.AppCloningDetected,
            SecurityEvent.SuspiciousAccessibilityService,
        )
        events.forEach { event ->
            assertTrue(event.message.isNotBlank(), "Event ${event::class.simpleName} has blank message")
        }
    }
}
