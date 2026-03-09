// SPDX-License-Identifier: BUSL-1.1

package com.finance.db

import app.cash.sqldelight.driver.worker.WebWorkerDriver
import kotlinx.coroutines.test.runTest
import org.w3c.dom.Worker
import kotlin.test.Test
import kotlin.test.assertNotNull

/**
 * Integration tests for the JS platform [DatabaseFactory].
 *
 * These tests run in a browser environment (Karma) and require the
 * sql.js Web Worker to be available. The webpack config in
 * `webpack.config.d/sqljs.js` copies the worker file into the test output.
 */
class DatabaseFactoryJsTest {

    private fun createTestKeyProvider(): EncryptionKeyProvider = object : EncryptionKeyProvider {
        override fun getOrCreateKey(): String = "test-key-not-real"
        override fun hasKey(): Boolean = true
        override fun deleteKey() {}
    }

    private fun createWorker(): Worker = Worker(
        js("""new URL("@cashapp/sqldelight-sqljs-worker/sqljs.worker.js", import.meta.url)""")
    )

    @Test
    fun factory_creates_database_without_throwing() {
        val factory = DatabaseFactory(createTestKeyProvider())
        val db = factory.createDatabase()
        assertNotNull(db, "DatabaseFactory should return a non-null FinanceDatabase")
    }

    @Test
    fun schema_creates_all_tables() = runTest {
        val driver = WebWorkerDriver(createWorker())
        FinanceDatabase.Schema.create(driver).await()
        val db = FinanceDatabase(driver)

        assertNotNull(db.userQueries, "userQueries should be accessible")
        assertNotNull(db.accountQueries, "accountQueries should be accessible")
        assertNotNull(db.transactionQueries, "transactionQueries should be accessible")
        assertNotNull(db.budgetQueries, "budgetQueries should be accessible")
        assertNotNull(db.goalQueries, "goalQueries should be accessible")
        assertNotNull(db.categoryQueries, "categoryQueries should be accessible")
        assertNotNull(db.householdQueries, "householdQueries should be accessible")
        assertNotNull(db.householdMemberQueries, "householdMemberQueries should be accessible")
    }
}
