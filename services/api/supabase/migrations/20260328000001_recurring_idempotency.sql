-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260328000001_recurring_idempotency
-- Description: Add idempotency tracking for recurring transaction generation
-- Issues: #1047
--
-- Changes:
--   1. Create recurring_generation_log table — tracks each generation run
--      with a unique (template_id, generated_for_date) constraint to prevent
--      duplicate transactions for the same period.
--   2. Replace generate_recurring_transactions function with an idempotent
--      version that checks the log before inserting and records each generation.
--   3. Add a helper function get_recurring_status that returns the current
--      state of all templates (for monitoring/health checks).
--
-- Security:
--   - recurring_generation_log: RLS enabled, service_role only (no user access)
--   - Functions remain SECURITY DEFINER with service_role GRANT
--   - No financial data is exposed in function return values
--
-- DOWN migration: at the bottom.

-- =============================================================================
-- 1. recurring_generation_log — idempotency tracking
-- =============================================================================

CREATE TABLE recurring_generation_log (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         UUID        NOT NULL REFERENCES recurring_transaction_templates(id) ON DELETE CASCADE,
    transaction_id      UUID        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    generated_for_date  DATE        NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one generated transaction per template per date
CREATE UNIQUE INDEX idx_recurring_gen_log_unique
    ON recurring_generation_log (template_id, generated_for_date);

-- Fast lookup by batch for reporting
CREATE INDEX idx_recurring_gen_log_batch
    ON recurring_generation_log (batch_id);

-- Fast lookup by template
CREATE INDEX idx_recurring_gen_log_template
    ON recurring_generation_log (template_id, generated_at DESC);

COMMENT ON TABLE recurring_generation_log IS
    'Idempotency log for recurring transaction generation. Prevents duplicate transactions for the same template+date pair (#1047).';
COMMENT ON COLUMN recurring_generation_log.template_id IS
    'FK to the recurring template that triggered generation.';
COMMENT ON COLUMN recurring_generation_log.transaction_id IS
    'FK to the generated transaction.';
COMMENT ON COLUMN recurring_generation_log.generated_for_date IS
    'The date this transaction was generated for (the template''s next_due_date at generation time).';
COMMENT ON COLUMN recurring_generation_log.batch_id IS
    'Groups all generations from a single cron invocation for traceability.';

-- =============================================================================
-- RLS — service_role only
-- =============================================================================

ALTER TABLE recurring_generation_log ENABLE ROW LEVEL SECURITY;

-- No user-facing policies: only service_role (which bypasses RLS) writes/reads.

-- =============================================================================
-- 2. Idempotent generate_recurring_transactions
-- =============================================================================
-- Replaces the existing function. Key changes:
--   - Checks recurring_generation_log before inserting (skip if already generated)
--   - Records each generation in the log with a batch_id
--   - Returns both generated_count and skipped_count for observability

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
    skipped_count INTEGER := 0;
    v_batch_id UUID := gen_random_uuid();
    next_date DATE;
    v_txn_id UUID;
    v_already_generated BOOLEAN;
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
        -- =====================================================================
        -- Idempotency check: skip if already generated for this date (#1047)
        -- =====================================================================
        SELECT EXISTS (
            SELECT 1 FROM recurring_generation_log
            WHERE template_id = template.id
              AND generated_for_date = template.next_due_date
        ) INTO v_already_generated;

        IF v_already_generated THEN
            skipped_count := skipped_count + 1;

            -- Still advance next_due_date so the template doesn't get stuck
            next_date := CASE template.frequency
                WHEN 'daily'     THEN template.next_due_date + INTERVAL '1 day'
                WHEN 'weekly'    THEN template.next_due_date + INTERVAL '1 week'
                WHEN 'biweekly'  THEN template.next_due_date + INTERVAL '2 weeks'
                WHEN 'monthly'   THEN template.next_due_date + INTERVAL '1 month'
                WHEN 'quarterly' THEN template.next_due_date + INTERVAL '3 months'
                WHEN 'yearly'    THEN template.next_due_date + INTERVAL '1 year'
            END;

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

            CONTINUE;
        END IF;

        -- =====================================================================
        -- Generate the transaction
        -- =====================================================================
        INSERT INTO transactions (
            household_id, account_id, category_id,
            amount_cents, currency_code, type,
            payee, note, date,
            is_recurring, status,
            recurring_rule_id, owner_id
        ) VALUES (
            template.household_id, template.account_id, template.category_id,
            template.amount_cents, template.currency_code, template.type,
            template.payee, template.note, template.next_due_date,
            true, 'CLEARED',
            template.id, template.owner_id
        )
        RETURNING id INTO v_txn_id;

        -- =====================================================================
        -- Record in idempotency log
        -- =====================================================================
        INSERT INTO recurring_generation_log (
            template_id, transaction_id, generated_for_date, batch_id
        ) VALUES (
            template.id, v_txn_id, template.next_due_date, v_batch_id
        );

        -- =====================================================================
        -- Advance the template
        -- =====================================================================
        next_date := CASE template.frequency
            WHEN 'daily'     THEN template.next_due_date + INTERVAL '1 day'
            WHEN 'weekly'    THEN template.next_due_date + INTERVAL '1 week'
            WHEN 'biweekly'  THEN template.next_due_date + INTERVAL '2 weeks'
            WHEN 'monthly'   THEN template.next_due_date + INTERVAL '1 month'
            WHEN 'quarterly' THEN template.next_due_date + INTERVAL '3 months'
            WHEN 'yearly'    THEN template.next_due_date + INTERVAL '1 year'
        END;

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
        'skipped_count', skipped_count,
        'batch_id', v_batch_id,
        'as_of_date', p_as_of_date,
        'generated_at', now()
    );
END;
$$;

-- Permissions unchanged
GRANT EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) TO service_role;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) FROM PUBLIC;

-- =============================================================================
-- 3. get_recurring_status — monitoring helper
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_recurring_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_active_count INTEGER;
    v_due_count INTEGER;
    v_total_generated BIGINT;
    v_last_run TIMESTAMPTZ;
BEGIN
    SELECT count(*) INTO v_active_count
    FROM recurring_transaction_templates
    WHERE deleted_at IS NULL AND is_active = true;

    SELECT count(*) INTO v_due_count
    FROM recurring_transaction_templates
    WHERE deleted_at IS NULL AND is_active = true
      AND next_due_date <= CURRENT_DATE;

    SELECT count(*) INTO v_total_generated
    FROM recurring_generation_log;

    SELECT max(generated_at) INTO v_last_run
    FROM recurring_generation_log;

    RETURN jsonb_build_object(
        'active_templates', v_active_count,
        'templates_due_today', v_due_count,
        'total_generated_all_time', v_total_generated,
        'last_generation_run', v_last_run,
        'checked_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recurring_status() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_recurring_status() FROM PUBLIC;

-- =============================================================================
-- DOWN (to revert, run these statements)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.get_recurring_status();
--
-- -- Restore previous generate_recurring_transactions from 20260326000006
-- -- (Run the CREATE OR REPLACE from that migration)
--
-- DROP TABLE IF EXISTS recurring_generation_log;
