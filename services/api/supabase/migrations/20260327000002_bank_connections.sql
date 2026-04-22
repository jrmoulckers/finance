-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260327000002_bank_connections
-- Description: Schema for bank connection integrations (Plaid/MX)
-- Issues: #265
--
-- Adds:
--   1. bank_connections — stores linked bank connections per household
--   2. bank_connection_accounts — maps external accounts to internal accounts
--   3. bank_sync_log — tracks sync operations and their status
--
-- Security:
--   - RLS enabled on all tables
--   - Access tokens stored encrypted (application-level, never raw)
--   - Household-scoped isolation via RLS policies
--   - Service role only for writes to sync log
--
-- DOWN migration: at the bottom and in down/ directory.

-- =============================================================================
-- 1. bank_connections
-- =============================================================================
-- Represents a connected financial institution via Plaid or MX.
-- The access_token is encrypted at the application level before storage.

CREATE TABLE bank_connections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    provider            TEXT        NOT NULL
                        CONSTRAINT  bank_connections_provider_valid
                            CHECK (provider IN ('plaid', 'mx')),
    institution_id      TEXT        NOT NULL,
    institution_name    TEXT        NOT NULL,
    -- Encrypted access token — NEVER store plaintext
    encrypted_access_token TEXT     NOT NULL,
    -- Connection status
    status              TEXT        NOT NULL DEFAULT 'active'
                        CONSTRAINT  bank_connections_status_valid
                            CHECK (status IN ('active', 'needs_reauth', 'disconnected', 'error')),
    last_synced_at      TIMESTAMPTZ,
    error_code          TEXT,
    error_message       TEXT,
    -- Metadata from provider (institution logo, etc) — no PII
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- Standard columns
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_bank_connections_household
    ON bank_connections (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_bank_connections_owner
    ON bank_connections (owner_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_bank_connections_status
    ON bank_connections (status)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE bank_connections IS
    'Linked bank connections via Plaid or MX. Access tokens are encrypted at '
    'the application level before storage. NEVER store plaintext tokens.';

COMMENT ON COLUMN bank_connections.encrypted_access_token IS
    'AES-256-GCM encrypted access token. Decryption happens in Edge Functions only. '
    'NEVER return this column in API responses.';

-- =============================================================================
-- 2. bank_connection_accounts
-- =============================================================================
-- Maps external bank accounts to internal Finance app accounts.

CREATE TABLE bank_connection_accounts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    account_id          UUID        REFERENCES accounts(id),
    external_account_id TEXT        NOT NULL,
    external_name       TEXT        NOT NULL,
    external_type       TEXT,
    external_subtype    TEXT,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    is_linked           BOOLEAN     NOT NULL DEFAULT false,
    -- Standard columns
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_bank_connection_accounts_connection
    ON bank_connection_accounts (bank_connection_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_bank_connection_accounts_household
    ON bank_connection_accounts (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_bank_connection_accounts_linked
    ON bank_connection_accounts (account_id)
    WHERE is_linked = true AND deleted_at IS NULL;

COMMENT ON TABLE bank_connection_accounts IS
    'Maps external bank accounts (from Plaid/MX) to internal Finance accounts.';

-- =============================================================================
-- 3. bank_sync_log
-- =============================================================================
-- Tracks bank data sync operations for monitoring and debugging.

CREATE TABLE bank_sync_log (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    sync_type           TEXT        NOT NULL
                        CONSTRAINT  bank_sync_log_type_valid
                            CHECK (sync_type IN ('initial', 'incremental', 'historical', 'webhook')),
    status              TEXT        NOT NULL DEFAULT 'pending'
                        CONSTRAINT  bank_sync_log_status_valid
                            CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    transactions_added  INTEGER     NOT NULL DEFAULT 0,
    transactions_updated INTEGER    NOT NULL DEFAULT 0,
    error_code          TEXT,
    error_message       TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_sync_log_connection
    ON bank_sync_log (bank_connection_id, created_at DESC);

CREATE INDEX idx_bank_sync_log_household
    ON bank_sync_log (household_id, created_at DESC);

COMMENT ON TABLE bank_sync_log IS
    'Audit log of bank data sync operations. Written by service_role only.';

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connection_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_sync_log ENABLE ROW LEVEL SECURITY;

-- bank_connections: household members can read, owners/admins can manage
CREATE POLICY bank_connections_select ON bank_connections
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

CREATE POLICY bank_connections_insert ON bank_connections
    FOR INSERT WITH CHECK (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY bank_connections_update ON bank_connections
    FOR UPDATE USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY bank_connections_delete ON bank_connections
    FOR DELETE USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

-- bank_connection_accounts: same as connections
CREATE POLICY bank_connection_accounts_select ON bank_connection_accounts
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

CREATE POLICY bank_connection_accounts_insert ON bank_connection_accounts
    FOR INSERT WITH CHECK (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY bank_connection_accounts_update ON bank_connection_accounts
    FOR UPDATE USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

-- bank_sync_log: household members can read, service_role writes
CREATE POLICY bank_sync_log_select ON bank_sync_log
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

-- No INSERT/UPDATE/DELETE for authenticated — service_role only

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_bank_connections_updated_at
    BEFORE UPDATE ON bank_connections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_bank_connection_accounts_updated_at
    BEFORE UPDATE ON bank_connection_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_bank_connection_accounts_updated_at ON bank_connection_accounts;
-- DROP TRIGGER IF EXISTS trg_bank_connections_updated_at ON bank_connections;
-- DROP POLICY IF EXISTS bank_sync_log_select ON bank_sync_log;
-- DROP POLICY IF EXISTS bank_connection_accounts_update ON bank_connection_accounts;
-- DROP POLICY IF EXISTS bank_connection_accounts_insert ON bank_connection_accounts;
-- DROP POLICY IF EXISTS bank_connection_accounts_select ON bank_connection_accounts;
-- DROP POLICY IF EXISTS bank_connections_delete ON bank_connections;
-- DROP POLICY IF EXISTS bank_connections_update ON bank_connections;
-- DROP POLICY IF EXISTS bank_connections_insert ON bank_connections;
-- DROP POLICY IF EXISTS bank_connections_select ON bank_connections;
-- ALTER TABLE bank_sync_log DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE bank_connection_accounts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE bank_connections DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS bank_sync_log;
-- DROP TABLE IF EXISTS bank_connection_accounts;
-- DROP TABLE IF EXISTS bank_connections;
