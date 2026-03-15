// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import com.finance.sync.SyncCredentials
import com.finance.sync.auth.OAuthProvider
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Verifies that toString() overrides on security-sensitive data classes
 * mask tokens, passwords, and other secret fields to prevent accidental
 * leakage in logs, exception messages, or crash reports (#357, S-8).
 */
class ToStringSecurityTest {

    // ── SyncCredentials ─────────────────────────────────────────────

    @Test
    fun syncCredentials_toString_masks_authToken() {
        val creds = SyncCredentials(
            endpointUrl = "https://sync.example.com",
            authToken = "super-secret-jwt-token",
            userId = "user-42",
        )
        val str = creds.toString()

        assertFalse(str.contains("super-secret-jwt-token"), "authToken must not appear in toString()")
        assertTrue(str.contains("*****"), "toString() must contain masked placeholder")
        assertTrue(str.contains("user-42"), "userId must appear in toString()")
        assertTrue(str.contains("https://sync.example.com"), "endpointUrl must appear in toString()")
    }

    // ── AuthSession ─────────────────────────────────────────────────

    @Test
    fun authSession_toString_masks_tokens() {
        val session = AuthSession(
            accessToken = "eyJhbGciOiJIUzI1NiJ9.access",
            refreshToken = "opaque-refresh-token-abc",
            expiresAt = Instant.fromEpochMilliseconds(1_700_000_000_000),
            userId = "user-99",
        )
        val str = session.toString()

        assertFalse(str.contains("eyJhbGciOiJIUzI1NiJ9"), "accessToken must not appear in toString()")
        assertFalse(str.contains("opaque-refresh-token-abc"), "refreshToken must not appear in toString()")
        assertTrue(str.contains("*****"), "toString() must contain masked placeholder")
        assertTrue(str.contains("user-99"), "userId must appear in toString()")
        assertTrue(str.contains("expiresAt"), "expiresAt label must appear in toString()")
    }

    // ── AuthCredentials.EmailPassword ───────────────────────────────

    @Test
    fun emailPassword_toString_masks_password() {
        val creds = AuthCredentials.EmailPassword(
            email = "alice@example.com",
            password = "P@ssw0rd!Secret",
        )
        val str = creds.toString()

        assertFalse(str.contains("P@ssw0rd!Secret"), "password must not appear in toString()")
        assertTrue(str.contains("*****"), "toString() must contain masked placeholder")
        assertTrue(str.contains("alice@example.com"), "email must appear in toString()")
    }

    // ── AuthCredentials.OAuth ───────────────────────────────────────

    @Test
    fun oauth_toString_masks_authCode_and_codeVerifier() {
        val creds = AuthCredentials.OAuth(
            provider = OAuthProvider.GOOGLE,
            authCode = "4/0AX4XfWjSecretAuthCode",
            codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        )
        val str = creds.toString()

        assertFalse(str.contains("4/0AX4XfWjSecretAuthCode"), "authCode must not appear in toString()")
        assertFalse(str.contains("dBjftJeZ4CVP"), "codeVerifier must not appear in toString()")
        assertTrue(str.contains("*****"), "toString() must contain masked placeholder")
        assertTrue(str.contains("GOOGLE"), "provider must appear in toString()")
    }

    // ── AuthCredentials.Passkey ─────────────────────────────────────

    @Test
    fun passkey_toString_masks_assertion() {
        val creds = AuthCredentials.Passkey(
            credentialId = "cred-id-123",
            assertion = "{\"authenticatorData\":\"secret-bytes\"}",
        )
        val str = creds.toString()

        assertFalse(str.contains("secret-bytes"), "assertion must not appear in toString()")
        assertTrue(str.contains("*****"), "toString() must contain masked placeholder")
        assertTrue(str.contains("cred-id-123"), "credentialId must appear in toString()")
    }

    // ── StoredTokenData ─────────────────────────────────────────────

    @Test
    fun storedTokenData_toString_masks_tokens() {
        val data = StoredTokenData(
            accessToken = "stored-access-token-xyz",
            refreshToken = "stored-refresh-token-abc",
            expiresAtMillis = 1_700_000_000_000,
            userId = "user-77",
        )
        val str = data.toString()

        assertFalse(str.contains("stored-access-token-xyz"), "accessToken must not appear in toString()")
        assertFalse(str.contains("stored-refresh-token-abc"), "refreshToken must not appear in toString()")
        assertTrue(str.contains("*****"), "toString() must contain masked placeholder")
        assertTrue(str.contains("user-77"), "userId must appear in toString()")
        assertTrue(str.contains("1700000000000"), "expiresAtMillis must appear in toString()")
    }
}
