// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration.migrations

import com.finance.db.migration.Migration
import com.finance.db.migration.MigrationRegistry

val V005_Liabilities = Migration(
    version = 5,
    description = "Add first-class liabilities and repayment installments",
    up = listOf(
        """CREATE TABLE IF NOT EXISTS liability (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            provider TEXT NOT NULL,
            merchant_name TEXT NOT NULL,
            original_amount INTEGER NOT NULL,
            remaining_balance INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            opened_date TEXT NOT NULL,
            closed_date TEXT,
            account_id TEXT,
            note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (owner_id) REFERENCES user(id),
            FOREIGN KEY (account_id) REFERENCES account(id)
        )""".trimIndent(),
        """CREATE TABLE IF NOT EXISTS liability_installment (
            id TEXT NOT NULL PRIMARY KEY,
            liability_id TEXT NOT NULL,
            household_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            sequence_number INTEGER NOT NULL,
            due_date TEXT NOT NULL,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            status TEXT NOT NULL DEFAULT 'DUE',
            paid_at TEXT,
            payment_transaction_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (liability_id) REFERENCES liability(id),
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (owner_id) REFERENCES user(id),
            FOREIGN KEY (payment_transaction_id) REFERENCES "transaction"(id)
        )""".trimIndent(),
        "CREATE INDEX IF NOT EXISTS idx_liability_household ON liability (household_id)",
        "CREATE INDEX IF NOT EXISTS idx_liability_owner ON liability (owner_id)",
        "CREATE INDEX IF NOT EXISTS idx_liability_type ON liability (type)",
        "CREATE INDEX IF NOT EXISTS idx_liability_status ON liability (status)",
        "CREATE INDEX IF NOT EXISTS idx_liability_sync ON liability (is_synced)",
        "CREATE INDEX IF NOT EXISTS idx_liability_installment_liability ON liability_installment (liability_id)",
        "CREATE INDEX IF NOT EXISTS idx_liability_installment_household ON liability_installment (household_id)",
        "CREATE INDEX IF NOT EXISTS idx_liability_installment_owner ON liability_installment (owner_id)",
        "CREATE INDEX IF NOT EXISTS idx_liability_installment_due_date ON liability_installment (due_date)",
        "CREATE INDEX IF NOT EXISTS idx_liability_installment_status ON liability_installment (status)",
        "CREATE INDEX IF NOT EXISTS idx_liability_installment_sync ON liability_installment (is_synced)",
    ),
    down = listOf(
        "DROP INDEX IF EXISTS idx_liability_installment_sync",
        "DROP INDEX IF EXISTS idx_liability_installment_status",
        "DROP INDEX IF EXISTS idx_liability_installment_due_date",
        "DROP INDEX IF EXISTS idx_liability_installment_owner",
        "DROP INDEX IF EXISTS idx_liability_installment_household",
        "DROP INDEX IF EXISTS idx_liability_installment_liability",
        "DROP INDEX IF EXISTS idx_liability_sync",
        "DROP INDEX IF EXISTS idx_liability_status",
        "DROP INDEX IF EXISTS idx_liability_type",
        "DROP INDEX IF EXISTS idx_liability_owner",
        "DROP INDEX IF EXISTS idx_liability_household",
        "DROP TABLE IF EXISTS liability_installment",
        "DROP TABLE IF EXISTS liability",
    ),
)

internal fun registerV005() {
    MigrationRegistry.register(V005_Liabilities)
}
