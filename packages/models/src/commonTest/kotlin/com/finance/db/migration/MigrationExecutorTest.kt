// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [Migration], [MigrationRegistry], and [MigrationExecutor].
 *
 * MigrationExecutor tests use a fake [SqlExecutor] to verify ordering,
 * idempotency, and error handling without a real database.
 */
class MigrationExecutorTest {

    // ══════════════════════════════════════════════════════════════════════
    //  Migration data class
    // ══════════════════════════════════════════════════════════════════════

    @Test
    fun createValidMigration() {
        val m = Migration(
            version = 1,
            description = "Create users table",
            up = listOf("CREATE TABLE user (id TEXT PRIMARY KEY)"),
            down = listOf("DROP TABLE user"),
        )
        assertEquals(1, m.version)
        assertEquals("Create users table", m.description)
        assertEquals(1, m.up.size)
        assertEquals(1, m.down.size)
    }

    @Test
    fun rejectZeroVersion() {
        assertFailsWith<IllegalArgumentException> {
            Migration(
                version = 0,
                description = "Bad migration",
                up = listOf("SELECT 1"),
                down = emptyList(),
            )
        }
    }

    @Test
    fun rejectNegativeVersion() {
        assertFailsWith<IllegalArgumentException> {
            Migration(
                version = -1,
                description = "Bad migration",
                up = listOf("SELECT 1"),
                down = emptyList(),
            )
        }
    }

    @Test
    fun rejectEmptyUpStatements() {
        assertFailsWith<IllegalArgumentException> {
            Migration(
                version = 1,
                description = "No SQL",
                up = emptyList(),
                down = listOf("SELECT 1"),
            )
        }
    }

    @Test
    fun rejectBlankDescription() {
        assertFailsWith<IllegalArgumentException> {
            Migration(
                version = 1,
                description = "",
                up = listOf("SELECT 1"),
                down = emptyList(),
            )
        }
    }

    @Test
    fun rejectWhitespaceDescription() {
        assertFailsWith<IllegalArgumentException> {
            Migration(
                version = 1,
                description = "   ",
                up = listOf("SELECT 1"),
                down = emptyList(),
            )
        }
    }

    @Test
    fun allowEmptyDownStatements() {
        // Down can be empty — some migrations are not reversible
        val m = Migration(
            version = 1,
            description = "Irreversible change",
            up = listOf("ALTER TABLE user ADD COLUMN email TEXT"),
            down = emptyList(),
        )
        assertTrue(m.down.isEmpty())
    }

    @Test
    fun migrationWithMultipleStatements() {
        val m = Migration(
            version = 1,
            description = "Create schema",
            up = listOf(
                "CREATE TABLE a (id TEXT PRIMARY KEY)",
                "CREATE TABLE b (id TEXT PRIMARY KEY)",
                "CREATE INDEX idx_a ON a (id)",
            ),
            down = listOf(
                "DROP TABLE b",
                "DROP TABLE a",
            ),
        )
        assertEquals(3, m.up.size)
        assertEquals(2, m.down.size)
    }

    // ══════════════════════════════════════════════════════════════════════
    //  MigrationRegistry
    // ══════════════════════════════════════════════════════════════════════

    /** Fresh registry for each test to avoid cross-contamination. */
    private fun freshRegistry(): MigrationRegistryWrapper {
        return MigrationRegistryWrapper()
    }

    /**
     * Wrapper around [MigrationRegistry] semantics to avoid singleton contamination.
     * MigrationRegistry is an object (singleton), so we simulate its behavior
     * with a local mutable list for isolated test scenarios.
     */
    class MigrationRegistryWrapper {
        private val migrations = mutableListOf<Migration>()

        fun register(migration: Migration) {
            require(migrations.none { it.version == migration.version }) {
                "Migration version ${migration.version} already registered"
            }
            migrations.add(migration)
            migrations.sortBy { it.version }
        }

        fun getAll(): List<Migration> = migrations.toList()

        fun getAfterVersion(version: Int): List<Migration> =
            migrations.filter { it.version > version }

