// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlinx.coroutines.test.runTest
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

    // =========================================================================
    // getValidToken (suspend)
    // =========================================================================

    @Test
    fun `getValidToken returns access token when stored and not expired`() = runTest {
        val session = createSession(expiresAtMillis = clock.nowMillis + 3600_000L)
        tokenManager.storeTokens(session)

        val token = tokenManager.getValidToken()
        assertNotNull(token)
        assertEquals("access-token-123", token)
    }

    @Test
    fun `getValidToken returns null when no token is stored`() = runTest {
        val token = tokenManager.getValidToken()
        assertNull(token, "Should return null when no session is stored")
    }

    @Test
    fun `getValidToken returns null when stored token is expired`() = runTest {
        val session = createSession(expiresAtMillis = clock.nowMillis - 1_000L)
        tokenManager.storeTokens(session)

        val token = tokenManager.getValidToken()
        assertNull(token, "Should return null for an expired token")
    }

    @Test
    fun `getValidToken returns null at exact expiry boundary`() = runTest {
        val session = createSession(expiresAtMillis = clock.nowMillis)
        tokenManager.storeTokens(session)

        val token = tokenManager.getValidToken()
        assertNull(token, "Should return null when token expires at exactly now")
    }

    @Test
    fun `getValidToken reflects clock advancement`() = runTest {
        val session = createSession(expiresAtMillis = clock.nowMillis + 5_000L)
        tokenManager.storeTokens(session)

        // Token is valid now
        assertNotNull(tokenManager.getValidToken())

        // Advance clock past expiry
        clock.nowMillis += 6_000L
        assertNull(tokenManager.getValidToken(), "Token should be invalid after clock advances past expiry")
    }

    // =========================================================================
    // storeSession (suspend wrapper)
    // =========================================================================

    @Test
    fun `storeSession persists tokens via TokenStorage`() = runTest {
        val session = createSession(
            accessToken = "suspend-access-token",
            refreshToken = "suspend-refresh-token",
            userId = "user-suspend",
        )

        tokenManager.storeSession(session)

        val retrieved = tokenManager.retrieveTokens()
        assertNotNull(retrieved)
        assertEquals("suspend-access-token", retrieved.accessToken)
        assertEquals("suspend-refresh-token", retrieved.refreshToken)
        assertEquals("user-suspend", retrieved.userId)
        assertEquals(session.expiresAt, retrieved.expiresAt)
    }

    @Test
    fun `storeSession overwrites previously stored session`() = runTest {
        tokenManager.storeSession(createSession(accessToken = "first"))
        tokenManager.storeSession(createSession(accessToken = "second"))

        val retrieved = tokenManager.retrieveTokens()
        assertNotNull(retrieved)
        assertEquals("second", retrieved.accessToken)
    }

    // =========================================================================
    // clearSession (suspend wrapper)
    // =========================================================================

    @Test
    fun `clearSession removes all tokens from storage`() = runTest {
        tokenManager.storeSession(createSession())
        assertNotNull(tokenManager.retrieveTokens(), "Token should exist before clearing")

        tokenManager.clearSession()
        assertNull(tokenManager.retrieveTokens(), "Token should be null after clearSession")
    }

    @Test
    fun `clearSession is safe to call when nothing is stored`() = runTest {
        // Should not throw
        tokenManager.clearSession()
        assertNull(tokenManager.retrieveTokens())
    }

    @Test
    fun `clearSession then getValidToken returns null`() = runTest {
        val session = createSession(expiresAtMillis = clock.nowMillis + 3600_000L)
        tokenManager.storeSession(session)
        assertNotNull(tokenManager.getValidToken(), "Should have a valid token")

        tokenManager.clearSession()
        assertNull(tokenManager.getValidToken(), "getValidToken should return null after clearSession")
    }

    // =========================================================================
    // Edge cases
    // =========================================================================

    @Test
    fun `multiple store-clear cycles work correctly`() = runTest {
        repeat(3) { i ->
            val session = createSession(accessToken = "token-$i")
            tokenManager.storeSession(session)
            assertEquals("token-$i", tokenManager.retrieveTokens()?.accessToken)
            tokenManager.clearSession()
            assertNull(tokenManager.retrieveTokens())
        }
    }

    @Test
    fun `isTokenExpired and shouldRefresh agree for already-expired token`() {
        val session = createSession(expiresAtMillis = clock.nowMillis - 60_000L)
        assertTrue(tokenManager.isTokenExpired(session), "Token should be expired")
        assertTrue(tokenManager.shouldRefresh(session), "Should also need refresh")
    }

    @Test
    fun `millisUntilRefresh matches shouldRefresh boundary`() {
        // At exactly the threshold: shouldRefresh is true and delay is 0
        val session = createSession(expiresAtMillis = clock.nowMillis + 120_000L)
        assertTrue(tokenManager.shouldRefresh(session))
        assertEquals(0L, tokenManager.millisUntilRefresh(session))
    }
}
