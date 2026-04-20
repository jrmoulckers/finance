-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260323000002_recurring_transactions
-- Description: Drop recurring transaction templates and generation function
-- Issues: #893

-- Drop the generation function first (no dependencies on the table)
DROP FUNCTION IF EXISTS public.generate_recurring_transactions(DATE);

-- Drop trigger
DROP TRIGGER IF EXISTS trg_recurring_templates_updated_at ON recurring_transaction_templates;

-- Drop RLS policies
DROP POLICY IF EXISTS recurring_templates_delete ON recurring_transaction_templates;
DROP POLICY IF EXISTS recurring_templates_update ON recurring_transaction_templates;
DROP POLICY IF EXISTS recurring_templates_insert ON recurring_transaction_templates;
DROP POLICY IF EXISTS recurring_templates_select ON recurring_transaction_templates;

-- Disable RLS
ALTER TABLE recurring_transaction_templates DISABLE ROW LEVEL SECURITY;

-- Drop table
DROP TABLE IF EXISTS recurring_transaction_templates;
