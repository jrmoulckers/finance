-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260328000006_data_import_pipeline
-- Description: Drop import_jobs table and all related objects
-- Issues: #sprint-11

-- Drop RLS policies
DROP POLICY IF EXISTS import_jobs_delete ON import_jobs;
DROP POLICY IF EXISTS import_jobs_update ON import_jobs;
DROP POLICY IF EXISTS import_jobs_insert ON import_jobs;
DROP POLICY IF EXISTS import_jobs_select ON import_jobs;

-- Disable RLS
ALTER TABLE import_jobs DISABLE ROW LEVEL SECURITY;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_import_jobs_updated_at ON import_jobs;

-- Drop table (cascades indexes and constraints)
DROP TABLE IF EXISTS import_jobs;
