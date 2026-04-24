-- DOWN: 20260329000001_gdpr_consent_capture
DROP FUNCTION IF EXISTS public.has_active_consent(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_user_consent_status(UUID, TEXT);
DROP POLICY IF EXISTS user_consents_insert ON user_consents;
DROP POLICY IF EXISTS user_consents_select ON user_consents;
ALTER TABLE user_consents DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS user_consents;
