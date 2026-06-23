-- SPDX-License-Identifier: BUSL-1.1

-- Privacy trio foundation (#1613 #1643 #1719): per-category biometric protection.
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS is_biometric_protected BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_categories_biometric_protected
    ON categories (household_id, is_biometric_protected)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN categories.is_biometric_protected IS
    'When true, category details require fresh biometric/PIN/passcode auth and must not sync to other household members, partners, or caregivers.';
