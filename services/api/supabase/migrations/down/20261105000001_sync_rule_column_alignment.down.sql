-- SPDX-License-Identifier: BUSL-1.1
-- HUMAN REVIEW/EXECUTION ONLY: loses stored tags, system flags and budget names.
-- Roll back dependent client/rule projections before applying this reversal.
BEGIN;
ALTER TABLE budgets DROP COLUMN name;
ALTER TABLE categories DROP COLUMN is_system;
ALTER TABLE transactions DROP COLUMN tags;
COMMIT;
