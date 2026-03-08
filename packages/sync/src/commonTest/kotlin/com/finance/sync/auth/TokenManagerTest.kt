// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [TokenManager] — token storage, expiry detection, and refresh timing (#70).
 *
 * Uses a [FakeClock] and [FakeTokenStorage] to make tests fully deterministic.
 */
class TokenManagerTest {

    // =========================================================================
    // Test fixtures
    // =========================================================================

    /** A controllable clock for deterministic time-based tests. */
    private class FakeClock(var nowMillis: Long = 1_000_000_000_000L) : Clock {
        override fun now(): Instant = Instant.fromEpochMilliseconds(nowMillis)
    }

    /** In-memory token storage for testing. */
    private class FakeTokenStorage : TokenStorage() {
        private var stored: StoredTokenData? = null

        override fun save(
            accessToken: String,
            refreshToken: String,
            expiresAt: Long,
            userId: String,
        ) {
            stored = StoredTokenData(accessToken, refreshToken, expiresAt, userId)
        }

        override fun load(): StoredTokenData? = stored

        override fun clear() {
            stored = null
        }
    }

    private val clock = FakeClock()
    private val storage = FakeTokenStorage()
    private val tokenManager = TokenManager(storage, clock)

    private fun createSession(
        expiresAtMillis: Long = clock.nowMillis + 3600_000L, // 1 hour from now
        accessToken: String = "access-token-123",
        refreshToken: String = "refresh-token-456",
        userId: String = "user-abc",
    ) = AuthSession(
        accessToken = accessToken,
        refreshToken = refreshToken,
        expiresAt = Instant.fromEpochMilliseconds(expiresAtMillis),
        userId = userId,
    )

    // =========================================================================
    // storeTokens / retrieveTokens
    // =========================================================================

    @Test
    fun `storeTokens persists session and retrieveTokens reconstructs it`() {
        val session = createSession()
        tokenManager.storeTokens(session)

        val retrieved = tokenManager.retrieveTokens()
        assertNotNull(retrieved)
        assertEquals(session.accessToken, retrieved.accessToken)
        assertEquals(session.refreshToken, retrieved.refreshToken)
        assertEquals(session.expiresAt, retrieved.expiresAt)
        assertEquals(session.userId, retrieved.userId)
    }

    @Test
    fun `retrieveTokens returns null when nothing stored`() {
        assertNull(tokenManager.retrieveTokens())
    }

    @Test
    fun `storeTokens overwrites previous session`() {
        tokenManager.storeTokens(createSession(accessToken = "old"))
        tokenManager.storeTokens(createSession(accessToken = "new"))

        val retrieved = tokenManager.retrieveTokens()
        assertNotNull(retrieved)
        assertEquals("new", retrieved.accessToken)
    }

    // =========================================================================
    // clearTokens
    // =========================================================================

    @Test
    fun `clearTokens removes stored tokens`() {
        tokenManager.storeTokens(createSession())
        assertNotNull(tokenManager.retrieveTokens())

        tokenManager.clearTokens()
        assertNull(tokenManager.retrieveTokens())
    }

    // =========================================================================
    // isTokenExpired
    // =========================================================================

    @Test
    fun `isTokenExpired returns false for future expiry`() {
        val session = createSession(expiresAtMillis = clock.nowMillis + 3600_000L)
        assertFalse(tokenManager.isTokenExpired(session))
    }

    @Test
    fun `isTokenExpired returns true for past expiry`() {
        val session = createSession(expiresAtMillis = clock.nowMillis - 1_000L)
        assertTrue(tokenManager.isTokenExpired(session))
    }

    @Test
    fun `isTokenExpired returns true at exact expiry instant`() {
        val session = createSession(expiresAtMillis = clock.nowMillis)
        assertTrue(tokenManager.isTokenExpired(session))
    }

    // =========================================================================
    // shouldRefresh (auto-refresh threshold = 2 min)
    // =========================================================================

    @Test
    fun `shouldRefresh returns false when token expires well in the future`() {
        // Expires in 1 hour — no refresh needed
        val session = createSession(expiresAtMillis = clock.nowMillis + 3600_000L)
        assertFalse(tokenManager.shouldRefresh(session))
    }

    @Test
    fun `shouldRefresh returns true within 2 minute window`() {
        // Expires in 90 seconds — within the 120-second threshold
        val session = createSession(expiresAtMillis = clock.nowMillis + 90_000L)
        assertTrue(tokenManager.shouldRefresh(session))
    }

    @Test
    fun `shouldRefresh returns true at exactly 2 minutes before expiry`() {
        // Expires in exactly 120 seconds
        val session = createSession(expiresAtMillis = clock.nowMillis + 120_000L)
        assertTrue(tokenManager.shouldRefresh(session))
    }

    @Test
    fun `shouldRefresh returns true for already-expired tokens`() {
        val session = createSession(expiresAtMillis = clock.nowMillis - 5_000L)
        assertTrue(tokenManager.shouldRefresh(session))
    }

    @Test
    fun `shouldRefresh returns false at 121 seconds before expiry`() {
        // Expires in 121 seconds — just outside the threshold
        val session = createSession(expiresAtMillis = clock.nowMillis + 121_000L)
        assertFalse(tokenManager.shouldRefresh(session))
    }

    // =========================================================================
    // millisUntilRefresh
    // =========================================================================

    @Test
    fun `millisUntilRefresh returns positive delay for future refresh`() {
        // Expires in 1 hour → refresh at T+3480s → delay = 3480_000ms
        val session = createSession(expiresAtMillis = clock.nowMillis + 3600_000L)
        val delay = tokenManager.millisUntilRefresh(session)
        assertEquals(3600_000L - 120_000L, delay)
    }

    @Test
    fun `millisUntilRefresh returns 0 when already past threshold`() {
        val session = createSession(expiresAtMillis = clock.nowMillis + 60_000L)
        assertEquals(0L, tokenManager.millisUntilRefresh(session))
    }

    @Test
    fun `millisUntilRefresh returns 0 for expired tokens`() {
        val session = createSession(expiresAtMillis = clock.nowMillis - 10_000L)
        assertEquals(0L, tokenManager.millisUntilRefresh(session))
    }
}
