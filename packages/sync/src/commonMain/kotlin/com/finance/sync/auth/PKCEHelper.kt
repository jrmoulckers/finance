// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

/**
 * PKCE (Proof Key for Code Exchange) helper for OAuth 2.0 flows (#71).
 *
 * Implements RFC 7636 — the code verifier / challenge mechanism that
 * protects authorization-code grants against interception attacks.
 *
 * This is critical for mobile and SPA clients where a client secret
 * cannot be securely stored.
 *
 * @see <a href="https://datatracker.ietf.org/doc/html/rfc7636">RFC 7636</a>
 */
object PKCEHelper {

    /** Allowed characters for the code_verifier (RFC 7636 §4.1). */
    private const val VERIFIER_CHARS =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

    /** Minimum length per RFC 7636. */
    const val VERIFIER_MIN_LENGTH: Int = 43

    /** Maximum length per RFC 7636. */
    const val VERIFIER_MAX_LENGTH: Int = 128

    /** Default verifier length — 64 characters provides ~384 bits of entropy. */
    private const val DEFAULT_VERIFIER_LENGTH: Int = 64

    /**
     * Generate a cryptographically random code_verifier string.
     *
     * Per RFC 7636 §4.1, the verifier is a 43–128 character string
     * composed of unreserved URI characters [A-Z, a-z, 0-9, "-", ".", "_", "~"].
     *
     * @param length Desired length (43–128). Defaults to 64.
     * @return A random code_verifier string.
     * @throws IllegalArgumentException if [length] is outside [43, 128].
     */
    fun generateCodeVerifier(length: Int = DEFAULT_VERIFIER_LENGTH): String {
        require(length in VERIFIER_MIN_LENGTH..VERIFIER_MAX_LENGTH) {
            "Code verifier length must be between $VERIFIER_MIN_LENGTH and $VERIFIER_MAX_LENGTH, got $length"
        }

        val randomBytes = PlatformSHA256.randomBytes(length)
        return buildString(length) {
            for (i in 0 until length) {
                // Map each random byte to a valid verifier character
                val index = (randomBytes[i].toInt() and 0xFF) % VERIFIER_CHARS.length
                append(VERIFIER_CHARS[index])
            }
        }
    }

    /**
     * Compute the code_challenge from a code_verifier using S256 method.
     *
     * Per RFC 7636 §4.2:
     *   code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
     *
     * The S256 method is REQUIRED when the client supports it (and we do).
     *
     * @param verifier The code_verifier string.
     * @return The base64url-encoded SHA-256 hash (no padding).
     */
    fun generateCodeChallenge(verifier: String): String {
        val verifierBytes = verifier.encodeToByteArray()
        val sha256Hash = PlatformSHA256.sha256(verifierBytes)
        return base64UrlEncode(sha256Hash)
    }

    /**
     * Base64url encode without padding (RFC 4648 §5).
     *
     * Standard base64 with `+` → `-`, `/` → `_`, and trailing `=` removed.
     */
    internal fun base64UrlEncode(bytes: ByteArray): String {
        val table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        val result = StringBuilder()

        var i = 0
        while (i < bytes.size) {
            val b0 = bytes[i].toInt() and 0xFF
            val b1 = if (i + 1 < bytes.size) bytes[i + 1].toInt() and 0xFF else 0
            val b2 = if (i + 2 < bytes.size) bytes[i + 2].toInt() and 0xFF else 0

            result.append(table[b0 shr 2])
            result.append(table[((b0 and 0x03) shl 4) or (b1 shr 4)])

            if (i + 1 < bytes.size) {
                result.append(table[((b1 and 0x0F) shl 2) or (b2 shr 6)])
            }
            if (i + 2 < bytes.size) {
                result.append(table[b2 and 0x3F])
            }
            i += 3
        }

        return result.toString()
    }
}

/**
 * Platform-specific SHA-256 and secure random byte generation.
 *
 * Each platform (iOS, JVM, JS) must provide an `actual` implementation.
 */
expect object PlatformSHA256 {
    /**
     * Compute the SHA-256 digest of [input].
     *
     * @param input The bytes to hash.
     * @return 32-byte SHA-256 digest.
     */
    fun sha256(input: ByteArray): ByteArray

    /**
     * Generate [size] cryptographically-secure random bytes.
     *
     * @param size Number of random bytes.
     * @return Random byte array of the requested size.
     */
    fun randomBytes(size: Int): ByteArray
}
