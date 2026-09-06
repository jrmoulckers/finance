-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- DOWN Migration: 20260906000003_bank_connection_cap_entitlement (#4404)
-- =============================================================================
-- Reverts the tier-aware, reservation-backed bank connection cap and restores
-- the flat constant-2 trigger body from 20260403000001_bank_connection_cap.sql.
--
-- WARNING: reverting drops the reservation and orphan-handoff tables. Do NOT
-- revert while `bank-connection` is deployed at the Stage 6 revision — that
-- revision calls the reservation RPCs and depends on the projection-aware cap.
-- Revert only after redeploying the Edge Function to a revision that uses the
-- flat cap, and only against a database with no in-flight reservations or
-- pending orphan-revocation handoffs to lose.
-- =============================================================================

-- Restore the flat constant-2 enforcement body. Keep the same trigger wiring.
CREATE OR REPLACE FUNCTION enforce_bank_connection_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Keep in sync with DEFAULT_CONNECTION_CAP in
    -- services/api/supabase/functions/_shared/bank-entitlements.ts
    connection_cap CONSTANT INTEGER := 2;
    live_count INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
       AND OLD.household_id = NEW.household_id THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO live_count
    FROM bank_connections
    WHERE household_id = NEW.household_id
      AND deleted_at IS NULL
      AND id <> NEW.id;

    IF live_count >= connection_cap THEN
        RAISE EXCEPTION
            'Household % has reached its limit of % live bank connections',
            NEW.household_id, connection_cap
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_bank_connection_cap() IS
    'Caps live (deleted_at IS NULL) rows in bank_connections per household. Each '
    'live row is a recurring monthly aggregator subscription, so an uncapped table '
    'is an uncapped liability. Defense in depth behind the Edge Function check. '
    'See #4379.';

DROP TRIGGER IF EXISTS trg_bank_connections_cap ON bank_connections;
CREATE TRIGGER trg_bank_connections_cap
    BEFORE INSERT OR UPDATE OF household_id, deleted_at ON bank_connections
    FOR EACH ROW
    EXECUTE FUNCTION enforce_bank_connection_cap();

-- Drop the Stage 6 RPCs and helpers.
DROP FUNCTION IF EXISTS public.record_orphaned_bank_item(UUID, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.release_bank_connection_reservation(UUID, UUID);
DROP FUNCTION IF EXISTS public.finalize_bank_connection_reservation(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
);
DROP FUNCTION IF EXISTS public.bank_connection_capacity(UUID);
DROP FUNCTION IF EXISTS public.reserve_bank_connection_slot(UUID, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.bank_connection_cap_for_household(UUID);
DROP FUNCTION IF EXISTS public.bank_connection_reservation_lock_key(UUID);

-- Drop the Stage 6 server-only tables.
DROP TABLE IF EXISTS public.bank_connection_orphaned_items;
DROP TABLE IF EXISTS public.bank_connection_reservations;
