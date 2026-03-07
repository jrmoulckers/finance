# Supabase Database Schema Reference

> All tables use UUID primary keys, `created_at`/`updated_at` timestamps,
> and `deleted_at` for soft-delete. Monetary values are stored as **BIGINT
> cents** with an accompanying `currency_code` (ISO 4217) column.

---

## Tables

### `users`

User profiles with sync metadata.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | Maps to `auth.users.id` |
| `email` | TEXT | NOT NULL | — | Unique email address |
| `display_name` | TEXT | NOT NULL | — | Display name |
| `avatar_url` | TEXT | ✓ | — | Profile avatar URL |
| `currency_code` | TEXT | NOT NULL | `'USD'` | Preferred currency (ISO 4217) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | Auto-updated by trigger |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | Soft-delete marker |

### `households`

Groups users who share finances together.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `name` | TEXT | NOT NULL | — | Household name |
| `created_by` | UUID | NOT NULL | — | FK → `users.id` (owner) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |

### `household_members`

Join table linking users to households with a role.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `user_id` | UUID | NOT NULL | — | FK → `users.id` |
| `role` | TEXT | NOT NULL | `'member'` | `owner` or `member` |
| `joined_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |

### `accounts`

Financial accounts (checking, savings, credit card, etc.).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `name` | TEXT | NOT NULL | — | Account name |
| `type` | TEXT | NOT NULL | — | Account type |
| `currency_code` | TEXT | NOT NULL | `'USD'` | ISO 4217 |
| `balance_cents` | BIGINT | NOT NULL | `0` | Balance in cents |
| `is_active` | BOOLEAN | NOT NULL | `true` | Active flag |
| `icon` | TEXT | ✓ | — | Icon identifier |
| `color` | TEXT | ✓ | — | Hex color |
| `sort_order` | INTEGER | NOT NULL | `0` | Display order |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |
| `sync_version` | BIGINT | NOT NULL | `0` | PowerSync version |
| `is_synced` | BOOLEAN | NOT NULL | `false` | Sync status |

### `categories`

Transaction categories with optional parent for subcategory hierarchies.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `name` | TEXT | NOT NULL | — | Category name |
| `icon` | TEXT | ✓ | — | Icon identifier |
| `color` | TEXT | ✓ | — | Hex color |
| `parent_id` | UUID | ✓ | — | FK → `categories.id` (self-referencing) |
| `is_income` | BOOLEAN | NOT NULL | `false` | Income category flag |
| `sort_order` | INTEGER | NOT NULL | `0` | Display order |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |
| `sync_version` | BIGINT | NOT NULL | `0` | PowerSync version |
| `is_synced` | BOOLEAN | NOT NULL | `false` | Sync status |

### `transactions`

Financial transactions linked to accounts and categories.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `account_id` | UUID | NOT NULL | — | FK → `accounts.id` |
| `category_id` | UUID | ✓ | — | FK → `categories.id` |
| `amount_cents` | BIGINT | NOT NULL | — | Amount in cents (negative = expense) |
| `currency_code` | TEXT | NOT NULL | `'USD'` | ISO 4217 |
| `type` | TEXT | NOT NULL | — | Transaction type |
| `payee` | TEXT | ✓ | — | Payee name |
| `note` | TEXT | ✓ | — | User note |
| `date` | DATE | NOT NULL | — | Transaction date |
| `is_recurring` | BOOLEAN | NOT NULL | `false` | Recurring flag |
| `recurring_rule` | TEXT | ✓ | — | RRULE or custom recurrence |
| `transfer_account_id` | UUID | ✓ | — | FK → `accounts.id` (transfers) |
| `status` | TEXT | NOT NULL | `'CLEARED'` | `CLEARED`, `PENDING`, etc. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |
| `sync_version` | BIGINT | NOT NULL | `0` | PowerSync version |
| `is_synced` | BOOLEAN | NOT NULL | `false` | Sync status |

### `budgets`

Recurring spending limits linked to a category and household.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `category_id` | UUID | NOT NULL | — | FK → `categories.id` |
| `amount_cents` | BIGINT | NOT NULL | — | Budget amount in cents |
| `currency_code` | TEXT | NOT NULL | `'USD'` | ISO 4217 |
| `period` | TEXT | NOT NULL | — | `MONTHLY`, `WEEKLY`, etc. |
| `start_date` | DATE | NOT NULL | — | Budget start date |
| `end_date` | DATE | ✓ | — | Budget end date |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |
| `sync_version` | BIGINT | NOT NULL | `0` | PowerSync version |
| `is_synced` | BOOLEAN | NOT NULL | `false` | Sync status |

### `goals`

Savings goals with progress tracking.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `name` | TEXT | NOT NULL | — | Goal name |
| `target_cents` | BIGINT | NOT NULL | — | Target amount in cents |
| `current_cents` | BIGINT | NOT NULL | `0` | Current progress in cents |
| `currency_code` | TEXT | NOT NULL | `'USD'` | ISO 4217 |
| `target_date` | DATE | ✓ | — | Target completion date |
| `icon` | TEXT | ✓ | — | Icon identifier |
| `color` | TEXT | ✓ | — | Hex color |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |
| `sync_version` | BIGINT | NOT NULL | `0` | PowerSync version |
| `is_synced` | BOOLEAN | NOT NULL | `false` | Sync status |

### `passkey_credentials`

WebAuthn/Passkey credential storage. A user may have multiple passkeys.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `user_id` | UUID | NOT NULL | — | FK → `users.id` |
| `credential_id` | TEXT | NOT NULL | — | WebAuthn credential ID |
| `public_key` | TEXT | NOT NULL | — | Base64-encoded public key |
| `counter` | BIGINT | NOT NULL | `0` | Signature counter (replay protection) |
| `device_type` | TEXT | ✓ | — | `singleDevice` or `multiDevice` |
| `backed_up` | BOOLEAN | NOT NULL | `false` | Whether credential is backed up |
| `transports` | TEXT[] | ✓ | — | Supported transports (e.g. `internal`, `usb`) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |

### `household_invitations`

Invite flow for multi-user households.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | NOT NULL | — | FK → `households.id` |
| `invited_by` | UUID | NOT NULL | — | FK → `users.id` |
| `invite_code` | TEXT | NOT NULL | — | 24-char random code |
| `invited_email` | TEXT | ✓ | — | Restrict to specific email |
| `role` | TEXT | NOT NULL | `'member'` | Role granted on accept |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | Expiration timestamp |
| `accepted_at` | TIMESTAMPTZ | ✓ | — | When accepted |
| `accepted_by` | UUID | ✓ | — | FK → `users.id` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |
| `deleted_at` | TIMESTAMPTZ | ✓ | — | — |

### `webauthn_challenges`

Temporary challenge storage for passkey ceremonies.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `user_id` | UUID | ✓ | — | FK → `users.id` (null for usernameless flow) |
| `challenge` | TEXT | NOT NULL | — | Base64url challenge string |
| `type` | TEXT | NOT NULL | — | `registration` or `authentication` |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | Challenge expiry (5 minutes) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |

### `audit_log`

Immutable audit trail for financial mutations and compliance events.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | PK | `gen_random_uuid()` | — |
| `household_id` | UUID | ✓ | — | FK → `households.id` |
| `user_id` | UUID | NOT NULL | — | Actor user ID |
| `action` | TEXT | NOT NULL | — | e.g. `DATA_EXPORT`, `ACCOUNT_DELETED` |
| `table_name` | TEXT | NOT NULL | — | Affected table |
| `record_id` | UUID | NOT NULL | — | Affected record ID |
| `old_values` | JSONB | ✓ | — | Previous state |
| `new_values` | JSONB | ✓ | — | New state |
| `ip_address` | INET | ✓ | — | Client IP |
| `user_agent` | TEXT | ✓ | — | Client user-agent |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | — |

---

## RLS Policy Summary

All tables have RLS **enabled**. The helper function `auth.household_ids()`
returns the array of household UUIDs the current JWT user belongs to.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | Own row only (`id = auth.uid()`) | Own row | Own row | Own row |
| `households` | Member of household | Owner only (`created_by`) | Owner only | Owner only |
| `household_members` | Member of household | Household owner | Household owner | Household owner |
| `accounts` | Member of household | Member of household | Member of household | Member of household |
| `categories` | Member of household | Member of household | Member of household | Member of household |
| `transactions` | Member of household | Member of household | Member of household | Member of household |
| `budgets` | Member of household | Member of household | Member of household | Member of household |
| `goals` | Member of household | Member of household | Member of household | Member of household |
| `passkey_credentials` | Own credentials only | Own credentials | Own credentials | Own credentials |
| `household_invitations` | Member of household | Household owner | Member of household | Household owner |
| `webauthn_challenges` | Own challenges only | Own challenges | — | Own challenges |
| `audit_log` | Member of household OR own user_id | Service role only | — | — |

---

## Database Functions

| Function | Security | Description |
|---|---|---|
| `auth.household_ids()` | `SECURITY DEFINER` | Returns UUID[] of current user's households |
| `auth.custom_access_token_hook(jsonb)` | `SECURITY DEFINER` | Embeds `household_ids` into JWT custom claims |
| `public.handle_new_user_signup(uuid, text, text)` | `SECURITY DEFINER` | Creates user + default household + owner membership |
| `public.set_updated_at()` | Trigger function | Auto-sets `updated_at` on UPDATE |

---

## Migration Files

All migrations live in `services/api/supabase/migrations/`:

| File | Description |
|---|---|
| `20260306000001_initial_schema.sql` | Core tables (`users`, `households`, `household_members`, `accounts`, `categories`, `transactions`, `budgets`, `goals`), indexes, and `updated_at` triggers |
| `20260306000002_rls_policies.sql` | RLS enablement, `auth.household_ids()` helper, all RLS policies for core tables |
| `20260306000003_auth_config.sql` | `passkey_credentials`, `household_invitations`, `webauthn_challenges`, `audit_log` tables; their RLS policies; `custom_access_token_hook`; `handle_new_user_signup` function |
