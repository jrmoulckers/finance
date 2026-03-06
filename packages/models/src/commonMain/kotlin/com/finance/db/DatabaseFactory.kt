package com.finance.db

/**
 * Platform-specific factory for creating encrypted SQLDelight database instances.
 * Each platform implements this to provide SQLCipher-encrypted database drivers.
 */
expect class DatabaseFactory {
    /**
     * Creates an encrypted FinanceDatabase instance.
     * The encryption key is retrieved from platform-secure storage
     * (Android Keystore, Apple Keychain, DPAPI, etc.)
     */
    fun createDatabase(): FinanceDatabase
}
