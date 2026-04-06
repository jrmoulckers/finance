// SPDX-License-Identifier: BUSL-1.1

package com.finance.db

import app.cash.sqldelight.db.AfterVersion
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import app.cash.sqldelight.driver.native.NativeSqliteDriver
import co.touchlab.sqliter.DatabaseConfiguration

/**
 * iOS DatabaseFactory using SQLCipher via native SQLite driver.
 * Encryption key should be retrieved from Apple Keychain.
 */
actual class DatabaseFactory(
    private val keyProvider: EncryptionKeyProvider,
) {
    actual fun createDatabase(): FinanceDatabase {
        val key = keyProvider.getOrCreateKey()
        val driver = NativeSqliteDriver(
            schema = NoOpSchema,
            name = "finance.db",
            onConfiguration = { config ->
                config.copy(
                    extendedConfig = DatabaseConfiguration.Extended(
                        foreignKeyConstraints = true,
                    ),
                )
            },
        )
        // Execute PRAGMA key after opening
        driver.execute(null, "PRAGMA key = '$key';", 0)
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
