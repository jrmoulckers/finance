package com.finance.sync.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Tests for [PKCEHelper] — verifier format and challenge computation (#71).
 *
 * These tests validate RFC 7636 compliance for the PKCE code verifier
 * and code challenge generation.
 */
class PKCEHelperTest {

    // =========================================================================
    // Code verifier format tests
    // =========================================================================

    @Test
    fun `generateCodeVerifier produces string of requested length`() {
        val verifier = PKCEHelper.generateCodeVerifier(64)
        assertEquals(64, verifier.length)
    }

    @Test
    fun `generateCodeVerifier default length is within RFC bounds`() {
        val verifier = PKCEHelper.generateCodeVerifier()
        assertTrue(
            verifier.length in PKCEHelper.VERIFIER_MIN_LENGTH..PKCEHelper.VERIFIER_MAX_LENGTH,
            "Default verifier length ${verifier.length} must be in [${PKCEHelper.VERIFIER_MIN_LENGTH}, ${PKCEHelper.VERIFIER_MAX_LENGTH}]",
        )
    }

    @Test
    fun `generateCodeVerifier at minimum length 43`() {
        val verifier = PKCEHelper.generateCodeVerifier(43)
        assertEquals(43, verifier.length)
    }

    @Test
    fun `generateCodeVerifier at maximum length 128`() {
        val verifier = PKCEHelper.generateCodeVerifier(128)
        assertEquals(128, verifier.length)
    }

    @Test
    fun `generateCodeVerifier rejects length below 43`() {
        assertFailsWith<IllegalArgumentException> {
            PKCEHelper.generateCodeVerifier(42)
        }
    }

    @Test
    fun `generateCodeVerifier rejects length above 128`() {
        assertFailsWith<IllegalArgumentException> {
            PKCEHelper.generateCodeVerifier(129)
        }
    }

    @Test
    fun `generateCodeVerifier contains only unreserved URI characters`() {
        // RFC 7636 §4.1: ALPHA / DIGIT / "-" / "." / "_" / "~"
        val allowedPattern = Regex("^[A-Za-z0-9\\-._~]+$")
        // Generate several verifiers to increase coverage
        repeat(10) {
            val verifier = PKCEHelper.generateCodeVerifier()
            assertTrue(
                allowedPattern.matches(verifier),
                "Verifier contains illegal characters: $verifier",
            )
        }
    }

    @Test
    fun `generateCodeVerifier produces different values on subsequent calls`() {
        val verifiers = (1..5).map { PKCEHelper.generateCodeVerifier() }.toSet()
        // With 64 chars of randomness, collisions are astronomically unlikely
        assertTrue(
            verifiers.size > 1,
            "Expected unique verifiers but got duplicates",
        )
    }

    // =========================================================================
    // Code challenge computation tests
    // =========================================================================

    @Test
    fun `generateCodeChallenge produces non-empty base64url string`() {
        val verifier = PKCEHelper.generateCodeVerifier()
        val challenge = PKCEHelper.generateCodeChallenge(verifier)
        assertTrue(challenge.isNotEmpty(), "Challenge must not be empty")
    }

    @Test
    fun `generateCodeChallenge output contains only base64url characters`() {
        // base64url: A-Z, a-z, 0-9, -, _ (no + / =)
        val base64urlPattern = Regex("^[A-Za-z0-9\\-_]+$")
        val verifier = PKCEHelper.generateCodeVerifier()
        val challenge = PKCEHelper.generateCodeChallenge(verifier)
        assertTrue(
            base64urlPattern.matches(challenge),
            "Challenge contains non-base64url characters: $challenge",
        )
    }

    @Test
    fun `generateCodeChallenge has no padding characters`() {
        val verifier = PKCEHelper.generateCodeVerifier()
        val challenge = PKCEHelper.generateCodeChallenge(verifier)
        assertFalse(
            challenge.contains("="),
            "Challenge must not contain base64 padding",
        )
    }

    @Test
    fun `generateCodeChallenge is deterministic for same input`() {
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        val challenge1 = PKCEHelper.generateCodeChallenge(verifier)
        val challenge2 = PKCEHelper.generateCodeChallenge(verifier)
        assertEquals(challenge1, challenge2, "Same verifier must produce same challenge")
    }

    @Test
    fun `generateCodeChallenge length is 43 characters for SHA-256`() {
        // SHA-256 produces 32 bytes → base64url without padding = 43 chars
        val verifier = PKCEHelper.generateCodeVerifier()
        val challenge = PKCEHelper.generateCodeChallenge(verifier)
        assertEquals(43, challenge.length, "SHA-256 base64url should be 43 chars, got ${challenge.length}")
    }

    @Test
    fun `generateCodeChallenge matches RFC 7636 Appendix B test vector`() {
        // From RFC 7636 Appendix B:
        //   code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        //   code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        val expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        val actualChallenge = PKCEHelper.generateCodeChallenge(verifier)
        assertEquals(
            expectedChallenge,
            actualChallenge,
            "Challenge must match RFC 7636 Appendix B test vector",
        )
    }

    // =========================================================================
    // base64UrlEncode tests
    // =========================================================================

    @Test
    fun `base64UrlEncode encodes empty array`() {
        assertEquals("", PKCEHelper.base64UrlEncode(byteArrayOf()))
    }

    @Test
    fun `base64UrlEncode uses dash and underscore instead of plus and slash`() {
        val result = PKCEHelper.base64UrlEncode(byteArrayOf(0xFB.toByte(), 0xFF.toByte(), 0xFE.toByte()))
        assertTrue(!result.contains("+"), "Must not contain '+'")
        assertTrue(!result.contains("/"), "Must not contain '/'")
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Needed because kotlin.test doesn't include assertFalse in all targets. */
    private fun assertFalse(condition: Boolean, message: String) {
        assertTrue(!condition, message)
    }
}
