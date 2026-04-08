// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.finance.sync.auth

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.usePinned
import platform.CoreCrypto.CC_SHA256
import platform.CoreCrypto.CC_SHA256_DIGEST_LENGTH
import platform.Security.SecRandomCopyBytes
import platform.Security.errSecSuccess
import platform.Security.kSecRandomDefault

/**
 * iOS actual for [PlatformSHA256].
 *
 * Uses CommonCrypto's `CC_SHA256` for hashing and the Security framework's
 * `SecRandomCopyBytes` for cryptographically-secure random byte generation.
 *
 * Both APIs are available on all supported iOS versions (9.0+) and are
 * FIPS 140-2 validated as part of Apple's corecrypto module.
 */
actual object PlatformSHA256 {

    /**
     * Compute the SHA-256 digest of [input] using CommonCrypto.
     *
     * @param input The bytes to hash.
     * @return 32-byte SHA-256 digest.
     */
    @OptIn(ExperimentalForeignApi::class)
    actual fun sha256(input: ByteArray): ByteArray {
        val digest = UByteArray(CC_SHA256_DIGEST_LENGTH)
        input.usePinned { pinnedInput ->
            digest.usePinned { pinnedDigest ->
                CC_SHA256(
                    pinnedInput.addressOf(0),
                    input.size.toUInt(),
                    pinnedDigest.addressOf(0),
                )
            }
        }
        return digest.toByteArray()
    }

    /**
     * Generate [size] cryptographically-secure random bytes using
     * the Security framework's `SecRandomCopyBytes`.
     *
     * @param size Number of random bytes to generate.
     * @return Random byte array of the requested size.
     * @throws IllegalStateException if the system CSPRNG fails.
     */
    @OptIn(ExperimentalForeignApi::class)
    actual fun randomBytes(size: Int): ByteArray {
        require(size >= 0) { "Size must be non-negative, got $size" }
        if (size == 0) return ByteArray(0)

        val bytes = ByteArray(size)
        bytes.usePinned { pinned ->
            val status = SecRandomCopyBytes(
                kSecRandomDefault,
                size.toULong(),
                pinned.addressOf(0),
            )
            check(status == errSecSuccess) {
                "SecRandomCopyBytes failed with status: $status"
            }
        }
        return bytes
    }
}
