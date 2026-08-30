-- SPDX-License-Identifier: BUSL-1.1

-- =============================================================================
-- Per-household bank connection cap (#4379)
-- =============================================================================
-- Every live row in bank_connections is one aggregator "Item" (Plaid) or
-- "member" (MX). Both providers bill an Item as a RECURRING MONTHLY
-- SUBSCRIPTION for as long as it exists — not per API call. An uncapped table
-- is therefore an uncapped recurring liability.
--
-- The `bank-connection` Edge Function enforces this cap in application code
-- (services/api/supabase/functions/_shared/bank-entitlements.ts). This trigger
-- is defense in depth: it holds for any other writer — a future function, a
-- backfill script, a manual service-role insert — and makes the invariant a
-- property of the schema rather than of one call site.
--
-- Soft-deleted rows do NOT count. Disconnecting revokes the credential at the
-- provider (Plaid /item/remove, MX member delete), which ends the subscription,
-- so a soft-deleted row carries no cost and must not consume allowance.
--
-- The cap value is intentionally a single constant here, matching
-- DEFAULT_CONNECTION_CAP in bank-entitlements.ts. There is no server-side
-- entitlement/tier record to vary it by yet; see
-- docs/business/revenue/aggregator-cost-strategy.md.
-- =============================================================================

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
    -- Only a row that is live on completion consumes allowance. This lets an
    -- UPDATE that soft-deletes a row through, and correctly counts an UPDATE
    -- that resurrects one.
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- On UPDATE, a row that was already live is not a new Item.
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

-- Supports the COUNT(*) above and the Edge Function's cap query.
CREATE INDEX IF NOT EXISTS idx_bank_connections_household_live
    ON bank_connections (household_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- Rollback (see down/20260403000001_bank_connection_cap.down.sql)
-- =============================================================================
