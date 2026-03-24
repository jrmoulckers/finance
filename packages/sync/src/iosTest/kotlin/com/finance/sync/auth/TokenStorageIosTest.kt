// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class TokenStorageIosTest {
    private val storage = TokenStorage()
    private fun clearKeychain() { storage.clear() }

    @Test fun save_and_load_round_trips() {
        clearKeychain()
        storage.save("a", "r", 1000L, "u")
        val l = storage.load()
        assertNotNull(l)
        assertEquals("a", l.accessToken)
        assertEquals("r", l.refreshToken)
        assertEquals(1000L, l.expiresAtMillis)
        assertEquals("u", l.userId)
    }

    @Test fun load_returns_null_when_empty() {
        clearKeychain()
        assertNull(storage.load())
    }

    @Test fun save_overwrites() {
        clearKeychain()
        storage.save("old", "or", 1L, "ou")
        storage.save("new", "nr", 2L, "nu")
        val l = storage.load()
        assertNotNull(l)
        assertEquals("new", l.accessToken)
        assertEquals(2L, l.expiresAtMillis)
    }

    @Test fun clear_removes_tokens() {
        clearKeychain()
        storage.save("a", "r", 1L, "u")
        assertNotNull(storage.load())
        storage.clear()
        assertNull(storage.load())
    }

    @Test fun clear_is_idempotent() {
        clearKeychain()
        storage.clear()
        storage.clear()
        assertNull(storage.load())
    }

    @Test fun save_after_clear() {
        clearKeychain()
        storage.save("1", "1r", 1L, "1u")
        storage.clear()
        storage.save("2", "2r", 2L, "2u")
        val l = storage.load()
        assertNotNull(l)
        assertEquals("2", l.accessToken)
    }

    @Test fun multiple_cycles() {
        clearKeychain()
        repeat(3) { i ->
            storage.save("a$i", "r$i", i.toLong(), "u$i")
            assertEquals("a$i", storage.load()?.accessToken)
            storage.clear()
            assertNull(storage.load())
        }
    }

    @Test fun separate_instances_share_state() {
        clearKeychain()
        val s1 = TokenStorage()
        val s2 = TokenStorage()
        s1.save("a", "r", 1L, "u")
        assertEquals("a", s2.load()?.accessToken)
        s2.clear()
        assertNull(s1.load())
    }
}
