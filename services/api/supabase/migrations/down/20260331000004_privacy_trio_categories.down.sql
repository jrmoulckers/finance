-- SPDX-License-Identifier: BUSL-1.1

DROP INDEX IF EXISTS idx_categories_biometric_protected;
ALTER TABLE categories DROP COLUMN IF EXISTS is_biometric_protected;