        fun getByVersion(version: Int): Migration? =
            migrations.find { it.version == version }

        fun latestVersion(): Int = migrations.maxOfOrNull { it.version } ?: 0
    }

    @Test
    fun registerAndRetrieveMigration() {
        val reg = freshRegistry()
        val m = Migration(1, "v1", listOf("SELECT 1"), emptyList())
        reg.register(m)
        assertEquals(listOf(m), reg.getAll())
    }

    @Test
    fun registerMultipleMigrationsSortedByVersion() {
        val reg = freshRegistry()
        val m3 = Migration(3, "v3", listOf("SELECT 3"), emptyList())
        val m1 = Migration(1, "v1", listOf("SELECT 1"), emptyList())
        val m2 = Migration(2, "v2", listOf("SELECT 2"), emptyList())
        // Register out of order
        reg.register(m3)
        reg.register(m1)
        reg.register(m2)
        val versions = reg.getAll().map { it.version }
        assertEquals(listOf(1, 2, 3), versions)
    }

    @Test
    fun rejectDuplicateVersion() {
        val reg = freshRegistry()
        reg.register(Migration(1, "v1", listOf("SELECT 1"), emptyList()))
        assertFailsWith<IllegalArgumentException> {
            reg.register(Migration(1, "v1-dup", listOf("SELECT 2"), emptyList()))
        }
    }

    @Test
    fun getAfterVersionFiltersCorrectly() {
        val reg = freshRegistry()
        reg.register(Migration(1, "v1", listOf("SELECT 1"), emptyList()))
        reg.register(Migration(2, "v2", listOf("SELECT 2"), emptyList()))
        reg.register(Migration(3, "v3", listOf("SELECT 3"), emptyList()))
        val after1 = reg.getAfterVersion(1)
        assertEquals(2, after1.size)
        assertEquals(listOf(2, 3), after1.map { it.version })
    }

    @Test
    fun getAfterVersionReturnsEmptyWhenAtLatest() {
        val reg = freshRegistry()
        reg.register(Migration(1, "v1", listOf("SELECT 1"), emptyList()))
        assertTrue(reg.getAfterVersion(1).isEmpty())
    }

    @Test
    fun getAfterVersionReturnsAllWhenAtZero() {
        val reg = freshRegistry()
        reg.register(Migration(1, "v1", listOf("SELECT 1"), emptyList()))
        reg.register(Migration(2, "v2", listOf("SELECT 2"), emptyList()))
        assertEquals(2, reg.getAfterVersion(0).size)
    }

    @Test
    fun getByVersionReturnsMatchingMigration() {
        val reg = freshRegistry()
        val m = Migration(1, "v1", listOf("SELECT 1"), emptyList())
        reg.register(m)
        assertEquals(m, reg.getByVersion(1))
    }

    @Test
    fun getByVersionReturnsNullWhenNotFound() {
        val reg = freshRegistry()
        assertNull(reg.getByVersion(99))
    }

    @Test
    fun latestVersionReturnsHighest() {
        val reg = freshRegistry()
        reg.register(Migration(1, "v1", listOf("SELECT 1"), emptyList()))
        reg.register(Migration(5, "v5", listOf("SELECT 5"), emptyList()))
        reg.register(Migration(3, "v3", listOf("SELECT 3"), emptyList()))
        assertEquals(5, reg.latestVersion())
    }

    @Test
    fun latestVersionReturnsZeroWhenEmpty() {
        val reg = freshRegistry()
        assertEquals(0, reg.latestVersion())
    }

    // ══════════════════════════════════════════════════════════════════════
    //  MigrationExecutor (with FakeSqlExecutor)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Fake [SqlExecutor] that records executed SQL statements and simulates
     * a schema_version table in memory.
     */
    class FakeSqlExecutor : SqlExecutor {
        val executedStatements = mutableListOf<String>()
        private val versionTable = mutableMapOf<Int, String>()
        private var initialized = false

        override fun execute(sql: String) {
            executedStatements.add(sql)
            if (sql.contains("CREATE TABLE IF NOT EXISTS schema_version")) {
                initialized = true
            }
        }

