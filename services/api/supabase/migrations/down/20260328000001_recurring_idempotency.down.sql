-- SPDX-License-Identifier: BUSL-1.1

-- Down migration for: 20260328000001_recurring_idempotency
-- Reverts idempotency tracking for recurring transaction generation (#1047)

-- 3. Drop monitoring helper
DROP FUNCTION IF EXISTS public.get_recurring_status();

-- 2. Restore previous generate_recurring_transactions (from 20260326000006)
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
        );

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
        'as_of_date', p_as_of_date,
        'generated_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) TO service_role;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_transactions(DATE) FROM PUBLIC;

-- 1. Drop idempotency tracking table
DROP TABLE IF EXISTS recurring_generation_log;
