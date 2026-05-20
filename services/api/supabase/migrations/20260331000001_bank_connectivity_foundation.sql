-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260331000001_bank_connectivity_foundation
-- Description: Bank connectivity infrastructure — multi-aggregator abstraction,
--   connection health monitoring, transaction provenance, third-party permissions,
--   open banking layer, and expanded import format support.
-- Issues: #1575, #1577, #1580, #1583, #1586, #1602
--
-- Tables added:
--   1. aggregator_providers     — Registry of data aggregation providers
--   2. bank_connection_health   — Health history log per connection
--   3. connector_permissions    — Third-party connector permission records
--   4. connector_access_log     — Audit log of third-party data access
--   5. open_banking_connections — Direct open banking (PSD2/1033) connections
--
-- Tables modified:
--   6. bank_connections — Add failover, staleness, permission columns
--   7. import_jobs      — Add OFX/QFX/QIF format support & provenance
--   8. transactions     — Add provenance columns (source, dates, import ref)
--
-- Security:
--   - RLS enabled on all new tables
--   - Household-scoped isolation via RLS policies
--   - Encrypted tokens for open banking connections
--   - NEVER return access tokens in any response
--
-- DOWN migration: services/api/supabase/migrations/down/20260331000001_bank_connectivity_foundation.down.sql

