// SPDX-License-Identifier: BUSL-1.1

package com.finance.db

/**
 * iOS actual interface for EncryptionKeyProvider.
 * App-layer implementations should use Apple Keychain (Secure Enclave) for key management.
 */
actual interface EncryptionKeyProvider {
    /** Retrieves existing key or generates a new one via Apple Keychain. */
    actual fun getOrCreateKey(): String
    /** Checks if a key already exists in Apple Keychain. */
    actual fun hasKey(): Boolean
    /** Deletes the stored key (for crypto-shredding / account deletion). */
    actual fun deleteKey()
}
