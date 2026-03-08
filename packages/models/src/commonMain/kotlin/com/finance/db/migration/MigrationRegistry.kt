// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration

/**
 * Registry of all database migrations.
 * Add new migrations here in order.
 */
object MigrationRegistry {
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
