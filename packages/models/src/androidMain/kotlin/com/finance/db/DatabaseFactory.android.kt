package com.finance.db

import android.content.Context
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * Android DatabaseFactory using SQLCipher via AndroidX SQLite.
 * Encryption key should be retrieved from Android Keystore.
 */
actual class DatabaseFactory(
    private val context: Context,
    private val keyProvider: EncryptionKeyProvider,
) {
    actual fun createDatabase(): FinanceDatabase {
        val key = keyProvider.getOrCreateKey()
        val factory = SupportOpenHelperFactory(key.toByteArray())
        val driver = AndroidSqliteDriver(
            context = context,
            name = "finance.db",
            factory = factory,
        )
        // Schema creation handled by MigrationExecutor
        return FinanceDatabase(driver)
    }
}
