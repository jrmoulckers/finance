// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

/**
 * Interface for password-based key derivation (#92).
 *
 * Declared as `expect` so each platform can supply its own `actual`
 * implementation backed by a native Argon2id library (or fallback KDF).
 *
 * The derived key is used as the household KEK seed when a user first
 * creates or joins a household.
 */
expect class PlatformKeyDerivation() {
    /**
     * Derive a 256-bit key from [password] and [salt] using Argon2id.
     *
     * Recommended parameters (tunable per platform):
     *  - Memory: 64 MiB
     *  - Iterations: 3
     *  - Parallelism: 1
     *  - Output length: 32 bytes
     *
     * @param password The user-supplied passphrase.
     * @param salt     A cryptographically-random salt (at least 16 bytes).
     * @return A 32-byte derived key.
     */
    fun deriveKey(password: String, salt: ByteArray): ByteArray
}