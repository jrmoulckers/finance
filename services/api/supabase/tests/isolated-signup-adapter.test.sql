-- SPDX-License-Identifier: BUSL-1.1
-- Run only in the existing disposable CI database, or an approved fresh local DB.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL finance.isolated_signup_adapter = 'synthetic-local-only';
\ir ../local-only/isolated-signup-adapter.sql

CREATE FUNCTION pg_temp.assert_signup(condition boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF NOT coalesce(condition, false) THEN
        RAISE EXCEPTION 'isolated signup assertion failed: %', message;
    END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_signup_error(statement text, expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = expected_message THEN RETURN; END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'isolated signup expected failure was not raised';
END;
$$;

CREATE FUNCTION pg_temp.expect_signup_denial(statement text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN insufficient_privilege THEN RETURN;
    END;
    RAISE EXCEPTION 'isolated signup expected permission denial was not raised';
END;
$$;

SET LOCAL finance.isolated_signup_adapter = 'disabled';
SELECT pg_temp.expect_signup_error(
    'SELECT pg_temp.check_isolated_signup_prerequisites()',
    'isolated signup adapter requires explicit local-only opt-in');
SET LOCAL finance.isolated_signup_adapter = 'synthetic-local-only';

ALTER TABLE supabase_migrations.schema_migrations RENAME TO isolated_test_saved_history;
SELECT pg_temp.expect_signup_error(
    'SELECT pg_temp.check_isolated_signup_prerequisites()',
    'isolated signup adapter requires verified migration history');
ALTER TABLE supabase_migrations.isolated_test_saved_history RENAME TO schema_migrations;

ALTER FUNCTION public.handle_new_user_signup(uuid,text,text) RENAME TO isolated_test_saved_signup;
SELECT pg_temp.expect_signup_error(
    'SELECT pg_temp.check_isolated_signup_prerequisites()',
    'isolated signup adapter requires the migrated auth/profile/household schema');
ALTER FUNCTION public.isolated_test_saved_signup(uuid,text,text) RENAME TO handle_new_user_signup;

UPDATE supabase_migrations.schema_migrations
SET version = 'isolated-test-missing-version' WHERE version = '20260316000001';
SELECT pg_temp.expect_signup_error(
    'SELECT pg_temp.check_isolated_signup_prerequisites()',
    'isolated signup adapter migration inventory mismatch');
UPDATE supabase_migrations.schema_migrations
SET version = '20260316000001' WHERE version = 'isolated-test-missing-version';

SELECT pg_temp.expect_signup_error(
    'SELECT pg_temp.check_isolated_signup_prerequisites()',
    'isolated signup adapter refuses an existing auth INSERT trigger');

CREATE TEMP TABLE signup_subjects (position int, user_id uuid, household_id uuid);
INSERT INTO signup_subjects (position, user_id)
VALUES (1, gen_random_uuid()), (2, gen_random_uuid());

-- A real INSERT into auth.users invokes the installed trigger, not a mock RPC.
GRANT SELECT ON signup_subjects TO supabase_auth_admin;
SET LOCAL ROLE supabase_auth_admin;
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT user_id, 'signup-' || user_id || '@local.test',
       jsonb_build_object('role', 'admin', 'household_id', (SELECT user_id FROM signup_subjects WHERE position = 1))
FROM signup_subjects;
RESET ROLE;

SELECT pg_temp.expect_signup_error(
    'SELECT pg_temp.check_isolated_signup_prerequisites()',
    'isolated signup adapter requires an empty auth identity database');

UPDATE signup_subjects s SET household_id = hm.household_id
FROM public.household_members hm WHERE hm.user_id = s.user_id AND hm.deleted_at IS NULL;

SELECT pg_temp.assert_signup(
    (SELECT count(DISTINCT household_id) = 2 FROM signup_subjects),
    'fresh identities have distinct households');
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 2 FROM public.users u JOIN signup_subjects s ON s.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.email = 'signup-' || s.user_id || '@local.test'),
    'profiles exist before the signup INSERT returns');
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 2 FROM public.household_members hm
     JOIN signup_subjects s ON s.user_id = hm.user_id
     JOIN public.households h ON h.id = hm.household_id
     WHERE hm.role = 'owner' AND hm.deleted_at IS NULL
       AND h.created_by = s.user_id AND h.deleted_at IS NULL),
    'untrusted metadata cannot select role or another household');

SELECT pg_temp.assert_signup(
    (public.handle_new_user_signup(user_id, 'signup-' || user_id || '@local.test', NULL)
        ->> 'already_provisioned')::boolean,
    'duplicate provisioning returns existing active membership')
