package com.finance.db

/**
 * JS/Web actual interface for EncryptionKeyProvider.
 * App-layer implementations should use Web Crypto API for key management.
 */
actual interface EncryptionKeyProvider {
    /** Retrieves existing key or generates a new one via Web Crypto API. */
    actual fun getOrCreateKey(): String
    /** Checks if a key already exists in browser storage. */
    actual fun hasKey(): Boolean
    /** Deletes the stored key (for crypto-shredding / account deletion). */
    actual fun deleteKey()
}
