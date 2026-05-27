-- SPDX-License-Identifier: BUSL-1.1

-- Migration: 20260331000002_add_mood_tag_to_transactions
-- Description: Add optional local-first mood tag to transactions
-- Issues: #1874

ALTER TABLE transactions
    ADD COLUMN mood_tag TEXT NULL;

COMMENT ON COLUMN transactions.mood_tag IS
    'Optional single emoji mood tag for user-owned transaction entry; excluded from household and visibility sharing surfaces.';
