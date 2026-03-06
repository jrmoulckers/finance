package com.finance.db

/**
 * JS/Web DatabaseFactory using SQLite-WASM with OPFS persistence.
 * Encryption handled at the WASM level or via Web Crypto API.
 */
actual class DatabaseFactory(
    private val keyProvider: EncryptionKeyProvider,
) {
    actual fun createDatabase(): FinanceDatabase {
        // Web implementation will use sql.js-httpvfs or wa-sqlite with OPFS
        // SQLCipher-WASM provides encryption at the WASM level
        TODO("Web database factory implementation requires WASM SQLite setup")
    }
}