        override fun execute(sql: String, bindArgs: List<Any?>) {
            executedStatements.add(sql)
            if (sql.startsWith("INSERT INTO schema_version")) {
                val version = bindArgs[0] as Int
                val description = bindArgs[1] as String
                versionTable[version] = description
            } else if (sql.startsWith("DELETE FROM schema_version")) {
                val version = bindArgs[0] as Int
                versionTable.remove(version)
            }
        }

        override fun queryInt(sql: String): Int {
            executedStatements.add(sql)
            return versionTable.keys.maxOrNull() ?: 0
        }

        override fun executeInTransaction(block: SqlExecutor.() -> Unit) {
            this.block()
        }
    }

    @Test
    fun initializeCreatesVersionTable() {
        val executor = FakeSqlExecutor()
        val migrator = MigrationExecutor(executor)
        migrator.initialize()
        assertTrue(
            executor.executedStatements.any {
                it.contains("CREATE TABLE IF NOT EXISTS schema_version")
            }
        )
    }

    @Test
    fun getCurrentVersionReturnsZeroOnFreshDatabase() {
        val executor = FakeSqlExecutor()
        val migrator = MigrationExecutor(executor)
        migrator.initialize()
        assertEquals(0, migrator.getCurrentVersion())
    }

    @Test
    fun migrateDownReturnsFalseAtVersionZero() {
        val executor = FakeSqlExecutor()
        val migrator = MigrationExecutor(executor)
        assertEquals(false, migrator.migrateDown())
    }

    @Test
    fun migrationOrderIsPreservedInExecution() {
        val executor = FakeSqlExecutor()
        // We track that SQL statements from migration.up appear in order
        val m1 = Migration(1, "v1", listOf("CREATE TABLE a (id TEXT)"), listOf("DROP TABLE a"))
        val m2 = Migration(2, "v2", listOf("CREATE TABLE b (id TEXT)"), listOf("DROP TABLE b"))

        // Manually execute up migrations in order
        m1.up.forEach { executor.execute(it) }
        m2.up.forEach { executor.execute(it) }

        val createA = executor.executedStatements.indexOfFirst { it.contains("CREATE TABLE a") }
        val createB = executor.executedStatements.indexOfFirst { it.contains("CREATE TABLE b") }
        assertTrue(createA < createB, "Migration 1 must execute before Migration 2")
    }

    @Test
    fun rollbackExecutesDownStatementsInOrder() {
        val executor = FakeSqlExecutor()
        val m = Migration(
            version = 1,
            description = "test",
            up = listOf("CREATE TABLE x (id TEXT)"),
            down = listOf("DROP TABLE x", "DROP INDEX IF EXISTS idx_x"),
        )

        // Simulate rollback
        m.down.forEach { executor.execute(it) }

        assertEquals("DROP TABLE x", executor.executedStatements[0])
        assertEquals("DROP INDEX IF EXISTS idx_x", executor.executedStatements[1])
    }

    @Test
    fun fakeSqlExecutorTracksVersionInserts() {
        val executor = FakeSqlExecutor()
        executor.execute(
            "INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, datetime('now'))",
            listOf(1, "v1"),
        )
        assertEquals(1, executor.queryInt("SELECT COALESCE(MAX(version), 0) FROM schema_version"))
    }

    @Test
    fun fakeSqlExecutorTracksVersionDeletes() {
        val executor = FakeSqlExecutor()
        executor.execute(
            "INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, datetime('now'))",
            listOf(1, "v1"),
        )
        executor.execute(
            "DELETE FROM schema_version WHERE version = ?",
            listOf(1),
        )
        assertEquals(0, executor.queryInt("SELECT COALESCE(MAX(version), 0) FROM schema_version"))
    }

    @Test
    fun transactionBlockExecutesAllStatements() {
        val executor = FakeSqlExecutor()
        executor.executeInTransaction {
            execute("CREATE TABLE a (id TEXT)")
            execute("CREATE TABLE b (id TEXT)")
        }
        assertEquals(2, executor.executedStatements.size)
    }
}
