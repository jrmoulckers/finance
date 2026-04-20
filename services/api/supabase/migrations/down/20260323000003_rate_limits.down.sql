-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260323000003_rate_limits
-- Description: Drop rate limits table and related functions
-- Issues: #893

-- Drop functions
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limits(integer);
DROP FUNCTION IF EXISTS public.check_rate_limit(text, integer, integer);

-- Disable RLS and drop table
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS rate_limits;
