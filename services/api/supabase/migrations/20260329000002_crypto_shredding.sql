-- SPDX-License-Identifier: BUSL-1.1
-- Migration: 20260329000002_crypto_shredding (#1101 CRITICAL)
-- Up
CREATE TABLE encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    household_id UUID REFERENCES households(id),
    key_type TEXT NOT NULL CHECK (key_type IN ('user_dek','household_dek','export_key')),
    key_material BYTEA,
    key_fingerprint TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotated','destroyed')),
    rotated_to UUID REFERENCES encryption_keys(id),
    destroyed_at TIMESTAMPTZ, destroyed_by UUID REFERENCES auth.users(id),
    destruction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ,
    CONSTRAINT encryption_keys_owner_check CHECK (user_id IS NOT NULL OR household_id IS NOT NULL)
);
CREATE INDEX idx_encryption_keys_user ON encryption_keys (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_encryption_keys_household ON encryption_keys (household_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_encryption_keys_active_user ON encryption_keys (user_id, key_type) WHERE status = 'active' AND deleted_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_encryption_keys_active_household ON encryption_keys (household_id, key_type) WHERE status = 'active' AND deleted_at IS NULL AND household_id IS NOT NULL;
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_encryption_keys_updated_at BEFORE UPDATE ON encryption_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.destroy_user_encryption_keys(p_user_id UUID, p_destroyed_by UUID DEFAULT NULL, p_reason TEXT DEFAULT 'account_deletion')
RETURNS TABLE (key_id UUID, key_type TEXT, key_fingerprint TEXT, previously_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY UPDATE encryption_keys SET key_material = NULL, status = 'destroyed', destroyed_at = now(), destroyed_by = COALESCE(p_destroyed_by, p_user_id), destruction_reason = p_reason, updated_at = now()
    WHERE encryption_keys.user_id = p_user_id AND encryption_keys.status != 'destroyed' AND encryption_keys.deleted_at IS NULL
    RETURNING encryption_keys.id, encryption_keys.key_type, encryption_keys.key_fingerprint, (encryption_keys.status = 'active');
END; $$;
GRANT EXECUTE ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.destroy_user_encryption_keys(UUID, UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.destroy_household_encryption_keys(p_household_id UUID, p_destroyed_by UUID, p_reason TEXT DEFAULT 'household_deletion')
RETURNS TABLE (key_id UUID, key_type TEXT, key_fingerprint TEXT, previously_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY UPDATE encryption_keys SET key_material = NULL, status = 'destroyed', destroyed_at = now(), destroyed_by = p_destroyed_by, destruction_reason = p_reason, updated_at = now()
    WHERE encryption_keys.household_id = p_household_id AND encryption_keys.status != 'destroyed' AND encryption_keys.deleted_at IS NULL
    RETURNING encryption_keys.id, encryption_keys.key_type, encryption_keys.key_fingerprint, (encryption_keys.status = 'active');
END; $$;
GRANT EXECUTE ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.destroy_household_encryption_keys(UUID, UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.provision_encryption_key(p_user_id UUID DEFAULT NULL, p_household_id UUID DEFAULT NULL, p_key_type TEXT DEFAULT 'user_dek')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key_material BYTEA; v_fingerprint TEXT; v_key_id UUID;
BEGIN
    v_key_material := gen_random_bytes(32);
    v_fingerprint := encode(digest(v_key_material, 'sha256'), 'hex');
    INSERT INTO encryption_keys (user_id, household_id, key_type, key_material, key_fingerprint) VALUES (p_user_id, p_household_id, p_key_type, v_key_material, v_fingerprint) RETURNING id INTO v_key_id;
    RETURN v_key_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.provision_encryption_key(UUID, UUID, TEXT) FROM PUBLIC;
