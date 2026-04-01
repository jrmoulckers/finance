// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.finance.sync.crypto

import kotlinx.cinterop.addressOf
import kotlinx.cinterop.convert
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.usePinned
import platform.CoreCrypto.CCKeyDerivationPBKDF
import platform.CoreCrypto.kCCPBKDF2
import platform.CoreCrypto.kCCPRFHmacAlgSHA256
import platform.CoreCrypto.kCCSuccess

/**
 * iOS actual for [PlatformKeyDerivation] using CommonCrypto's PBKDF2.
 *
 * Derives a 256-bit key from a password and salt using PBKDF2-HMAC-SHA256.
 * Uses 600,000 iterations per OWASP 2023 recommendations for PBKDF2-HMAC-SHA256.
 *
 * **Note:** The `expect` declaration documents Argon2id as the ideal KDF.
 * iOS's CommonCrypto does not natively provide Argon2id, so we use PBKDF2
 * with a high iteration count as the fallback. When a native Argon2id binding
 * (e.g., via libsodium/Swift Crypto) is integrated, this implementation
 * should be upgraded. The 600k-iteration PBKDF2 provides comparable
 * resistance for the passphrase-based key derivation use case.
 *
 * @see <a href="https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html">OWASP Password Storage</a>
 */
actual class PlatformKeyDerivation actual constructor() {

    companion object {
        /** Derived key length in bytes (256 bits). */
        private const val KEY_LENGTH = 32

        /**
         * PBKDF2 iteration count.
         *
         * 600,000 is the OWASP-recommended minimum for PBKDF2-HMAC-SHA256
         * as of 2023. This provides adequate brute-force resistance for
         * passphrase-derived keys on modern hardware.
         */
        private const val ITERATIONS = 600_000
    }

    /**
     * Derive a 256-bit key from [password] and [salt] using PBKDF2-HMAC-SHA256.
     *
     * @param password The user-supplied passphrase.
     * @param salt     A cryptographically-random salt (at least 16 bytes recommended).
     * @return A 32-byte derived key.
     * @throws IllegalArgumentException if [salt] is empty.
     * @throws IllegalStateException if the native CCKeyDerivationPBKDF call fails.
     */
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        require(salt.isNotEmpty()) { "Salt must not be empty" }

        val derivedKey = ByteArray(KEY_LENGTH)
        val passwordBytes = password.encodeToByteArray()

        passwordBytes.usePinned { pinnedPassword ->
            salt.usePinned { pinnedSalt ->
                derivedKey.usePinned { pinnedKey ->
                    val result = CCKeyDerivationPBKDF(
                        kCCPBKDF2,
                        pinnedPassword.addressOf(0).reinterpret(),
                        passwordBytes.size.convert(),
                        pinnedSalt.addressOf(0).reinterpret(),
                        salt.size.convert(),
                        kCCPRFHmacAlgSHA256,
                        ITERATIONS.toUInt(),
                        pinnedKey.addressOf(0).reinterpret(),
                        KEY_LENGTH.convert(),
                    )
                    check(result == kCCSuccess) {
                        "PBKDF2 key derivation failed with error code: $result"
                    }
                }
            }
        }

        return derivedKey
    }
}