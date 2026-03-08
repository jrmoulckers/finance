// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration.migrations

import com.finance.db.migration.Migration
import com.finance.db.migration.MigrationRegistry

/**
 * V001: Create initial database schema for all core entities.
 */
val V001_InitialSchema = Migration(
    version = 1,
    description = "Create initial schema: users, households, accounts, categories, transactions, budgets, goals",
    up = listOf(
        // users table
        """CREATE TABLE IF NOT EXISTS user (
            id TEXT NOT NULL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            default_currency TEXT NOT NULL DEFAULT 'USD',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0
        )""",
        "CREATE INDEX IF NOT EXISTS idx_user_email ON user (email)",
        "CREATE INDEX IF NOT EXISTS idx_user_sync ON user (is_synced)",

        // households table
        """CREATE TABLE IF NOT EXISTS household (
            id TEXT NOT NULL PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (owner_id) REFERENCES user(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_household_owner ON household (owner_id)",
        "CREATE INDEX IF NOT EXISTS idx_household_sync ON household (is_synced)",

        // household_member join table
        """CREATE TABLE IF NOT EXISTS household_member (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'MEMBER',
            joined_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (user_id) REFERENCES user(id)
        )""",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_hm_household_user ON household_member (household_id, user_id)",

        // accounts table
        """CREATE TABLE IF NOT EXISTS account (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            current_balance INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            icon TEXT,
            color TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_account_household ON account (household_id)",
        "CREATE INDEX IF NOT EXISTS idx_account_sync ON account (is_synced)",

        // categories table
        """CREATE TABLE IF NOT EXISTS category (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            parent_id TEXT,
            is_income INTEGER NOT NULL DEFAULT 0,
            is_system INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (parent_id) REFERENCES category(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_category_household ON category (household_id)",
        "CREATE INDEX IF NOT EXISTS idx_category_parent ON category (parent_id)",

        // transactions table
        """CREATE TABLE IF NOT EXISTS 'transaction' (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            category_id TEXT,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'CLEARED',
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            payee TEXT,
            note TEXT,
            date TEXT NOT NULL,
            transfer_account_id TEXT,
            transfer_transaction_id TEXT,
            is_recurring INTEGER NOT NULL DEFAULT 0,
            recurring_rule_id TEXT,
            tags TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (account_id) REFERENCES account(id),
            FOREIGN KEY (category_id) REFERENCES category(id),
            FOREIGN KEY (transfer_account_id) REFERENCES account(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_txn_household ON 'transaction' (household_id)",
        "CREATE INDEX IF NOT EXISTS idx_txn_account ON 'transaction' (account_id)",
        "CREATE INDEX IF NOT EXISTS idx_txn_category ON 'transaction' (category_id)",
        "CREATE INDEX IF NOT EXISTS idx_txn_date ON 'transaction' (date)",
        "CREATE INDEX IF NOT EXISTS idx_txn_sync ON 'transaction' (is_synced)",

        // budgets table
        """CREATE TABLE IF NOT EXISTS budget (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            name TEXT NOT NULL,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            period TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT,
            is_rollover INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (category_id) REFERENCES category(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_budget_household ON budget (household_id)",
        "CREATE INDEX IF NOT EXISTS idx_budget_category ON budget (category_id)",

        // goals table
        """CREATE TABLE IF NOT EXISTS goal (
            id TEXT NOT NULL PRIMARY KEY,
            household_id TEXT NOT NULL,
            name TEXT NOT NULL,
            target_amount INTEGER NOT NULL,
            current_amount INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'USD',
            target_date TEXT,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            icon TEXT,
            color TEXT,
            account_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            sync_version INTEGER NOT NULL DEFAULT 0,
            is_synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (household_id) REFERENCES household(id),
            FOREIGN KEY (account_id) REFERENCES account(id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_goal_household ON goal (household_id)",
    ),
    down = listOf(
        "DROP TABLE IF EXISTS goal",
        "DROP TABLE IF EXISTS budget",
        "DROP TABLE IF EXISTS 'transaction'",
        "DROP TABLE IF EXISTS category",
        "DROP TABLE IF EXISTS account",
        "DROP TABLE IF EXISTS household_member",
        "DROP TABLE IF EXISTS household",
        "DROP TABLE IF EXISTS user",
    ),
)

// Register on load
internal fun registerV001() {
    MigrationRegistry.register(V001_InitialSchema)
}