FROM signup_subjects;
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 2 FROM public.households h JOIN signup_subjects s ON s.user_id = h.created_by),
    'duplicate RPCs create no households');

-- Soft-deleted membership is not reused by the unchanged service-only RPC.
UPDATE public.household_members SET deleted_at = now()
WHERE user_id = (SELECT user_id FROM signup_subjects WHERE position = 2);
SELECT public.handle_new_user_signup(user_id, 'signup-' || user_id || '@local.test', NULL) IS NOT NULL
FROM signup_subjects WHERE position = 2;
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 1 FROM public.household_members hm JOIN signup_subjects s ON s.user_id = hm.user_id
     WHERE s.position = 2 AND hm.deleted_at IS NULL AND hm.household_id <> s.household_id),
    'RPC preserves active-membership semantics');
UPDATE signup_subjects s SET household_id = hm.household_id
FROM public.household_members hm WHERE hm.user_id = s.user_id AND hm.deleted_at IS NULL;

SELECT pg_temp.expect_signup_error(
    $$INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'not-synthetic@example.com')$$,
    'isolated signup adapter accepts only synthetic local.test identities');
SELECT pg_temp.assert_signup(
    NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'not-synthetic@example.com'),
    'rejected signup leaves no auth row');

-- A provisioning failure must roll back auth, profile and household atomically.
CREATE TEMP TABLE saved_signup_definition AS
SELECT pg_get_functiondef('public.handle_new_user_signup(uuid,text,text)'::regprocedure) AS definition;
CREATE OR REPLACE FUNCTION public.handle_new_user_signup(p_user_id uuid, p_email text, p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name) VALUES ($1, $2, 'Synthetic');
    RETURN jsonb_build_object('user_id', $1);
END;
$$;
SELECT pg_temp.expect_signup_error(
    $$INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'failed-signup@local.test')$$,
    'isolated signup adapter provisioning invariant failed');
SELECT pg_temp.assert_signup(
    NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'failed-signup@local.test')
    AND NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'failed-signup@local.test'),
    'incomplete provisioning cannot commit');
DO $$
BEGIN
    EXECUTE (SELECT definition FROM saved_signup_definition);
END;
$$;

SELECT pg_temp.assert_signup(
    NOT has_function_privilege('authenticated', 'public.handle_new_user_signup(uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.handle_new_user_signup(uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.isolated_local_signup_adapter()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.isolated_local_signup_adapter()', 'EXECUTE'),
    'clients cannot invoke privileged provisioning');

SELECT set_config('request.jwt.claim.sub', user_id::text, true)
FROM signup_subjects WHERE position = 1;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', 'authenticated')::text, true)
FROM signup_subjects WHERE position = 1;
GRANT SELECT ON signup_subjects TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 1 FROM public.users),
    'RLS reveals only own profile');
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 1 FROM public.households),
    'RLS reveals only own active household');
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 1 FROM public.household_members WHERE deleted_at IS NULL),
    'RLS reveals only own active membership');
SELECT pg_temp.assert_signup(
    (SELECT public.household_ids() = ARRAY[household_id] FROM signup_subjects WHERE position = 1),
    'real public.household_ids uses JWT identity');
INSERT INTO public.accounts (household_id, owner_id, name, type)
SELECT household_id, user_id, 'Synthetic upload', 'checking'
FROM signup_subjects WHERE position = 1;
SELECT pg_temp.expect_signup_denial(
    $$INSERT INTO public.accounts (household_id, owner_id, name, type)
      SELECT household_id, auth.uid(), 'Cross-household upload', 'checking'
      FROM signup_subjects WHERE position = 2$$);
SELECT pg_temp.expect_signup_denial(
    $$INSERT INTO public.accounts (household_id, owner_id, name, type)
      SELECT first_subject.household_id, second_subject.user_id, 'Spoofed owner', 'checking'
      FROM signup_subjects first_subject, signup_subjects second_subject
      WHERE first_subject.position = 1 AND second_subject.position = 2$$);
SELECT pg_temp.expect_signup_denial(
    $$SELECT public.handle_new_user_signup(auth.uid(), 'client@local.test', NULL)$$);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', user_id::text, true)
FROM signup_subjects WHERE position = 2;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', 'authenticated')::text, true)
FROM signup_subjects WHERE position = 2;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_signup(
    (SELECT public.household_ids() = ARRAY[household_id] FROM signup_subjects WHERE position = 2)
    AND (SELECT count(*) = 0 FROM public.accounts),
    'second identity cannot read first identity financial uploads');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.assert_signup(
    (SELECT count(*) = 0 FROM public.users)
    AND (SELECT count(*) = 0 FROM public.households),
    'anonymous callers cannot read provisioned identities or households');
RESET ROLE;

ROLLBACK;
