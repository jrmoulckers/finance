-- DOWN: 20260329000003_rate_limit_enhancement
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limit_blocks();
DROP FUNCTION IF EXISTS public.check_rate_limit_enhanced(TEXT, INTEGER, INTEGER, INTEGER, INTEGER);
ALTER TABLE rate_limit_blocks DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS rate_limit_blocks;
