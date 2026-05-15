-- SPDX-License-Identifier: BUSL-1.1

-- Down migration for: 20260330000005_transaction_pagination_index
-- Description: Remove pagination indexes for transactions (#1383)

DROP INDEX IF EXISTS idx_transactions_pagination_date;
DROP INDEX IF EXISTS idx_transactions_pagination_created_at;
DROP INDEX IF EXISTS idx_transactions_pagination_amount;
