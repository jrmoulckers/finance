-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260329000003_rate_limit_enhancement
-- Description: Drop enhanced rate limiting infrastructure
-- Issues: #1103

-- =============================================================================
-- Down
-- =============================================================================

-- Drop functions
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limit_blocks();
DROP FUNCTION IF EXISTS public.check_rate_limit_enhanced(TEXT, INTEGER, INTEGER, INTEGER, INTEGER);

-- Disable RLS
ALTER TABLE rate_limit_blocks DISABLE ROW LEVEL SECURITY;

-- Drop table
DROP TABLE IF EXISTS rate_limit_blocks;
