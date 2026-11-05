-- SPDX-License-Identifier: BUSL-1.1
-- Issue #4619: supply fields already required by sync rules and client schemas.
-- Existing budget names are backfilled from their same-household category.

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '[]';

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE budgets
    ADD COLUMN IF NOT EXISTS name TEXT;

UPDATE budgets b
SET name = c.name
FROM categories c
WHERE b.category_id = c.id
  AND b.household_id = c.household_id
  AND b.name IS NULL;

ALTER TABLE budgets ALTER COLUMN name SET NOT NULL;
