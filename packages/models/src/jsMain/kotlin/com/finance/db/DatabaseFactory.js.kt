// SPDX-License-Identifier: BUSL-1.1

package com.finance.db

import app.cash.sqldelight.driver.worker.WebWorkerDriver
import org.w3c.dom.Worker

/**
 * JS/Web DatabaseFactory using SQLDelight's web-worker-driver.
 *
 * The database runs inside a Web Worker via sql.js (SQLite compiled to WASM),
 * keeping all SQL execution off the main thread. Data is currently held
 * in-memory; OPFS-backed persistence is a planned follow-up.
 *
 * Encryption is accepted via [EncryptionKeyProvider] but not yet applied.
 * A concrete Web Crypto API implementation of [EncryptionKeyProvider] is
 * required before encryption can be wired in (tracked separately).
 */
actual class DatabaseFactory(
    @Suppress("unused")
    private val keyProvider: EncryptionKeyProvider,
) {
    /**
     * Creates a [FinanceDatabase] backed by a [WebWorkerDriver].
     *
     * The returned database is ready for use; schema creation and
     * migrations are handled separately by [MigrationExecutor].
     */
    actual fun createDatabase(): FinanceDatabase {
        val worker = Worker(
            js(
                """new URL("@cashapp/sqldelight-sqljs-worker/sqljs.worker.js", import.meta.url)"""
            )
        )
        val driver = WebWorkerDriver(worker)
        return FinanceDatabase(driver)
    }
}
