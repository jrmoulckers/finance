-- DOWN: 20260329000002_crypto_shredding
DROP FUNCTION IF EXISTS public.provision_encryption_key(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.destroy_household_encryption_keys(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.destroy_user_encryption_keys(UUID, UUID, TEXT);
DROP TRIGGER IF EXISTS trg_encryption_keys_updated_at ON encryption_keys;
ALTER TABLE encryption_keys DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS encryption_keys;
