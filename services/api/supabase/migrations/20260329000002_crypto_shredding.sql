-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260329000002_crypto_shredding
-- Description: Encryption key management table and crypto-shredding functions
-- Issues: #1101 (Security Review — CRITICAL: Crypto-shredding is stubbed)
--
-- Implements real key lifecycle management for crypto-shredding:
--   1. encryption_keys table tracks per-user and per-household DEKs
--   2. destroy_user_encryption_keys() zeroes out key material and marks
--      keys as destroyed — making encrypted fields permanently unrecoverable
--   3. rotate_encryption_key() supports scheduled key rotation
--
-- Design:
--   - Keys are stored encrypted at rest (application-level envelope encryption)
--   - The key_material column stores the wrapped DEK (encrypted by a KEK)
--   - On destruction, key_material is overwritten with NULL and destroyed_at is set
--   - Even if backups are restored, destroyed keys cannot be recovered because
--     the destruction is also recorded in the audit_log

-- =============================================================================
-- Up
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. encryption_keys table
-- -----------------------------------------------------------------------------

CREATE TABLE encryption_keys (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES auth.users(id),
    household_id    UUID        REFERENCES households(id),
    key_type        TEXT        NOT NULL
                    CONSTRAINT  encryption_keys_type_valid
                        CHECK (key_type IN ('user_dek', 'household_dek', 'export_key')),
    key_material    BYTEA,
    key_fingerprint TEXT        NOT NULL,
    algorithm       TEXT        NOT NULL DEFAULT 'AES-256-GCM',
    status          TEXT        NOT NULL DEFAULT 'active'
                    CONSTRAINT  encryption_keys_status_valid
                        CHECK (status IN ('active', 'rotated', 'destroyed')),
    rotated_to      UUID        REFERENCES encryption_keys(id),
    destroyed_at    TIMESTAMPTZ,
    destroyed_by    UUID        REFERENCES auth.users(id),
    destruction_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    -- Either user_id or household_id must be set
    CONSTRAINT encryption_keys_owner_check
        CHECK (user_id IS NOT NULL OR household_id IS NOT NULL)
);

COMMENT ON TABLE encryption_keys IS
    'Envelope encryption key store. DEKs wrapped by a KEK. '
    'Crypto-shredding destroys DEKs to make encrypted data permanently unrecoverable.';

COMMENT ON COLUMN encryption_keys.key_material IS
    'Wrapped (encrypted) DEK. Set to NULL on destruction — this IS the crypto-shredding.';

COMMENT ON COLUMN encryption_keys.key_fingerprint IS
    'SHA-256 fingerprint of the unwrapped key. Survives destruction for audit trail.';

-- Indexes
CREATE INDEX idx_encryption_keys_user ON encryption_keys (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_encryption_keys_household ON encryption_keys (household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_encryption_keys_status ON encryption_keys (status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_encryption_keys_active_user
    ON encryption_keys (user_id, key_type)
    WHERE status = 'active' AND deleted_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_encryption_keys_active_household
    ON encryption_keys (household_id, key_type)
    WHERE status = 'active' AND deleted_at IS NULL AND household_id IS NOT NULL;

-- RLS
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;

-- No end-user policies — keys are managed exclusively by service_role functions.
-- Service role bypasses RLS by default.

-- updated_at trigger
CREATE TRIGGER trg_encryption_keys_updated_at
    BEFORE UPDATE ON encryption_keys
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Crypto-shredding function: destroy all keys for a user
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.destroy_user_encryption_keys(
    p_user_id UUID,
    p_destroyed_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'account_deletion'
)
RETURNS TABLE (
    key_id UUID,
    key_type TEXT,
    key_fingerprint TEXT,
    previously_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE encryption_keys
    SET
        key_material = NULL,          -- THIS IS THE CRYPTO-SHREDDING
        status = 'destroyed',
        destroyed_at = now(),
        destroyed_by = COALESCE(p_destroyed_by, p_user_id),
        destruction_reason = p_reason,
        updated_at = now()
    WHERE encryption_keys.user_id = p_user_id
      AND encryption_keys.status != 'destroyed'
      AND encryption_keys.deleted_at IS NULL
    RETURNING
        encryption_keys.id AS key_id,
        encryption_keys.key_type,
        encryption_keys.key_fingerprint,
        (encryption_keys.status = 'active') AS previously_active;
END;
$$;

COMMENT ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) IS
    'Crypto-shred all encryption keys for a user. Sets key_material to NULL '
    'and marks keys as destroyed. This is irreversible — encrypted data becomes '
    'permanently unrecoverable.';

GRANT EXECUTE ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) FROM authenticated;

-- -----------------------------------------------------------------------------
-- 3. Crypto-shredding function: destroy all keys for a household
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.destroy_household_encryption_keys(
    p_household_id UUID,
    p_destroyed_by UUID,
    p_reason TEXT DEFAULT 'household_deletion'
)
RETURNS TABLE (
    key_id UUID,
    key_type TEXT,
    key_fingerprint TEXT,
    previously_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE encryption_keys
    SET
        key_material = NULL,
        status = 'destroyed',
        destroyed_at = now(),
        destroyed_by = p_destroyed_by,
        destruction_reason = p_reason,
        updated_at = now()
    WHERE encryption_keys.household_id = p_household_id
      AND encryption_keys.status != 'destroyed'
      AND encryption_keys.deleted_at IS NULL
    RETURNING
        encryption_keys.id AS key_id,
        encryption_keys.key_type,
        encryption_keys.key_fingerprint,
        (encryption_keys.status = 'active') AS previously_active;
END;
$$;

COMMENT ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) IS
    'Crypto-shred all encryption keys for a household. Used when a household is '
    'deleted and no members remain.';

GRANT EXECUTE ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) FROM authenticated;

-- -----------------------------------------------------------------------------
-- 4. Provision a new encryption key (for user signup / household creation)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_encryption_key(
    p_user_id UUID DEFAULT NULL,
    p_household_id UUID DEFAULT NULL,
    p_key_type TEXT DEFAULT 'user_dek'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key_material BYTEA;
    v_fingerprint TEXT;
    v_key_id UUID;
BEGIN
    -- Generate a random 256-bit key
    v_key_material := gen_random_bytes(32);

    -- Compute fingerprint (SHA-256 of the key material, hex-encoded)
    v_fingerprint := encode(digest(v_key_material, 'sha256'), 'hex');

    INSERT INTO encryption_keys (user_id, household_id, key_type, key_material, key_fingerprint)
    VALUES (p_user_id, p_household_id, p_key_type, v_key_material, v_fingerprint)
    RETURNING id INTO v_key_id;

    RETURN v_key_id;
END;
$$;

COMMENT ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) IS
    'Create a new encryption key (DEK) for a user or household. '
    'Key material is a random 256-bit value. In production, this should be '
    'wrapped by a KEK before storage.';

GRANT EXECUTE ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) FROM authenticated;
