// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.db.migration.migrations.V001_InitialSchema
import com.finance.db.migration.migrations.V002_OwnerIdMigration
import com.finance.db.migration.migrations.V003_PerformanceIndexes
import com.finance.db.migration.migrations.V005_Liabilities
import com.finance.db.migration.migrations.V006_MoodTagMigration
import com.finance.db.migration.migrations.MigrationInitializer
import com.finance.db.migration.MigrationRegistry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class MigrationSystemTest {

    @Test fun v001_hasCorrectVersion() = assertEquals(1, V001_InitialSchema.version)
    @Test fun v001_hasUpStatements() = assertTrue(V001_InitialSchema.up.isNotEmpty())
    @Test fun v001_hasDownStatements() = assertTrue(V001_InitialSchema.down.isNotEmpty())

    @Test fun v001_upCreatesAllTables() {
        val sql = V001_InitialSchema.up.joinToString("\n")
        listOf("user", "household", "household_member", "account", "category", "budget", "goal").forEach {
            assertTrue(sql.contains(it), "Missing table: $it")
        }
    }

    @Test fun v002_hasCorrectVersion() = assertEquals(2, V002_OwnerIdMigration.version)

    @Test fun v002_addsOwnerIdColumns() {
        val sql = V002_OwnerIdMigration.up.joinToString("\n")
        listOf("account", "budget", "goal", "category").forEach {
            assertTrue(sql.contains("ALTER TABLE $it ADD COLUMN owner_id") ||
                sql.contains("ALTER TABLE \"$it\" ADD COLUMN owner_id"), "Missing owner_id for $it")
        }
    }

    @Test fun v003_hasCorrectVersion() = assertEquals(3, V003_PerformanceIndexes.version)

    @Test fun v003_addsPerformanceIndexes() {
        val sql = V003_PerformanceIndexes.up.joinToString("\n")
        assertTrue(sql.contains("idx_transaction_account_date"))
        assertTrue(sql.contains("idx_budget_household_period"))
        assertTrue(sql.contains("idx_goal_household_status"))
    }

    @Test fun v005_hasCorrectVersion() = assertEquals(5, V005_Liabilities.version)

    @Test fun v005_addsLiabilityTablesAndIndexes() {
        val sql = V005_Liabilities.up.joinToString("\n")
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS liability"))
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS liability_installment"))
        assertTrue(sql.contains("idx_liability_installment_due_date"))
    }

    @Test fun v006_hasCorrectVersion() = assertEquals(6, V006_MoodTagMigration.version)

    @Test fun v006_addsMoodTagColumn() {
        val sql = V006_MoodTagMigration.up.joinToString("\n")
        assertTrue(sql.contains("mood_tag"))
        assertTrue(sql.contains("ALTER TABLE ") && sql.contains("mood_tag TEXT"))
    }

    @Test fun migrationsAreInOrder() {
        assertTrue(V001_InitialSchema.version < V002_OwnerIdMigration.version)
        assertTrue(V002_OwnerIdMigration.version < V003_PerformanceIndexes.version)
        assertTrue(V003_PerformanceIndexes.version < V005_Liabilities.version)
        assertTrue(V005_Liabilities.version < V006_MoodTagMigration.version)
    }

    @Test fun migrationInitializer_canBeCalledTwice() {
        MigrationInitializer.initialize()
        MigrationInitializer.initialize() // should not throw
    }

    @Test fun migrationInitializer_registersAll() {
        MigrationInitializer.initialize()
        assertTrue(MigrationRegistry.getAll().size >= 4)
    }

    @Test fun migrationRegistry_latestVersion() {
        MigrationInitializer.initialize()
        assertTrue(MigrationRegistry.latestVersion() >= 6)
    }

    @Test fun migrationRegistry_getByVersion() {
        MigrationInitializer.initialize()
        assertNotNull(MigrationRegistry.getByVersion(1))
    }
}
