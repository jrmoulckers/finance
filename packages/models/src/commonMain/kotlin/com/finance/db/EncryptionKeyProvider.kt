package com.finance.db

/**
 * Platform-specific provider for database encryption keys.
 * Implementations use platform secure storage:
 * - Android: Android Keystore
 * - iOS: Apple Keychain (Secure Enclave)
 * - Windows/JVM: DPAPI / Credential Locker
 * - Web: Web Crypto API
 */
expect interface EncryptionKeyProvider {
    /** Retrieves existing key or generates a new one securely. */
    fun getOrCreateKey(): String
    /** Checks if a key already exists. */
    fun hasKey(): Boolean
    /** Deletes the stored key (for crypto-shredding / account deletion). */
    fun deleteKey()
}
