-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260323000001_cleanup_and_balance_triggers
-- Description: Drop cleanup function and balance recalculation trigger
-- Issues: #893

DROP TRIGGER IF EXISTS trg_recalculate_balance ON transactions;
DROP FUNCTION IF EXISTS public.recalculate_account_balance();
DROP FUNCTION IF EXISTS public.cleanup_expired_records();
