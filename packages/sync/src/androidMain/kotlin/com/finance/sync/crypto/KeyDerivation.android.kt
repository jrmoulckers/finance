// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Android actual for [PlatformKeyDerivation] using PBKDF2-HMAC-SHA256.
 *
 * Derives a 256-bit key from a password and salt using the JCA
 * `PBKDF2WithHmacSHA256` algorithm with 600,000 iterations per
 * OWASP 2023 recommendations. Available on Android API 26+ (minSdk 28).
 *
 * **Note:** The `expect` declaration documents Argon2id as the ideal KDF.
 * Android does not natively provide Argon2id, so we use PBKDF2 with a
 * high iteration count as the standard fallback. The Android Keystore is
 * used for *storing* derived keys (via [TokenStorage]), not for the
 * derivation itself. When a native Argon2id binding (e.g., via
 * libsodium-jni) is integrated, this implementation should be upgraded.
 *
 * @see <a href="https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html">OWASP Password Storage</a>
 */
actual class PlatformKeyDerivation actual constructor() {

    companion object {
        /** Derived key length in bits (256 bits = 32 bytes). */
        private const val KEY_LENGTH_BITS = 256

        /**
         * PBKDF2 iteration count.
         *
         * 600,000 is the OWASP-recommended minimum for PBKDF2-HMAC-SHA256
         * as of 2023. This provides adequate brute-force resistance for
         * passphrase-derived keys on modern hardware.
         */
        private const val ITERATIONS = 600_000

        /** JCA algorithm identifier for PBKDF2 with HMAC-SHA256 PRF. */
        private const val ALGORITHM = "PBKDF2WithHmacSHA256"
    }

    /**
     * Derive a 256-bit key from [password] and [salt] using PBKDF2-HMAC-SHA256.
     *
     * @param password The user-supplied passphrase.
     * @param salt     A cryptographically-random salt (at least 16 bytes recommended).
     * @return A 32-byte derived key.
     * @throws IllegalArgumentException if [salt] is empty.
     */
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        require(salt.isNotEmpty()) { "Salt must not be empty" }

        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH_BITS)
        try {
            val factory = SecretKeyFactory.getInstance(ALGORITHM)
            return factory.generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }
}
