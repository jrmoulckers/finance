// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import com.finance.sync.crypto.Sha256
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Security.SecRandomCopyBytes
import platform.Security.errSecSuccess
import platform.Security.kSecRandomDefault

/**
 * iOS actual for [PlatformSHA256].
 *
 * SHA-256 uses the shared pure-Kotlin implementation so the iOS source set can
 * hash synchronously without introducing a CommonCrypto cinterop. Secure random
 * bytes come from Security.framework's `SecRandomCopyBytes`.
 */
@OptIn(ExperimentalForeignApi::class)
actual object PlatformSHA256 {
    actual fun sha256(input: ByteArray): ByteArray = Sha256.digest(input)

    actual fun randomBytes(size: Int): ByteArray {
        require(size >= 0) { "Random byte count must be non-negative, got $size" }
        if (size == 0) {
            return byteArrayOf()
        }

        val bytes = ByteArray(size)
        bytes.usePinned { pinned ->
            val status = SecRandomCopyBytes(kSecRandomDefault, size.toULong(), pinned.addressOf(0))
            check(status == errSecSuccess) { "SecRandomCopyBytes failed with status: $status" }
        }
        return bytes
    }
}
