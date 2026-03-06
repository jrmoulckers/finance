package com.finance.db.migration

/**
 * Executes database migrations, tracking which versions have been applied.
 * Uses a `schema_version` table to track the current database version.
 */
class MigrationExecutor(
    private val sqlExecutor: SqlExecutor,
) {
    companion object {
        private const val VERSION_TABLE = "schema_version"
    }

    /**
     * Ensures the version tracking table exists.
     */
    fun initialize() {
        sqlExecutor.execute(
            """
            CREATE TABLE IF NOT EXISTS $VERSION_TABLE (
                version INTEGER NOT NULL PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL,
                checksum TEXT
            )
            """.trimIndent()
        )
    }

    /**
     * Returns the current database schema version.
     */
    fun getCurrentVersion(): Int {
        return sqlExecutor.queryInt(
            "SELECT COALESCE(MAX(version), 0) FROM $VERSION_TABLE"
        )
    }

    /**
     * Applies all pending migrations in order.
     * @return Number of migrations applied
     */
    fun migrateUp(): Int {
        initialize()
        val currentVersion = getCurrentVersion()
        val pending = MigrationRegistry.getAfterVersion(currentVersion)

        pending.forEach { migration ->
            applyMigration(migration)
        }

        return pending.size
    }

    /**
     * Rolls back the most recent migration.
     * @return true if a migration was rolled back, false if at version 0
     */
    fun migrateDown(): Boolean {
        initialize()
        val currentVersion = getCurrentVersion()
        if (currentVersion == 0) return false

        val migration = MigrationRegistry.getByVersion(currentVersion)
            ?: error("No migration found for version $currentVersion")

        rollbackMigration(migration)
        return true
    }

    /**
     * Migrates to a specific version (up or down as needed).
     */
    fun migrateTo(targetVersion: Int) {
        initialize()
        val currentVersion = getCurrentVersion()

        when {
            targetVersion > currentVersion -> {
                val migrations = MigrationRegistry.getAll()
                    .filter { it.version in (currentVersion + 1)..targetVersion }
                migrations.forEach { applyMigration(it) }
            }
            targetVersion < currentVersion -> {
                val migrations = MigrationRegistry.getAll()
                    .filter { it.version in (targetVersion + 1)..currentVersion }
                    .sortedByDescending { it.version }
                migrations.forEach { rollbackMigration(it) }
            }
        }
    }

    private fun applyMigration(migration: Migration) {
        sqlExecutor.executeInTransaction {
            migration.up.forEach { sql -> execute(sql) }
            execute(
                """
                INSERT INTO $VERSION_TABLE (version, description, applied_at)
                VALUES (${migration.version}, '${migration.description}', datetime('now'))
                """.trimIndent()
            )
        }
    }

    private fun rollbackMigration(migration: Migration) {
        sqlExecutor.executeInTransaction {
            migration.down.forEach { sql -> execute(sql) }
            execute("DELETE FROM $VERSION_TABLE WHERE version = ${migration.version}")
        }
    }
}
