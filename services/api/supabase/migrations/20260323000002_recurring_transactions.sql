-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260323000002_recurring_transactions
-- Description: Add recurring transaction templates table and generation function
-- Issues: #612
--
-- Creates a dedicated table for recurring transaction configuration and a
-- PL/pgSQL function that generates transaction instances from due templates.
--
-- Security:
--   - RLS enabled with household-scoped policies using auth.household_ids()
--   - Generation function is SECURITY DEFINER (bypasses RLS for cross-household batch)
--   - GRANT EXECUTE only to service_role; REVOKE from PUBLIC
--   - FOR UPDATE SKIP LOCKED prevents deadlocks during concurrent cron runs

-- =============================================================================
-- recurring_transaction_templates
-- =============================================================================
-- Stores recurrence configuration separately from individual transaction rows.
-- Each template describes a repeating financial event (rent, salary, subscription)
-- and tracks the next date a transaction should be generated.

CREATE TABLE recurring_transaction_templates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID        NOT NULL REFERENCES households(id),
    account_id          UUID        NOT NULL REFERENCES accounts(id),
    category_id         UUID        REFERENCES categories(id),
    amount_cents        BIGINT      NOT NULL,
    currency_code       TEXT        NOT NULL DEFAULT 'USD',
    type                TEXT        NOT NULL,
    payee               TEXT,
    note                TEXT,
    -- Recurrence configuration
    frequency           TEXT        NOT NULL CHECK (frequency IN (
                            'daily', 'weekly', 'biweekly',
                            'monthly', 'quarterly', 'yearly'
                        )),
    day_of_month        INTEGER,                    -- For monthly: 1-31
    day_of_week         INTEGER,                    -- For weekly: 0=Sun..6=Sat
    start_date          DATE        NOT NULL,
    end_date            DATE,                       -- NULL = indefinite
    last_generated_date DATE,                       -- Last date a transaction was generated
    next_due_date       DATE        NOT NULL,       -- Next date to generate
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT      NOT NULL DEFAULT 0,
    is_synced           BOOLEAN     NOT NULL DEFAULT false
);

-- Household lookup for sync and queries
CREATE INDEX idx_recurring_templates_household
    ON recurring_transaction_templates (household_id);

-- Efficiently find templates that are due for generation
CREATE INDEX idx_recurring_templates_next_due
    ON recurring_transaction_templates (next_due_date)
    WHERE deleted_at IS NULL AND is_active = true;

-- =============================================================================
-- RLS — household members only
-- =============================================================================

ALTER TABLE recurring_transaction_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_templates_select ON recurring_transaction_templates
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY recurring_templates_insert ON recurring_transaction_templates
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY recurring_templates_update ON recurring_transaction_templates
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY recurring_templates_delete ON recurring_transaction_templates
    FOR DELETE
    USING (household_id = ANY(auth.household_ids()));

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE TRIGGER trg_recurring_templates_updated_at
    BEFORE UPDATE ON recurring_transaction_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- generate_recurring_transactions(p_as_of_date DATE)
-- =============================================================================
-- Iterates all active, non-deleted templates whose next_due_date <= p_as_of_date,
-- inserts a transaction for each, advances next_due_date, and deactivates
-- templates that have passed their end_date.
--
-- Returns a JSONB summary: { generated_count, as_of_date, generated_at }
--
-- SECURITY DEFINER: runs as the function owner (superuser/migration role) so it
-- can read all households in a single batch. The Edge Function calling this
-- authenticates via CRON_SECRET, not a user JWT.
--
-- FOR UPDATE SKIP LOCKED: allows safe concurrent invocation without deadlocks.
-- If two cron runs overlap, the second skips rows already locked by the first.

CREATE OR REPLACE FUNCTION public.generate_recurring_transactions(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    template RECORD;
    generated_count INTEGER := 0;
    next_date DATE;
BEGIN
    FOR template IN
        SELECT * FROM recurring_transaction_templates
        WHERE deleted_at IS NULL
          AND is_active = true
          AND next_due_date <= p_as_of_date
          AND (end_date IS NULL OR next_due_date <= end_date)
        ORDER BY next_due_date ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Insert the generated transaction instance
        INSERT INTO transactions (
            household_id, account_id, category_id,
            amount_cents, currency_code, type,
            payee, note, date,
            is_recurring, status
        ) VALUES (
            template.household_id, template.account_id, template.category_id,
            template.amount_cents, template.currency_code, template.type,
            template.payee, template.note, template.next_due_date,
            true, 'CLEARED'
        );

        -- Calculate the next due date based on the template frequency
        next_date := CASE template.frequency
            WHEN 'daily'     THEN template.next_due_date + INTERVAL '1 day'
            WHEN 'weekly'    THEN template.next_due_date + INTERVAL '1 week'
            WHEN 'biweekly'  THEN template.next_due_date + INTERVAL '2 weeks'
            WHEN 'monthly'   THEN template.next_due_date + INTERVAL '1 month'
            WHEN 'quarterly' THEN template.next_due_date + INTERVAL '3 months'
            WHEN 'yearly'    THEN template.next_due_date + INTERVAL '1 year'
        END;

        -- Deactivate template if the next occurrence would be past end_date
        IF template.end_date IS NOT NULL AND next_date > template.end_date THEN
            UPDATE recurring_transaction_templates
            SET is_active = false,
                last_generated_date = template.next_due_date
            WHERE id = template.id;
        ELSE
            UPDATE recurring_transaction_templates
            SET last_generated_date = template.next_due_date,
                next_due_date = next_date
            WHERE id = template.id;
        END IF;

        generated_count := generated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'generated_count', generated_count,
        'as_of_date', p_as_of_date,
        'generated_at', now()
    );
END;
$$;

-- Only the service_role (used by Edge Functions) can execute this function.
-- End-user JWTs (anon, authenticated) cannot call it directly.
GRANT EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) TO service_role;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) FROM PUBLIC;
