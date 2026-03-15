// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import com.finance.sync.auth.PlatformSHA256

/**
 * Abstraction for cryptographically-secure random byte generation.
 *
 * Platform implementations should delegate to their native CSPRNG
 * (e.g. SecureRandom on JVM, crypto.getRandomValues on JS, SecRandomCopyBytes on iOS).
 */
interface RandomProvider {
    /** Generate [size] cryptographically-random bytes. */
    fun nextBytes(size: Int): ByteArray
}

/**
 * Default [RandomProvider] backed by the platform CSPRNG.
 *
 * Delegates to [PlatformSHA256.randomBytes] which uses the platform-native
 * cryptographically-secure random number generator on each target:
 * - **JVM/Android:** `java.security.SecureRandom`
 * - **iOS:** `SecRandomCopyBytes` (via CryptoKit)
 * - **JS:** `crypto.getRandomValues` (Web Crypto API)
 */
internal object DefaultRandomProvider : RandomProvider {
    override fun nextBytes(size: Int): ByteArray =
        PlatformSHA256.randomBytes(size)
}