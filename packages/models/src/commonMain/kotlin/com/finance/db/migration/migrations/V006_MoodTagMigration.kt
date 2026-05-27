// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration.migrations

import com.finance.db.migration.Migration
import com.finance.db.migration.MigrationRegistry

val V006_MoodTagMigration = Migration(
    version = 6,
    description = "Add optional mood tag column to transactions",
    up = listOf(
        """ALTER TABLE "transaction" ADD COLUMN mood_tag TEXT""",
    ),
    down = listOf(
        """ALTER TABLE "transaction" DROP COLUMN mood_tag""",
    ),
)

internal fun registerV006() {
    MigrationRegistry.register(V006_MoodTagMigration)
}
