-- SPDX-License-Identifier: BUSL-1.1

-- DOWN Migration: 20260331000002_add_mood_tag_to_transactions
-- Description: Remove optional mood tag from transactions
-- Issues: #1874

ALTER TABLE transactions DROP COLUMN IF EXISTS mood_tag;
