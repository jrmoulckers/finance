-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000006_data_import_pipeline
-- Description: Create import_jobs table for tracking CSV import processing
-- Issues: #sprint-11
--
-- Supports:
--   - CSV upload processing with column mapping
--   - Duplicate detection by amount + date + description
--   - Batch transaction insertion
--   - Import progress tracking and error reporting
--   - Support for Mint and YNAB CSV formats
--
-- Security:
--   - RLS enabled — household-scoped access
--   - Only the import creator can view/manage their import jobs
--   - Monetary values from imports stored as BIGINT (cents)
--
-- DOWN migration: services/api/supabase/migrations/down/20260328000006_data_import_pipeline.down.sql

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE import_jobs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    owner_id            UUID        NOT NULL REFERENCES auth.users(id),
    account_id          UUID        NOT NULL REFERENCES accounts(id),
    file_name           TEXT        NOT NULL,
    format              TEXT        NOT NULL DEFAULT 'generic'
        CHECK (format IN ('generic', 'mint', 'ynab')),
    status              TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    total_rows          INTEGER     NOT NULL DEFAULT 0,
    imported_rows       INTEGER     NOT NULL DEFAULT 0,
    duplicate_rows      INTEGER     NOT NULL DEFAULT 0,
    error_rows          INTEGER     NOT NULL DEFAULT 0,
    column_mapping      JSONB       DEFAULT '{}',
    errors              JSONB       DEFAULT '[]',
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT row_counts_non_negative CHECK (
        total_rows >= 0 AND imported_rows >= 0
        AND duplicate_rows >= 0 AND error_rows >= 0
    )
);

CREATE INDEX idx_import_jobs_household
    ON import_jobs (household_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_import_jobs_owner
    ON import_jobs (owner_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_import_jobs_status
    ON import_jobs (status)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE import_jobs IS
    'Tracks CSV import jobs. Each job imports transactions from a CSV file into a target account.';
COMMENT ON COLUMN import_jobs.column_mapping IS
    'JSONB mapping of CSV column names to transaction fields: { date: "Date", amount: "Amount", payee: "Description", ... }.';
COMMENT ON COLUMN import_jobs.errors IS
    'JSONB array of row-level errors: [{ row: 5, field: "amount", message: "Invalid number" }, ...]. Never contains PII.';
COMMENT ON COLUMN import_jobs.format IS
    'CSV format: generic (auto-detect), mint (Mint export), ynab (YNAB export).';

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_import_jobs_updated_at
    BEFORE UPDATE ON import_jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Users can see import jobs in their households
CREATE POLICY import_jobs_select ON import_jobs
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

-- Users can create import jobs in their households (must be the owner)
CREATE POLICY import_jobs_insert ON import_jobs
    FOR INSERT
    WITH CHECK (
        owner_id = auth.uid()
        AND household_id = ANY(auth.household_ids())
    );

-- Only the import creator can update their jobs
CREATE POLICY import_jobs_update ON import_jobs
    FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Only the import creator can delete their jobs
CREATE POLICY import_jobs_delete ON import_jobs
    FOR DELETE
    USING (owner_id = auth.uid());
