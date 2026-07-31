-- SPDX-License-Identifier: BUSL-1.1

-- DOWN migration for 20260402000001_schema_unification_superset

DROP TABLE IF EXISTS remittances;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS account_reconciliations;
DROP TABLE IF EXISTS goal_progress_contributions;

DROP INDEX IF EXISTS idx_transactions_retirement_year;

ALTER TABLE goals DROP COLUMN IF EXISTS sort_order;
ALTER TABLE goals DROP COLUMN IF EXISTS description;

ALTER TABLE budgets DROP COLUMN IF EXISTS sort_order;

ALTER TABLE transactions DROP COLUMN IF EXISTS retirement_contribution_designation;
ALTER TABLE transactions DROP COLUMN IF EXISTS retirement_contribution_year;
ALTER TABLE transactions DROP COLUMN IF EXISTS splits;
ALTER TABLE transactions DROP COLUMN IF EXISTS counterparty_account_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS counterparty_name;
ALTER TABLE transactions DROP COLUMN IF EXISTS extra_notes;
ALTER TABLE transactions DROP COLUMN IF EXISTS custom_fields;
ALTER TABLE transactions DROP COLUMN IF EXISTS statement_description;
ALTER TABLE transactions DROP COLUMN IF EXISTS external_reference_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS merchant_country;
ALTER TABLE transactions DROP COLUMN IF EXISTS merchant_zip;
ALTER TABLE transactions DROP COLUMN IF EXISTS merchant_state;
ALTER TABLE transactions DROP COLUMN IF EXISTS merchant_city;
ALTER TABLE transactions DROP COLUMN IF EXISTS merchant_address;

ALTER TABLE accounts DROP COLUMN IF EXISTS hsa_coverage_level;
ALTER TABLE accounts DROP COLUMN IF EXISTS retirement_tax_treatment;
ALTER TABLE accounts DROP COLUMN IF EXISTS retirement_account_type;
ALTER TABLE accounts DROP COLUMN IF EXISTS purpose;
