-- SPDX-License-Identifier: BUSL-1.1
-- Local-only opt-in, NOT a migration. Install atomically in a fresh disposable
-- database after the full migration chain; see docs/guides/isolated-signup-adapter.md.
\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.check_isolated_signup_prerequisites()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    expected_versions text[] := ARRAY[
        '20260306000001', '20260306000002', '20260306000003', '20260307000001',
        '20260315000001', '20260316000001', '20260316000002', '20260323000001',
        '20260323000002', '20260323000003', '20260324000001', '20260324000002',
        '20260324000003', '20260324000004', '20260325000001', '20260325000002',
        '20260326000001', '20260326000002', '20260326000003', '20260326000004',
        '20260326000005', '20260326000006', '20260327000001', '20260327000002',
        '20260327000003', '20260327000004', '20260328000001', '20260328000002',
        '20260328000003', '20260328000004', '20260328000005', '20260328000006',
        '20260328000007', '20260328000008', '20260329000001', '20260329000002',
        '20260329000003', '20260329000004', '20260330000001', '20260330000002',
        '20260330000003', '20260330000004', '20260330000005', '20260330000006',
        '20260330000007', '20260331000001', '20260331000002', '20260331000003',
        '20260331000004', '20260401000001', '20260401000002', '20260401000003',
        '20260402000001', '20260403000001', '20260906000001', '20260906000002',
        '20260906000003', '20260908000001', '20260908000002'
    ];
    actual_versions text[];
BEGIN
    IF current_setting('finance.isolated_signup_adapter', true)
        IS DISTINCT FROM 'synthetic-local-only' THEN
        RAISE EXCEPTION 'isolated signup adapter requires explicit local-only opt-in';
    END IF;
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'isolated signup adapter requires the disposable database administrator';
    END IF;
    IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
        RAISE EXCEPTION 'isolated signup adapter requires verified migration history';
    END IF;
    SELECT array_agg(version::text ORDER BY version::text) INTO actual_versions
    FROM supabase_migrations.schema_migrations;
    IF actual_versions IS DISTINCT FROM expected_versions THEN
        RAISE EXCEPTION 'isolated signup adapter migration inventory mismatch';
    END IF;
    IF to_regprocedure('public.handle_new_user_signup(uuid,text,text)') IS NULL
        OR to_regprocedure('public.household_ids()') IS NULL
        OR to_regclass('auth.users') IS NULL
        OR to_regclass('public.users') IS NULL
        OR to_regclass('public.households') IS NULL
        OR to_regclass('public.household_members') IS NULL THEN
        RAISE EXCEPTION 'isolated signup adapter requires the migrated auth/profile/household schema';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.handle_new_user_signup(uuid,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'isolated signup adapter requires service-only provisioning RPC permissions';
    END IF;
    PERFORM u.id, u.email, u.display_name, u.deleted_at,
            h.id, h.created_by, h.deleted_at,
            hm.household_id, hm.user_id, hm.role, hm.deleted_at
    FROM public.users u, public.households h, public.household_members hm
    WHERE false;
    IF EXISTS (SELECT 1 FROM auth.users) THEN
        RAISE EXCEPTION 'isolated signup adapter requires an empty auth identity database';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal
          AND (tgtype::int & 4) <> 0
    ) THEN
        RAISE EXCEPTION 'isolated signup adapter refuses an existing auth INSERT trigger';
    END IF;
END;
$$;

SELECT pg_temp.check_isolated_signup_prerequisites();

-- LOCK requires an explicit transaction and closes the empty-auth/install race.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_temp.check_isolated_signup_prerequisites();

-- Supabase default function privileges can include authenticated independently
-- of PUBLIC. Clamp this local RPC to its intended service-only contract.
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup(uuid,text,text)
    FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.isolated_local_signup_adapter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    provisioned jsonb;
    owned_household uuid;
BEGIN
    IF NEW.email IS NULL OR NEW.email !~ '^[^@[:space:]]+@local[.]test$' THEN
        RAISE EXCEPTION 'isolated signup adapter accepts only synthetic local.test identities';
    END IF;

    -- Neither role, household, nor display-name metadata is trusted from clients.
    -- This runs in the auth INSERT transaction, before GoTrue can return a session.
    provisioned := public.handle_new_user_signup(NEW.id, NEW.email, NULL);
    owned_household := (provisioned ->> 'household_id')::uuid;
    IF owned_household IS NULL
        OR (provisioned ->> 'user_id')::uuid IS DISTINCT FROM NEW.id
        OR NOT EXISTS (
            SELECT 1 FROM public.users
            WHERE id = NEW.id AND email = NEW.email AND deleted_at IS NULL
        )
        OR (SELECT count(*) FROM public.household_members
            WHERE user_id = NEW.id AND deleted_at IS NULL) <> 1
        OR NOT EXISTS (
            SELECT 1 FROM public.household_members hm
            JOIN public.households h ON h.id = hm.household_id
            WHERE hm.user_id = NEW.id AND hm.household_id = owned_household
              AND hm.role = 'owner' AND hm.deleted_at IS NULL
              AND h.created_by = NEW.id AND h.deleted_at IS NULL
        ) THEN
        RAISE EXCEPTION 'isolated signup adapter provisioning invariant failed';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.isolated_local_signup_adapter()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER isolated_local_signup_adapter
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.isolated_local_signup_adapter();
