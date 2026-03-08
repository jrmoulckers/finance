// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

/**
 * Represents an encrypted payload containing the ciphertext and all metadata
 * needed to decrypt it.
 *
 * Part of the E2E encryption layer for sensitive financial fields (#92).
 */
data class EncryptedPayload(
    /** The encrypted data. */
    val ciphertext: ByteArray,
    /** The nonce/initialization vector used during encryption. */
    val nonce: ByteArray,
    /** The algorithm identifier (e.g. "AES-256-GCM"). */
    val algorithm: String,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other == null || other !is EncryptedPayload) return false
        return ciphertext.contentEquals(other.ciphertext) &&
            nonce.contentEquals(other.nonce) &&
            algorithm == other.algorithm
    }

    override fun hashCode(): Int {
        var result = ciphertext.contentHashCode()
        result = 31 * result + nonce.contentHashCode()
        result = 31 * result + algorithm.hashCode()
        return result
    }
}