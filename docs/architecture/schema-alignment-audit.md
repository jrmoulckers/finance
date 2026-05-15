# Schema Alignment Audit — SQLDelight / Supabase / PowerSync

> **Issue:** [#1379](https://github.com/jrmoulckers/finance/issues/1379)
> **Status:** Audit complete — action items pending
> **Date:** 2025-07-14
> **Author:** @architect

## Purpose

This document audits schema alignment across the three schema layers in the Finance app:

1. **SQLDelight** (client-side SQLite) — `packages/models/src/commonMain/sqldelight/com/finance/db/*.sq`
2. **Supabase** (server-side PostgreSQL) — `services/api/supabase/migrations/`
3. **PowerSync** (sync rules) — `services/api/powersync/sync-rules.yaml`

Schema drift across these layers creates sync failures, data loss risk, and runtime crashes. This audit identifies every mismatch and recommends a source-of-truth process to prevent future drift.

---

## Source-of-Truth Process (Recommended)

```
Supabase Migrations (PostgreSQL)
        │
        ▼
   SQLDelight (.sq files)         ← adapt types: UUID→TEXT, BIGINT→INTEGER,
        │                           BOOLEAN→INTEGER, TIMESTAMPTZ→TEXT
        ▼
   PowerSync sync-rules.yaml     ← allowlist columns from Supabase;
                                    EXCLUDE sync_version, is_synced
```

**Rules:**

1. **Supabase is the canonical schema.** All column additions start as a versioned Supabase migration.
2. **SQLDelight mirrors Supabase** with SQLite type adaptations (see type mapping table below).
3. **PowerSync explicitly allowlists columns** from the Supabase schema. Internal columns (`sync_version`, `is_synced`) are deliberately excluded.
4. **Every schema change must update all three layers** in a single coordinated PR (or a linked set of PRs with serial merge order: Supabase → SQLDelight → PowerSync).

### Type Mapping: Supabase → SQLDelight

| Supabase (PostgreSQL) | SQLDelight (SQLite) | Notes                    |
| --------------------- | ------------------- | ------------------------ |
| `UUID`                | `TEXT`              | String representation    |
| `BIGINT`              | `INTEGER`           | SQLite INTEGER is 64-bit |
| `BOOLEAN`             | `INTEGER`           | 0/1 convention           |
| `TIMESTAMPTZ`         | `TEXT`              | ISO 8601 string          |
| `DATE`                | `TEXT`              | ISO 8601 date string     |
| `TEXT`                | `TEXT`              | Identical                |
| `INTEGER`             | `INTEGER`           | Identical                |

---

## Table-by-Table Comparison Matrix

### Legend

| Symbol | Meaning                                    |
| ------ | ------------------------------------------ |
| ✅     | Present and aligned                        |
| ❌     | Missing from this layer                    |
| ⚠️     | Present but with a naming or type mismatch |
| 🔒     | Deliberately excluded (internal/security)  |

---

### 1. `users` / `user`

| Column          | SQLDelight (`user`)   | Supabase (`users`) | PowerSync          | Notes                                                                                    |
| --------------- | --------------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `id`            | ✅ `TEXT`             | ✅ `UUID`          | ✅                 |                                                                                          |
| `email`         | ✅ `TEXT`             | ✅ `TEXT`          | ✅                 |                                                                                          |
| `display_name`  | ✅ `TEXT`             | ✅ `TEXT`          | ✅                 |                                                                                          |
| `avatar_url`    | ✅ `TEXT`             | ✅ `TEXT`          | ✅                 |                                                                                          |
| `currency_code` | ⚠️ `default_currency` | ✅ `currency_code` | ✅ `currency_code` | **MISMATCH:** SQLDelight uses `default_currency`; Supabase/PowerSync use `currency_code` |
| `created_at`    | ✅ `TEXT`             | ✅ `TIMESTAMPTZ`   | ✅                 |                                                                                          |
| `updated_at`    | ✅ `TEXT`             | ✅ `TIMESTAMPTZ`   | ✅                 |                                                                                          |
| `deleted_at`    | ✅ `TEXT`             | ✅ `TIMESTAMPTZ`   | ✅                 |                                                                                          |
| `sync_version`  | ✅ `INTEGER`          | ❌                 | 🔒                 | Client-only sync metadata; not in Supabase initial schema                                |
| `is_synced`     | ✅ `INTEGER`          | ❌                 | 🔒                 | Client-only sync metadata                                                                |

**Mismatches:**

- **Column name:** `default_currency` (SQLDelight) vs `currency_code` (Supabase/PowerSync). Sync will fail — the column names don't match across the wire.
- **Table name:** `user` (SQLDelight, singular) vs `users` (Supabase, plural). PowerSync syncs from `users`. SQLDelight must use the same table name or the sync engine must map.

---

### 2. `accounts` / `account`

| Column          | SQLDelight (`account`) | Supabase (`accounts`)    | PowerSync          | Notes                                                                         |
| --------------- | ---------------------- | ------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| `id`            | ✅ `TEXT`              | ✅ `UUID`                | ✅                 |                                                                               |
| `household_id`  | ✅ `TEXT`              | ✅ `UUID`                | ✅                 |                                                                               |
| `owner_id`      | ✅ `TEXT`              | ✅ `UUID` (migration 05) | ✅                 |                                                                               |
| `name`          | ✅ `TEXT`              | ✅ `TEXT`                | ✅                 |                                                                               |
| `type`          | ✅ `TEXT`              | ✅ `TEXT`                | ✅                 |                                                                               |
| `currency_code` | ⚠️ `currency`          | ✅ `currency_code`       | ✅ `currency_code` | **MISMATCH:** SQLDelight uses `currency`                                      |
| `balance_cents` | ⚠️ `current_balance`   | ✅ `balance_cents`       | ✅ `balance_cents` | **MISMATCH:** SQLDelight uses `current_balance`                               |
| `is_active`     | ⚠️ `is_archived`       | ✅ `is_active`           | ✅ `is_active`     | **SEMANTIC MISMATCH:** Inverted boolean — `is_archived=1` ≈ `is_active=false` |
| `icon`          | ✅ `TEXT`              | ✅ `TEXT`                | ✅                 |                                                                               |
| `color`         | ✅ `TEXT`              | ✅ `TEXT`                | ✅                 |                                                                               |
| `sort_order`    | ✅ `INTEGER`           | ✅ `INTEGER`             | ✅                 |                                                                               |
| `created_at`    | ✅ `TEXT`              | ✅ `TIMESTAMPTZ`         | ✅                 |                                                                               |
| `updated_at`    | ✅ `TEXT`              | ✅ `TIMESTAMPTZ`         | ✅                 |                                                                               |
| `deleted_at`    | ✅ `TEXT`              | ✅ `TIMESTAMPTZ`         | ✅                 |                                                                               |
| `sync_version`  | ✅ `INTEGER`           | ✅ `BIGINT`              | 🔒                 | Excluded from PowerSync (by design)                                           |
| `is_synced`     | ✅ `INTEGER`           | ✅ `BOOLEAN`             | 🔒                 | Excluded from PowerSync (by design)                                           |

**Mismatches:**

- **Column name:** `currency` vs `currency_code` — sync will map to wrong column.
- **Column name:** `current_balance` vs `balance_cents` — sync will fail on this column.
- **Semantic inversion:** `is_archived` (SQLDelight) vs `is_active` (Supabase/PowerSync) — inverted meaning, sync logic must handle the flip.
- **Table name:** `account` (singular) vs `accounts` (plural).

---

### 3. `transactions` / `transaction`

| Column                    | SQLDelight (`transaction`) | Supabase (`transactions`) | PowerSync          | Notes                                                                         |
| ------------------------- | -------------------------- | ------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `id`                      | ✅ `TEXT`                  | ✅ `UUID`                 | ✅                 |                                                                               |
| `household_id`            | ✅ `TEXT`                  | ✅ `UUID`                 | ✅                 |                                                                               |
| `owner_id`                | ✅ `TEXT`                  | ✅ `UUID` (migration 05)  | ✅                 |                                                                               |
| `account_id`              | ✅ `TEXT`                  | ✅ `UUID`                 | ✅                 |                                                                               |
| `category_id`             | ✅ `TEXT`                  | ✅ `UUID`                 | ✅                 |                                                                               |
| `amount_cents`            | ⚠️ `amount`                | ✅ `amount_cents`         | ✅ `amount_cents`  | **MISMATCH:** SQLDelight uses `amount`                                        |
| `currency_code`           | ⚠️ `currency`              | ✅ `currency_code`        | ✅ `currency_code` | **MISMATCH:** SQLDelight uses `currency`                                      |
| `type`                    | ✅ `TEXT`                  | ✅ `TEXT`                 | ✅                 |                                                                               |
| `payee`                   | ✅ `TEXT`                  | ✅ `TEXT`                 | ✅                 |                                                                               |
| `note`                    | ✅ `TEXT`                  | ✅ `TEXT`                 | ✅                 |                                                                               |
| `date`                    | ✅ `TEXT`                  | ✅ `DATE`                 | ✅                 |                                                                               |
| `is_recurring`            | ✅ `INTEGER`               | ✅ `BOOLEAN`              | ✅                 |                                                                               |
| `recurring_rule`          | ❌                         | ✅ `TEXT`                 | ✅                 | **MISSING** from SQLDelight; present in Supabase initial schema and PowerSync |
| `transfer_account_id`     | ✅ `TEXT`                  | ✅ `UUID`                 | ✅                 |                                                                               |
| `status`                  | ✅ `TEXT`                  | ✅ `TEXT`                 | ✅                 |                                                                               |
| `transfer_transaction_id` | ✅ `TEXT`                  | ✅ `UUID` (migration 02)  | ✅                 | Approved addition — aligned ✅                                                |
| `recurring_rule_id`       | ✅ `TEXT`                  | ✅ `UUID` (migration 02)  | ✅                 | Approved addition — aligned ✅                                                |
| `tags`                    | ✅ `TEXT` (JSON)           | ❌                        | ❌                 | **SQLDelight-only** — no Supabase column                                      |
| `created_at`              | ✅ `TEXT`                  | ✅ `TIMESTAMPTZ`          | ✅                 |                                                                               |
| `updated_at`              | ✅ `TEXT`                  | ✅ `TIMESTAMPTZ`          | ✅                 |                                                                               |
| `deleted_at`              | ✅ `TEXT`                  | ✅ `TIMESTAMPTZ`          | ✅                 |                                                                               |
| `sync_version`            | ✅ `INTEGER`               | ✅ `BIGINT`               | 🔒                 | Excluded from PowerSync (by design)                                           |
| `is_synced`               | ✅ `INTEGER`               | ✅ `BOOLEAN`              | 🔒                 | Excluded from PowerSync (by design)                                           |

**Mismatches:**

- **Column name:** `amount` vs `amount_cents` — sync will fail.
- **Column name:** `currency` vs `currency_code` — sync will fail.
- **Missing column:** `recurring_rule` (TEXT) exists in Supabase and PowerSync but not in SQLDelight. SQLDelight has `recurring_rule_id` (FK) instead — these are different concepts (rule description vs FK to template).
- **Extra column:** `tags` exists only in SQLDelight. Not synced, will be lost on server round-trip.
- **Table name:** `transaction` (singular, quoted) vs `transactions` (plural).

---

### 4. `budgets` / `budget`

| Column          | SQLDelight (`budget`) | Supabase (`budgets`)        | PowerSync          | Notes                                               |
| --------------- | --------------------- | --------------------------- | ------------------ | --------------------------------------------------- |
| `id`            | ✅ `TEXT`             | ✅ `UUID`                   | ✅                 |                                                     |
| `household_id`  | ✅ `TEXT`             | ✅ `UUID`                   | ✅                 |                                                     |
| `owner_id`      | ✅ `TEXT`             | ✅ `UUID` (migration 05)    | ✅                 |                                                     |
| `category_id`   | ✅ `TEXT`             | ✅ `UUID`                   | ✅                 |                                                     |
| `name`          | ✅ `TEXT`             | ❌                          | ❌                 | **SQLDelight-only** — Supabase has no `name` column |
| `amount_cents`  | ⚠️ `amount`           | ✅ `amount_cents`           | ✅ `amount_cents`  | **MISMATCH:** SQLDelight uses `amount`              |
| `currency_code` | ⚠️ `currency`         | ✅ `currency_code`          | ✅ `currency_code` | **MISMATCH:** SQLDelight uses `currency`            |
| `period`        | ✅ `TEXT`             | ✅ `TEXT`                   | ✅                 |                                                     |
| `start_date`    | ✅ `TEXT`             | ✅ `DATE`                   | ✅                 |                                                     |
| `end_date`      | ✅ `TEXT`             | ✅ `DATE`                   | ✅                 |                                                     |
| `is_rollover`   | ✅ `INTEGER`          | ✅ `BOOLEAN` (migration 03) | ✅                 | Approved addition — aligned ✅                      |
| `created_at`    | ✅ `TEXT`             | ✅ `TIMESTAMPTZ`            | ✅                 |                                                     |
| `updated_at`    | ✅ `TEXT`             | ✅ `TIMESTAMPTZ`            | ✅                 |                                                     |
| `deleted_at`    | ✅ `TEXT`             | ✅ `TIMESTAMPTZ`            | ✅                 |                                                     |
| `sync_version`  | ✅ `INTEGER`          | ✅ `BIGINT`                 | 🔒                 | Excluded from PowerSync (by design)                 |
| `is_synced`     | ✅ `INTEGER`          | ✅ `BOOLEAN`                | 🔒                 | Excluded from PowerSync (by design)                 |

**Mismatches:**

- **Column name:** `amount` vs `amount_cents` — sync will fail.
- **Column name:** `currency` vs `currency_code` — sync will fail.
- **Extra column:** `name` exists only in SQLDelight. Supabase budgets have no `name`. This will cause insert failures or data loss on sync.
- **Table name:** `budget` (singular) vs `budgets` (plural).

---

### 5. `goals` / `goal`

| Column          | SQLDelight (`goal`) | Supabase (`goals`)       | PowerSync          | Notes                                          |
| --------------- | ------------------- | ------------------------ | ------------------ | ---------------------------------------------- |
| `id`            | ✅ `TEXT`           | ✅ `UUID`                | ✅                 |                                                |
| `household_id`  | ✅ `TEXT`           | ✅ `UUID`                | ✅                 |                                                |
| `owner_id`      | ✅ `TEXT`           | ✅ `UUID` (migration 05) | ✅                 |                                                |
| `name`          | ✅ `TEXT`           | ✅ `TEXT`                | ✅                 |                                                |
| `target_cents`  | ⚠️ `target_amount`  | ✅ `target_cents`        | ✅ `target_cents`  | **MISMATCH:** SQLDelight uses `target_amount`  |
| `current_cents` | ⚠️ `current_amount` | ✅ `current_cents`       | ✅ `current_cents` | **MISMATCH:** SQLDelight uses `current_amount` |
| `currency_code` | ⚠️ `currency`       | ✅ `currency_code`       | ✅ `currency_code` | **MISMATCH:** SQLDelight uses `currency`       |
| `target_date`   | ✅ `TEXT`           | ✅ `DATE`                | ✅                 |                                                |
| `icon`          | ✅ `TEXT`           | ✅ `TEXT`                | ✅                 |                                                |
| `color`         | ✅ `TEXT`           | ✅ `TEXT`                | ✅                 |                                                |
| `account_id`    | ✅ `TEXT`           | ✅ `UUID` (migration 04) | ✅                 | Approved addition — aligned ✅                 |
| `status`        | ✅ `TEXT`           | ✅ `TEXT` (migration 04) | ✅                 | Approved addition — aligned ✅                 |
| `created_at`    | ✅ `TEXT`           | ✅ `TIMESTAMPTZ`         | ✅                 |                                                |
| `updated_at`    | ✅ `TEXT`           | ✅ `TIMESTAMPTZ`         | ✅                 |                                                |
| `deleted_at`    | ✅ `TEXT`           | ✅ `TIMESTAMPTZ`         | ✅                 |                                                |
| `sync_version`  | ✅ `INTEGER`        | ✅ `BIGINT`              | 🔒                 | Excluded from PowerSync (by design)            |
| `is_synced`     | ✅ `INTEGER`        | ✅ `BOOLEAN`             | 🔒                 | Excluded from PowerSync (by design)            |

**Mismatches:**

- **Column name:** `target_amount` vs `target_cents` — sync will fail.
- **Column name:** `current_amount` vs `current_cents` — sync will fail.
- **Column name:** `currency` vs `currency_code` — sync will fail.
- **Case mismatch:** SQLDelight default is `'ACTIVE'` (uppercase); Supabase CHECK constraint requires `'active'` (lowercase). Status values will fail the CHECK constraint on sync-up.
- **Table name:** `goal` (singular) vs `goals` (plural).

---

### 6. `categories` / `category`

| Column         | SQLDelight (`category`) | Supabase (`categories`)  | PowerSync | Notes                                           |
| -------------- | ----------------------- | ------------------------ | --------- | ----------------------------------------------- |
| `id`           | ✅ `TEXT`               | ✅ `UUID`                | ✅        |                                                 |
| `household_id` | ✅ `TEXT`               | ✅ `UUID`                | ✅        |                                                 |
| `owner_id`     | ✅ `TEXT`               | ✅ `UUID` (migration 05) | ✅        |                                                 |
| `name`         | ✅ `TEXT`               | ✅ `TEXT`                | ✅        |                                                 |
| `icon`         | ✅ `TEXT`               | ✅ `TEXT`                | ✅        |                                                 |
| `color`        | ✅ `TEXT`               | ✅ `TEXT`                | ✅        |                                                 |
| `parent_id`    | ✅ `TEXT`               | ✅ `UUID`                | ✅        |                                                 |
| `is_income`    | ✅ `INTEGER`            | ✅ `BOOLEAN`             | ✅        |                                                 |
| `is_system`    | ✅ `INTEGER`            | ❌                       | ❌        | **SQLDelight-only** — not in Supabase/PowerSync |
| `sort_order`   | ✅ `INTEGER`            | ✅ `INTEGER`             | ✅        |                                                 |
| `created_at`   | ✅ `TEXT`               | ✅ `TIMESTAMPTZ`         | ✅        |                                                 |
| `updated_at`   | ✅ `TEXT`               | ✅ `TIMESTAMPTZ`         | ✅        |                                                 |
| `deleted_at`   | ✅ `TEXT`               | ✅ `TIMESTAMPTZ`         | ✅        |                                                 |
| `sync_version` | ✅ `INTEGER`            | ✅ `BIGINT`              | 🔒        | Excluded from PowerSync (by design)             |
| `is_synced`    | ✅ `INTEGER`            | ✅ `BOOLEAN`             | 🔒        | Excluded from PowerSync (by design)             |

**Mismatches:**

- **Extra column:** `is_system` exists only in SQLDelight. Not in Supabase — will be lost on sync.
- **Table name:** `category` (singular) vs `categories` (plural).

---

### 7. `households` / `household`

| Column         | SQLDelight (`household`) | Supabase (`households`) | PowerSync       | Notes                                                                         |
| -------------- | ------------------------ | ----------------------- | --------------- | ----------------------------------------------------------------------------- |
| `id`           | ✅ `TEXT`                | ✅ `UUID`               | ✅              |                                                                               |
| `name`         | ✅ `TEXT`                | ✅ `TEXT`               | ✅              |                                                                               |
| `created_by`   | ⚠️ `owner_id`            | ✅ `created_by`         | ✅ `created_by` | **MISMATCH:** SQLDelight uses `owner_id`; Supabase/PowerSync use `created_by` |
| `owner_id`     | ✅ (see above)           | ❌                      | ❌              | SQLDelight's `owner_id` maps to Supabase's `created_by` — different names     |
| `created_at`   | ✅ `TEXT`                | ✅ `TIMESTAMPTZ`        | ✅              |                                                                               |
| `updated_at`   | ✅ `TEXT`                | ✅ `TIMESTAMPTZ`        | ✅              |                                                                               |
| `deleted_at`   | ✅ `TEXT`                | ✅ `TIMESTAMPTZ`        | ✅              |                                                                               |
| `sync_version` | ✅ `INTEGER`             | ❌                      | 🔒              | Client-only; not in Supabase initial schema                                   |
| `is_synced`    | ✅ `INTEGER`             | ❌                      | 🔒              | Client-only                                                                   |

**Mismatches:**

- **Column name:** `owner_id` (SQLDelight) vs `created_by` (Supabase/PowerSync). The household table is a special case — `created_by` is semantically different from the standardized `owner_id` on other tables. Supabase doesn't have a separate `owner_id` on households; the `owner_id` migration (05) did NOT add `owner_id` to households.
- **Table name:** `household` (singular) vs `households` (plural).

---

### 8. `household_members` / `household_member`

| Column         | SQLDelight (`household_member`) | Supabase (`household_members`) | PowerSync | Notes       |
| -------------- | ------------------------------- | ------------------------------ | --------- | ----------- |
| `id`           | ✅ `TEXT`                       | ✅ `UUID`                      | ✅        |             |
| `household_id` | ✅ `TEXT`                       | ✅ `UUID`                      | ✅        |             |
| `user_id`      | ✅ `TEXT`                       | ✅ `UUID`                      | ✅        |             |
| `role`         | ✅ `TEXT`                       | ✅ `TEXT`                      | ✅        |             |
| `joined_at`    | ✅ `TEXT`                       | ✅ `TIMESTAMPTZ`               | ✅        |             |
| `created_at`   | ✅ `TEXT`                       | ✅ `TIMESTAMPTZ`               | ✅        |             |
| `updated_at`   | ✅ `TEXT`                       | ✅ `TIMESTAMPTZ`               | ✅        |             |
| `deleted_at`   | ✅ `TEXT`                       | ✅ `TIMESTAMPTZ`               | ✅        |             |
| `sync_version` | ✅ `INTEGER`                    | ❌                             | 🔒        | Client-only |
| `is_synced`    | ✅ `INTEGER`                    | ❌                             | 🔒        | Client-only |

**Mismatches:**

- **Table name:** `household_member` (singular) vs `household_members` (plural). Otherwise well-aligned.
- **Missing `owner_id`:** The `owner_id` standardization migration (05) did not add `owner_id` to `household_members`. SQLDelight also lacks it. Decision needed: should `household_members` have `owner_id`? (Likely `user_id` serves this purpose.)

---

### 9. `recurring_transaction_templates` (Supabase/PowerSync only)

| Column         | SQLDelight | Supabase                      | PowerSync | Notes                                              |
| -------------- | ---------- | ----------------------------- | --------- | -------------------------------------------------- |
| _entire table_ | ❌         | ✅ (migration 20260323000002) | ✅        | **No SQLDelight `.sq` file exists for this table** |

**Key columns in Supabase:** `id`, `household_id`, `owner_id`, `account_id`, `category_id`, `amount_cents`, `currency_code`, `type`, `payee`, `note`, `frequency`, `day_of_month`, `day_of_week`, `start_date`, `end_date`, `last_generated_date`, `next_due_date`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `sync_version`, `is_synced`.

**Impact:** Clients cannot locally query or create recurring transaction templates. The `recurring_rule_id` FK on transactions points to a table that doesn't exist in SQLDelight.

---

## Systemic Issues Summary

### Issue 1: Table Name Convention (Singular vs Plural)

| SQLDelight (singular) | Supabase (plural)   | PowerSync (plural)  |
| --------------------- | ------------------- | ------------------- |
| `user`                | `users`             | `users`             |
| `account`             | `accounts`          | `accounts`          |
| `transaction`         | `transactions`      | `transactions`      |
| `budget`              | `budgets`           | `budgets`           |
| `goal`                | `goals`             | `goals`             |
| `category`            | `categories`        | `categories`        |
| `household`           | `households`        | `households`        |
| `household_member`    | `household_members` | `household_members` |

**Impact:** The sync engine must map between singular (SQLDelight) and plural (Supabase/PowerSync) table names. If PowerSync writes to `accounts` but SQLDelight expects `account`, inserts will fail silently or crash.

**Recommendation:** Either rename SQLDelight tables to plural (breaking change, requires migration) or configure explicit table name mappings in the sync engine.

### Issue 2: Column Naming Convention (`_cents` / `_code` suffixes)

Supabase uses explicit suffixes (`amount_cents`, `currency_code`, `balance_cents`). SQLDelight uses bare names (`amount`, `currency`, `current_balance`).

| Supabase Column | SQLDelight Column  | Tables Affected                        |
| --------------- | ------------------ | -------------------------------------- |
| `amount_cents`  | `amount`           | transactions, budgets                  |
| `balance_cents` | `current_balance`  | accounts                               |
| `target_cents`  | `target_amount`    | goals                                  |
| `current_cents` | `current_amount`   | goals                                  |
| `currency_code` | `currency`         | accounts, transactions, budgets, goals |
| `currency_code` | `default_currency` | users                                  |

**Impact:** Every monetary column and every currency column will fail to sync without explicit column mapping. This is the single largest category of drift.

**Recommendation:** Rename SQLDelight columns to match Supabase. This is a breaking change requiring a SQLDelight migration (`.sqm`), Kotlin model updates, and app-level code changes across all four platforms.

### Issue 3: Semantic Inversions

| Supabase            | SQLDelight          | Meaning                             |
| ------------------- | ------------------- | ----------------------------------- |
| `is_active = true`  | `is_archived = 0`   | Account is usable                   |
| `status = 'active'` | `status = 'ACTIVE'` | Goal is in progress (case mismatch) |

**Impact:** Boolean inversion requires sync-layer transformation. Case mismatch on goal status will fail the Supabase CHECK constraint.

### Issue 4: Missing SQLDelight Table

`recurring_transaction_templates` exists in Supabase and PowerSync but has no corresponding `.sq` file in SQLDelight. Clients receive this data via sync but have no local schema to store it.

### Issue 5: SQLDelight-Only Columns (Not in Supabase)

| Table        | Column      | Risk                                                |
| ------------ | ----------- | --------------------------------------------------- |
| transactions | `tags`      | Data entered locally will be lost on sync to server |
| categories   | `is_system` | System category flag not persisted server-side      |
| budgets      | `name`      | Budget name not persisted server-side               |

**Decision needed:** Add these to Supabase (if they're intentional features) or remove from SQLDelight (if they were premature additions).

---

## Approved Additions — Status Check

| Addition                                    | Supabase  | SQLDelight | PowerSync | Status                                        |
| ------------------------------------------- | --------- | ---------- | --------- | --------------------------------------------- |
| `transactions.transfer_transaction_id UUID` | ✅ Mig 02 | ✅         | ✅        | **Aligned**                                   |
| `transactions.recurring_rule_id UUID`       | ✅ Mig 02 | ✅         | ✅        | **Aligned**                                   |
| `budgets.is_rollover BOOLEAN`               | ✅ Mig 03 | ✅         | ✅        | **Aligned**                                   |
| `goals.account_id UUID`                     | ✅ Mig 04 | ✅         | ✅        | **Aligned**                                   |
| `goals.status TEXT`                         | ✅ Mig 04 | ✅         | ✅        | **Aligned** (case mismatch — see Issue 3)     |
| `*.owner_id UUID` (standardized)            | ✅ Mig 05 | ✅         | ✅        | **Aligned** (nullability differs — see below) |

**Nullability concern on `owner_id`:**

- **Supabase:** `owner_id` is **nullable** (migration 05 adds it without `NOT NULL` to support backfilling).
- **SQLDelight:** `owner_id` is `TEXT NOT NULL` (enforced from the `.sq` schema).
- **Risk:** Existing Supabase rows with `NULL` owner_id will fail to sync to clients that enforce NOT NULL.

---

## Action Items

Each item below should become a separate GitHub issue. They are ordered by risk (highest first).

### Critical (Sync-Breaking)

| #   | Action                                                                                                                                                                  | Owner                      | Tables                                 | Issue Scope                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------- | ----------------------------------------------------- |
| 1   | **Rename monetary columns** in SQLDelight: `amount`→`amount_cents`, `current_balance`→`balance_cents`, `target_amount`→`target_cents`, `current_amount`→`current_cents` | @kmp-engineer              | accounts, transactions, budgets, goals | `.sq` files + `.sqm` migration + Kotlin model updates |
| 2   | **Rename currency columns** in SQLDelight: `currency`→`currency_code`, `default_currency`→`currency_code`                                                               | @kmp-engineer              | all tables with currency               | `.sq` files + `.sqm` migration + Kotlin model updates |
| 3   | **Rename `is_archived`→`is_active`** in SQLDelight (invert default: `0`→`1`) OR add sync-layer mapping                                                                  | @kmp-engineer              | accounts                               | `.sq` file + `.sqm` migration + update all queries    |
| 4   | **Standardize goal status casing** to lowercase (`'active'`, `'completed'`, `'archived'`) in SQLDelight                                                                 | @kmp-engineer              | goals                                  | `.sq` file + Kotlin enum                              |
| 5   | **Create `RecurringTransactionTemplate.sq`** in SQLDelight                                                                                                              | @kmp-engineer              | recurring_transaction_templates        | New `.sq` file                                        |
| 6   | **Resolve table name convention** (singular→plural or add sync mapping)                                                                                                 | @kmp-engineer + @architect | all tables                             | Architecture decision needed first                    |

### High (Data Loss Risk)

| #   | Action                                                                                                              | Owner             | Tables       | Issue Scope                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ------------------------------------------------- |
| 7   | **Add `tags TEXT` column** to Supabase `transactions` (or remove from SQLDelight)                                   | @backend-engineer | transactions | Supabase migration + PowerSync sync rule update   |
| 8   | **Add `is_system BOOLEAN` column** to Supabase `categories` (or remove from SQLDelight)                             | @backend-engineer | categories   | Supabase migration + PowerSync sync rule update   |
| 9   | **Add `name TEXT` column** to Supabase `budgets` (or remove from SQLDelight)                                        | @backend-engineer | budgets      | Supabase migration + PowerSync sync rule update   |
| 10  | **Add `recurring_rule TEXT` column** to SQLDelight transactions (or confirm it's deprecated by `recurring_rule_id`) | @kmp-engineer     | transactions | Decision: keep legacy field or drop from Supabase |

### Medium (Consistency)

| #   | Action                                                                                                          | Owner                             | Tables                               | Issue Scope           |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ | --------------------- |
| 11  | **Resolve `owner_id` nullability** — either make Supabase NOT NULL (after backfill) or make SQLDelight nullable | @backend-engineer + @kmp-engineer | all tables with owner_id             | Coordinated migration |
| 12  | **Resolve `households.owner_id` vs `created_by`** naming — decide canonical name                                | @architect                        | households                           | ADR needed            |
| 13  | **Add `sync_version`/`is_synced`** to Supabase `users`, `households`, `household_members` (currently missing)   | @backend-engineer                 | users, households, household_members | Supabase migration    |
| 14  | **Add `owner_id`** to `household_members` or document why it's excluded                                         | @architect                        | household_members                    | ADR or migration      |

### Low (Hygiene)

| #   | Action                                                                                        | Owner             | Scope              |
| --- | --------------------------------------------------------------------------------------------- | ----------------- | ------------------ |
| 15  | **Create a CI check** that compares `.sq` schemas against Supabase migrations to detect drift | @devops-engineer  | CI/CD              |
| 16  | **Document the schema change process** as an ADR (Supabase → SQLDelight → PowerSync pipeline) | @architect        | docs/architecture/ |
| 17  | **Add column comments** to all Supabase tables for documentation parity                       | @backend-engineer | all tables         |

---

## Appendix: PowerSync Column Allowlist vs Supabase

PowerSync intentionally **excludes** the following columns (this is correct behavior):

| Column          | Reason for Exclusion                                   |
| --------------- | ------------------------------------------------------ |
| `sync_version`  | Internal sync metadata — not needed on client          |
| `is_synced`     | Internal sync metadata — not needed on client          |
| `public_key`    | Security — passkey public keys must never leave server |
| `invited_email` | Privacy (GDPR) — PII must not sync to all members      |
| `ip_address`    | Privacy — server audit field only                      |
| `user_agent`    | Privacy — server audit field only                      |

These exclusions are intentional and should **not** be changed.

---

## Appendix: Full Column Inventory by Table

<details>
<summary>Click to expand full column lists for all three layers</summary>

### accounts / account

```
SQLDelight:  id, household_id, owner_id, name, type, currency, current_balance, is_archived, sort_order, icon, color, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, household_id, owner_id, name, type, currency_code, balance_cents, is_active, icon, color, sort_order, created_at, updated_at, deleted_at, sync_version, is_synced
PowerSync:   id, household_id, owner_id, name, type, currency_code, balance_cents, is_active, icon, color, sort_order, created_at, updated_at, deleted_at
```

### transactions / transaction

```
SQLDelight:  id, household_id, owner_id, account_id, category_id, type, status, amount, currency, payee, note, date, transfer_account_id, transfer_transaction_id, is_recurring, recurring_rule_id, tags, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, household_id, owner_id, account_id, category_id, amount_cents, currency_code, type, payee, note, date, is_recurring, recurring_rule, transfer_account_id, status, transfer_transaction_id, recurring_rule_id, created_at, updated_at, deleted_at, sync_version, is_synced
PowerSync:   id, household_id, owner_id, account_id, category_id, amount_cents, currency_code, type, payee, note, date, is_recurring, recurring_rule, transfer_account_id, status, transfer_transaction_id, recurring_rule_id, created_at, updated_at, deleted_at
```

### budgets / budget

```
SQLDelight:  id, household_id, owner_id, category_id, name, amount, currency, period, start_date, end_date, is_rollover, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, household_id, owner_id, category_id, amount_cents, currency_code, period, start_date, end_date, is_rollover, created_at, updated_at, deleted_at, sync_version, is_synced
PowerSync:   id, household_id, owner_id, category_id, amount_cents, currency_code, period, start_date, end_date, is_rollover, created_at, updated_at, deleted_at
```

### goals / goal

```
SQLDelight:  id, household_id, owner_id, name, target_amount, current_amount, currency, target_date, status, icon, color, account_id, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, household_id, owner_id, name, target_cents, current_cents, currency_code, target_date, icon, color, account_id, status, created_at, updated_at, deleted_at, sync_version, is_synced
PowerSync:   id, household_id, owner_id, name, target_cents, current_cents, currency_code, target_date, icon, color, account_id, status, created_at, updated_at, deleted_at
```

### categories / category

```
SQLDelight:  id, household_id, owner_id, name, icon, color, parent_id, is_income, is_system, sort_order, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, household_id, owner_id, name, icon, color, parent_id, is_income, sort_order, created_at, updated_at, deleted_at, sync_version, is_synced
PowerSync:   id, household_id, owner_id, name, icon, color, parent_id, is_income, sort_order, created_at, updated_at, deleted_at
```

### households / household

```
SQLDelight:  id, name, owner_id, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, name, created_by, created_at, updated_at, deleted_at
PowerSync:   id, name, created_by, created_at, updated_at, deleted_at
```

### household_members / household_member

```
SQLDelight:  id, household_id, user_id, role, joined_at, created_at, updated_at, deleted_at, sync_version, is_synced
Supabase:    id, household_id, user_id, role, joined_at, created_at, updated_at, deleted_at
PowerSync:   id, household_id, user_id, role, joined_at, created_at, updated_at, deleted_at
```

</details>

---

## Revision History

| Date       | Change                        |
| ---------- | ----------------------------- |
| 2025-07-14 | Initial audit created (#1379) |
