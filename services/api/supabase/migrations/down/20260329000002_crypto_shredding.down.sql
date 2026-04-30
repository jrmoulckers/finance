-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260329000002_crypto_shredding
-- Description: Drop encryption key management table and functions
-- Issues: #1101

-- =============================================================================
-- Down
-- =============================================================================

-- Drop functions first
DROP FUNCTION IF EXISTS public.provision_encryption_key(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.destroy_household_encryption_keys(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.destroy_user_encryption_keys(UUID, UUID, TEXT);

-- Drop trigger
DROP TRIGGER IF EXISTS trg_encryption_keys_updated_at ON encryption_keys;

-- Disable RLS before dropping
ALTER TABLE encryption_keys DISABLE ROW LEVEL SECURITY;

-- Drop the table
DROP TABLE IF EXISTS encryption_keys;
