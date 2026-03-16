// SPDX-License-Identifier: BUSL-1.1

package com.finance.models.types

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Tests for [SyncId] — opaque, type-safe UUID wrapper.
 *
 * Validates construction constraints and value-class equality semantics.
 */
class SyncIdTest {

    // ── Construction — valid ────────────────────────────────────────────

    @Test
    fun constructWithUuidString() {
        val id = SyncId("550e8400-e29b-41d4-a716-446655440000")
        assertEquals("550e8400-e29b-41d4-a716-446655440000", id.value)
    }

    @Test
    fun constructWithArbitraryNonBlankString() {
        // SyncId only requires non-blank — no UUID format check
        val id = SyncId("my-custom-id")
        assertEquals("my-custom-id", id.value)
    }

    @Test
    fun constructWithSingleCharacter() {
        val id = SyncId("a")
        assertEquals("a", id.value)
    }

    // ── Construction — invalid ──────────────────────────────────────────

    @Test
    fun rejectBlankString() {
        assertFailsWith<IllegalArgumentException> {
            SyncId("")
        }
    }

    @Test
    fun rejectWhitespaceOnlyString() {
        assertFailsWith<IllegalArgumentException> {
            SyncId("   ")
        }
    }

    @Test
    fun rejectTabOnlyString() {
        assertFailsWith<IllegalArgumentException> {
            SyncId("\t")
        }
    }

    @Test
    fun rejectNewlineOnlyString() {
        assertFailsWith<IllegalArgumentException> {
            SyncId("\n")
        }
    }

    // ── Equality (value class) ──────────────────────────────────────────

    @Test
    fun equalityByValue() {
        val id1 = SyncId("abc-123")
        val id2 = SyncId("abc-123")
        assertEquals(id1, id2)
    }

    @Test
    fun inequalityByValue() {
        val id1 = SyncId("abc-123")
        val id2 = SyncId("def-456")
        assertTrue(id1 != id2)
    }

    @Test
    fun hashCodeConsistency() {
        val id1 = SyncId("abc-123")
        val id2 = SyncId("abc-123")
        assertEquals(id1.hashCode(), id2.hashCode())
    }

    // ── Value access ────────────────────────────────────────────────────

    @Test
    fun valuePreservesOriginalString() {
        val original = "  leading-space-preserved"
        val id = SyncId(original)
        assertEquals(original, id.value)
    }
}
