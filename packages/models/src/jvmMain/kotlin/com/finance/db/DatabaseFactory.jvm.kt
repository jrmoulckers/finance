package com.finance.db

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import java.util.Properties

/**
 * JVM/Desktop DatabaseFactory.
 * For Windows: encryption key from DPAPI/Credential Locker.
 * For development: key from environment variable or config file.
 */
actual class DatabaseFactory(
    private val dbPath: String,
    private val keyProvider: EncryptionKeyProvider,
) {
    actual fun createDatabase(): FinanceDatabase {
        val key = keyProvider.getOrCreateKey()
        val properties = Properties().apply {
            put("cipher", "sqlcipher")
            put("key", key)
        }
        val driver = JdbcSqliteDriver(
            url = "jdbc:sqlite:$dbPath",
            properties = properties,
            schema = FinanceDatabase.Schema,
        )
        return FinanceDatabase(driver)
    }
}
