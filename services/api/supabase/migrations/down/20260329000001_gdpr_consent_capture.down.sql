-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260329000001_gdpr_consent_capture
-- Description: Drop GDPR consent capture table and helper functions
-- Issues: #1100

-- =============================================================================
-- Down
-- =============================================================================

-- Drop functions first (no dependents)
DROP FUNCTION IF EXISTS public.has_active_consent(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_user_consent_status(UUID, TEXT);

-- Drop RLS policies
DROP POLICY IF EXISTS user_consents_insert ON user_consents;
DROP POLICY IF EXISTS user_consents_select ON user_consents;

-- Disable RLS before dropping
ALTER TABLE user_consents DISABLE ROW LEVEL SECURITY;

-- Drop the table
DROP TABLE IF EXISTS user_consents;
