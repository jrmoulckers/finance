package com.finance.db

/**
 * JVM actual interface for EncryptionKeyProvider.
 * App-layer implementations should use DPAPI (Windows) or platform credential storage.
 */
actual interface EncryptionKeyProvider {
    /** Retrieves existing key or generates a new one via platform credential storage. */
    actual fun getOrCreateKey(): String
    /** Checks if a key already exists in platform credential storage. */
    actual fun hasKey(): Boolean
    /** Deletes the stored key (for crypto-shredding / account deletion). */
    actual fun deleteKey()
}