-- =============================================================================
-- 1. aggregator_providers — Multi-aggregator registry (#1575)
-- =============================================================================
-- Tracks supported data aggregation providers, their health status, and
-- failover priority. Enables automatic failover when a provider goes down.

CREATE TABLE aggregator_providers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT        NOT NULL UNIQUE,
    display_name        TEXT        NOT NULL,
    provider_type       TEXT        NOT NULL DEFAULT 'aggregator'
                        CONSTRAINT  aggregator_providers_type_valid
                            CHECK (provider_type IN ('aggregator', 'open_banking', 'direct')),
    -- Health status
    status              TEXT        NOT NULL DEFAULT 'active'
                        CONSTRAINT  aggregator_providers_status_valid
                            CHECK (status IN ('active', 'degraded', 'down', 'maintenance')),
    health_score        INTEGER     NOT NULL DEFAULT 100
                        CONSTRAINT  aggregator_providers_health_range
                            CHECK (health_score >= 0 AND health_score <= 100),
    -- Failover configuration
    priority            INTEGER     NOT NULL DEFAULT 0,
    is_enabled          BOOLEAN     NOT NULL DEFAULT true,
    -- Supported regions (ISO 3166-1 alpha-2 codes, JSON array)
    supported_regions   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Capabilities metadata (read-only, read-write, etc.)
    capabilities        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- Last health check
    last_health_check   TIMESTAMPTZ,
    last_incident_at    TIMESTAMPTZ,
    incident_count      INTEGER     NOT NULL DEFAULT 0,
    -- Standard columns
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_aggregator_providers_status
    ON aggregator_providers (status, priority)
    WHERE deleted_at IS NULL AND is_enabled = true;

COMMENT ON TABLE aggregator_providers IS
    'Registry of data aggregation providers (Plaid, MX, Yodlee, open banking). '
    'Tracks health status and failover priority for automatic provider switching.';

-- =============================================================================
-- 2. bank_connection_health — Health history log (#1577)
-- =============================================================================
-- Records health status changes for each bank connection over time.
-- Powers the connection health dashboard and staleness detection.

CREATE TABLE bank_connection_health (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    -- Health snapshot
    status              TEXT        NOT NULL
                        CONSTRAINT  bank_connection_health_status_valid
                            CHECK (status IN (
                                'healthy', 'stale', 'auth_expired', 'provider_down',
                                'rate_limited', 'institution_error', 'unknown_error'
                            )),
    error_category      TEXT
                        CONSTRAINT  bank_connection_health_error_cat_valid
                            CHECK (error_category IS NULL OR error_category IN (
                                'auth', 'provider', 'institution', 'network', 'data', 'rate_limit'
                            )),
    error_detail        TEXT,
    -- Staleness tracking
    last_successful_sync TIMESTAMPTZ,
    staleness_minutes   INTEGER,
    -- Resolution
    resolved_at         TIMESTAMPTZ,
    resolution_action   TEXT,
    -- Standard columns
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_connection_health_connection
    ON bank_connection_health (bank_connection_id, created_at DESC);

CREATE INDEX idx_bank_connection_health_household
    ON bank_connection_health (household_id, created_at DESC);

CREATE INDEX idx_bank_connection_health_status
    ON bank_connection_health (status, created_at DESC);

COMMENT ON TABLE bank_connection_health IS
    'Health history log for bank connections. Powers the connection health '
    'dashboard, staleness detection, and error categorization. (#1577)';

-- =============================================================================
-- 3. connector_permissions — Third-party permissions (#1583)
-- =============================================================================
-- Records what permissions each connected service/aggregator has been
-- granted. Defaults to read-only for all bank connections.

CREATE TABLE connector_permissions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    -- Permission details
    permission_level    TEXT        NOT NULL DEFAULT 'read_only'
                        CONSTRAINT  connector_permissions_level_valid
                            CHECK (permission_level IN ('read_only', 'read_write', 'read_balance', 'read_transactions')),
    -- Scopes granted (provider-specific, e.g., Plaid products)
    granted_scopes      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Scope descriptions (human-readable)
    scope_descriptions  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Revocation
    is_revoked          BOOLEAN     NOT NULL DEFAULT false,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      TEXT,
    -- Token freshness
    token_status        TEXT        NOT NULL DEFAULT 'active'
                        CONSTRAINT  connector_permissions_token_valid
                            CHECK (token_status IN ('active', 'expired', 'revoked', 'refreshing')),
    token_expires_at    TIMESTAMPTZ,
    last_refreshed_at   TIMESTAMPTZ,
    -- Standard columns
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_connector_permissions_connection
    ON connector_permissions (bank_connection_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_connector_permissions_household
    ON connector_permissions (household_id)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE connector_permissions IS
    'Tracks permissions granted to each third-party connector. Defaults to '
    'read-only. Powers the safety center showing all third-party access. (#1583)';

-- =============================================================================
-- 4. connector_access_log — Third-party access audit (#1583)
-- =============================================================================
-- Audit trail of every data access by a third-party connector.
-- Written by service_role only. Users can read their household logs.

CREATE TABLE connector_access_log (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    -- Access details (NEVER log raw financial data)
    access_type         TEXT        NOT NULL
                        CONSTRAINT  connector_access_log_type_valid
                            CHECK (access_type IN (
                                'sync_transactions', 'sync_balances', 'sync_accounts',
                                'verify_identity', 'refresh_token', 'revoke_access'
                            )),
    provider_name       TEXT        NOT NULL,
    -- Outcome
    status              TEXT        NOT NULL DEFAULT 'success'
                        CONSTRAINT  connector_access_log_status_valid
                            CHECK (status IN ('success', 'failure', 'partial')),
    record_count        INTEGER     NOT NULL DEFAULT 0,
    error_message       TEXT,
    -- Timing
    duration_ms         INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_connector_access_log_connection
    ON connector_access_log (bank_connection_id, created_at DESC);

CREATE INDEX idx_connector_access_log_household
    ON connector_access_log (household_id, created_at DESC);

COMMENT ON TABLE connector_access_log IS
    'Audit log of third-party data access events. NEVER contains raw financial '
    'data — only metadata (type, count, status). Service_role writes only. (#1583)';

-- =============================================================================
-- 5. open_banking_connections — Direct open banking feeds (#1586)
-- =============================================================================
-- Stores direct open banking connections (PSD2, CFPB 1033) that bypass
-- third-party aggregators for supported institutions.

CREATE TABLE open_banking_connections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    -- Open banking details
    consent_id          TEXT        NOT NULL,
    consent_status      TEXT        NOT NULL DEFAULT 'authorized'
                        CONSTRAINT  ob_connections_consent_valid
                            CHECK (consent_status IN (
                                'pending', 'authorized', 'rejected', 'revoked', 'expired'
                            )),
    consent_expires_at  TIMESTAMPTZ,
    -- Regulation framework
    regulation          TEXT        NOT NULL DEFAULT 'psd2'
                        CONSTRAINT  ob_connections_regulation_valid
                            CHECK (regulation IN ('psd2', 'cfpb_1033', 'cdr', 'obie')),
    -- Institution API endpoint (NEVER store credentials here)
    api_base_url        TEXT,
    -- Encrypted refresh token for renewing consent
    encrypted_refresh_token TEXT,
    -- Standard columns
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_ob_connections_bank_connection
    ON open_banking_connections (bank_connection_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_ob_connections_household
    ON open_banking_connections (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_ob_connections_consent_status
    ON open_banking_connections (consent_status)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE open_banking_connections IS
    'Direct open banking connections (PSD2/CFPB 1033) that bypass third-party '
    'aggregators. Refresh tokens are encrypted at the application level. (#1586)';

COMMENT ON COLUMN open_banking_connections.encrypted_refresh_token IS
    'AES-256-GCM encrypted refresh token. Decryption happens in Edge Functions only. '
    'NEVER return this column in API responses.';

-- =============================================================================
-- 6. ALTER bank_connections — Add failover & staleness columns (#1575, #1577)
-- =============================================================================

ALTER TABLE bank_connections
    ADD COLUMN IF NOT EXISTS aggregator_provider_id UUID REFERENCES aggregator_providers(id),
    ADD COLUMN IF NOT EXISTS failover_provider_id   UUID REFERENCES aggregator_providers(id),
    ADD COLUMN IF NOT EXISTS staleness_threshold_hours INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS permission_level TEXT NOT NULL DEFAULT 'read_only'
        CONSTRAINT bank_connections_permission_valid
            CHECK (permission_level IN ('read_only', 'read_write', 'read_balance', 'read_transactions')),
    ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'aggregator'
        CONSTRAINT bank_connections_conn_type_valid
            CHECK (connection_type IN ('aggregator', 'open_banking', 'direct'));

-- Update the provider CHECK to include additional aggregators
ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_provider_valid;
ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_provider_valid
    CHECK (provider IN ('plaid', 'mx', 'yodlee', 'finicity', 'open_banking', 'direct'));

-- =============================================================================
-- 7. ALTER import_jobs — Expand format support & provenance (#1580, #1602)
-- =============================================================================

-- Drop existing format constraint and add expanded one
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_format_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_format_check
    CHECK (format IN ('generic', 'mint', 'ynab', 'ofx', 'qfx', 'qif', 'excel'));

-- Add provenance columns
ALTER TABLE import_jobs
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
        CONSTRAINT import_jobs_source_valid
            CHECK (source_type IN ('manual', 'aggregator', 'open_banking', 'file_import')),
    ADD COLUMN IF NOT EXISTS original_file_hash TEXT,
    ADD COLUMN IF NOT EXISTS duplicate_strategy TEXT NOT NULL DEFAULT 'skip'
        CONSTRAINT import_jobs_dup_strategy_valid
            CHECK (duplicate_strategy IN ('skip', 'overwrite', 'create_duplicate'));

-- =============================================================================
-- 8. ALTER transactions — Add provenance columns (#1580)
-- =============================================================================
-- Track where each transaction came from and preserve original dates.

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
        CONSTRAINT transactions_source_valid
            CHECK (source IN ('manual', 'aggregator', 'open_banking', 'file_import')),
    ADD COLUMN IF NOT EXISTS authorized_date DATE,
    ADD COLUMN IF NOT EXISTS posted_date DATE,
    ADD COLUMN IF NOT EXISTS import_source_id TEXT,
    ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES import_jobs(id),
    ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 100
        CONSTRAINT transactions_confidence_range
            CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
    ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

CREATE INDEX idx_transactions_source
    ON transactions (source)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_transactions_provider_txn_id
    ON transactions (provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_transactions_import_job
    ON transactions (import_job_id)
    WHERE import_job_id IS NOT NULL AND deleted_at IS NULL;

-- Duplicate detection index: amount + date + payee within a household
CREATE INDEX idx_transactions_duplicate_detection
    ON transactions (household_id, date, amount_cents, payee)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- RLS — Enable on all new tables
-- =============================================================================

ALTER TABLE aggregator_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connection_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_banking_connections ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies — aggregator_providers (read-only for all authenticated)
-- =============================================================================
-- Provider registry is global reference data; all authenticated users can read.

CREATE POLICY aggregator_providers_select ON aggregator_providers
    FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT/UPDATE/DELETE — service_role only (no user policies)

-- =============================================================================
-- RLS Policies — bank_connection_health
-- =============================================================================

CREATE POLICY bank_connection_health_select ON bank_connection_health
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

-- INSERT — service_role only (health entries are written by sync engine)

-- =============================================================================
-- RLS Policies — connector_permissions
-- =============================================================================

CREATE POLICY connector_permissions_select ON connector_permissions
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

CREATE POLICY connector_permissions_insert ON connector_permissions
    FOR INSERT WITH CHECK (
        owner_id = auth.uid()
        AND household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY connector_permissions_update ON connector_permissions
    FOR UPDATE USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

-- =============================================================================
-- RLS Policies — connector_access_log
-- =============================================================================

CREATE POLICY connector_access_log_select ON connector_access_log
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

-- INSERT — service_role only (audit entries written by Edge Functions)

-- =============================================================================
-- RLS Policies — open_banking_connections
-- =============================================================================

CREATE POLICY ob_connections_select ON open_banking_connections
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

CREATE POLICY ob_connections_insert ON open_banking_connections
    FOR INSERT WITH CHECK (
        owner_id = auth.uid()
        AND household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY ob_connections_update ON open_banking_connections
    FOR UPDATE USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
              AND role IN ('owner', 'admin')
        )
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_aggregator_providers_updated_at
    BEFORE UPDATE ON aggregator_providers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_connector_permissions_updated_at
    BEFORE UPDATE ON connector_permissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_open_banking_connections_updated_at
    BEFORE UPDATE ON open_banking_connections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Seed aggregator providers (initial registry)
-- =============================================================================
-- These are reference data entries, not user data. Service-role seeded.

INSERT INTO aggregator_providers (name, display_name, provider_type, priority, supported_regions, capabilities)
VALUES
    ('plaid', 'Plaid', 'aggregator', 1,
     '["US", "CA", "GB", "IE", "FR", "ES", "NL"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": true, "investments": true}'::jsonb),
    ('mx', 'MX', 'aggregator', 2,
     '["US", "CA"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": true}'::jsonb),
    ('yodlee', 'Yodlee (Envestnet)', 'aggregator', 3,
     '["US", "CA", "GB", "AU", "IN"]'::jsonb,
     '{"transactions": true, "balances": true, "investments": true}'::jsonb),
    ('finicity', 'Finicity (Mastercard)', 'aggregator', 4,
     '["US", "CA"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": true}'::jsonb),
    ('open_banking_uk', 'UK Open Banking (OBIE)', 'open_banking', 10,
     '["GB"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": false}'::jsonb),
    ('open_banking_eu', 'PSD2 Open Banking', 'open_banking', 11,
     '["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "SE", "DK", "NO"]'::jsonb,
     '{"transactions": true, "balances": true, "identity": false}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- See: services/api/supabase/migrations/down/20260331000001_bank_connectivity_foundation.down.sql
--
-- ALTER TABLE transactions DROP COLUMN IF EXISTS source;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS authorized_date;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS posted_date;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS import_source_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS import_job_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS provider_transaction_id;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS confidence_score;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS imported_at;
-- DROP INDEX IF EXISTS idx_transactions_source;
-- DROP INDEX IF EXISTS idx_transactions_provider_txn_id;
-- DROP INDEX IF EXISTS idx_transactions_import_job;
-- DROP INDEX IF EXISTS idx_transactions_duplicate_detection;
-- ALTER TABLE import_jobs DROP COLUMN IF EXISTS source_type;
-- ALTER TABLE import_jobs DROP COLUMN IF EXISTS original_file_hash;
-- ALTER TABLE import_jobs DROP COLUMN IF EXISTS duplicate_strategy;
-- ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_format_check;
-- ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_format_check CHECK (format IN ('generic', 'mint', 'ynab'));
-- ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_source_valid;
-- ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_dup_strategy_valid;
-- ALTER TABLE bank_connections DROP COLUMN IF EXISTS aggregator_provider_id;
-- ALTER TABLE bank_connections DROP COLUMN IF EXISTS failover_provider_id;
-- ALTER TABLE bank_connections DROP COLUMN IF EXISTS staleness_threshold_hours;
-- ALTER TABLE bank_connections DROP COLUMN IF EXISTS permission_level;
-- ALTER TABLE bank_connections DROP COLUMN IF EXISTS connection_type;
-- ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_permission_valid;
-- ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_conn_type_valid;
-- ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_provider_valid;
-- ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_provider_valid CHECK (provider IN ('plaid', 'mx'));
-- DROP TRIGGER IF EXISTS trg_open_banking_connections_updated_at ON open_banking_connections;
-- DROP TRIGGER IF EXISTS trg_connector_permissions_updated_at ON connector_permissions;
-- DROP TRIGGER IF EXISTS trg_aggregator_providers_updated_at ON aggregator_providers;
-- DROP TABLE IF EXISTS open_banking_connections;
-- DROP TABLE IF EXISTS connector_access_log;
-- DROP TABLE IF EXISTS connector_permissions;
-- DROP TABLE IF EXISTS bank_connection_health;
-- DROP TABLE IF EXISTS aggregator_providers;
