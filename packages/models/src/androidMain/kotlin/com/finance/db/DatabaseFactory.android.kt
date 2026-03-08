// SPDX-License-Identifier: BUSL-1.1

package com.finance.db

import android.content.Context
import app.cash.sqldelight.db.AfterVersion
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
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
            schema = NoOpSchema,
            context = context,
            name = "finance.db",
            factory = factory,
        )
        // Real schema creation handled by MigrationExecutor
        return FinanceDatabase(driver)
    }
}

/** No-op schema — migrations are handled by MigrationExecutor, not the driver. */
private object NoOpSchema : SqlSchema<QueryResult.Value<Unit>> {
    override val version: Long = 1
    override fun create(driver: SqlDriver) = QueryResult.Value(Unit)
    override fun migrate(
        driver: SqlDriver,
        oldVersion: Long,
        newVersion: Long,
        vararg callbacks: AfterVersion,
    ) = QueryResult.Value(Unit)
}
