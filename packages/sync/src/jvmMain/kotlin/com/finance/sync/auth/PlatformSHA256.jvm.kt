// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

/**
 * JVM actual for [PlatformSHA256].
 *
 * Uses java.security.MessageDigest for SHA-256 and
 * java.security.SecureRandom for CSPRNG.
 */
actual object PlatformSHA256 {
    actual fun sha256(input: ByteArray): ByteArray {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        return digest.digest(input)
    }

    actual fun randomBytes(size: Int): ByteArray {
        val bytes = ByteArray(size)
        java.security.SecureRandom().nextBytes(bytes)
        return bytes
    }
}
