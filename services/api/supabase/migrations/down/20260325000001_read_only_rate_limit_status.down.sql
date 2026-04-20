-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260325000001_read_only_rate_limit_status
-- Description: Drop the read-only rate limit status RPC
-- Issues: #893

DROP FUNCTION IF EXISTS public.get_rate_limit_status(text, integer);
