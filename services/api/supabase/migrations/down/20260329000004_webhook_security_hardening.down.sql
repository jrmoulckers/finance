-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260329000004_webhook_security_hardening
-- Description: Drop webhook security hardening infrastructure
-- Issues: #1104

-- =============================================================================
-- Down
-- =============================================================================

-- Drop functions
DROP FUNCTION IF EXISTS public.cleanup_expired_webhook_nonces(INTEGER);
DROP FUNCTION IF EXISTS public.check_webhook_ip_allowed(TEXT, INET);
DROP FUNCTION IF EXISTS public.validate_webhook_nonce(TEXT, TEXT, INTEGER);

-- Drop trigger
DROP TRIGGER IF EXISTS trg_webhook_ip_allowlist_updated_at ON webhook_ip_allowlist;

-- Disable RLS
ALTER TABLE webhook_ip_allowlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_nonces DISABLE ROW LEVEL SECURITY;

-- Drop tables
DROP TABLE IF EXISTS webhook_ip_allowlist;
DROP TABLE IF EXISTS webhook_nonces;
