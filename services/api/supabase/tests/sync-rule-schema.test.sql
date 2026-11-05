-- SPDX-License-Identifier: BUSL-1.1
-- Disposable database only. Usage: npm run test:sync-schema from services/api.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transactions'
          AND column_name = 'tags' AND data_type = 'text' AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories'
          AND column_name = 'is_system' AND data_type = 'boolean' AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'budgets'
          AND column_name = 'name' AND data_type = 'text' AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'sync-rule column contract mismatch';
    END IF;
    IF NOT (
        SELECT count(*) = 3 AND bool_and(relrowsecurity)
        FROM pg_class WHERE oid = ANY(ARRAY[
            'public.transactions'::regclass, 'public.categories'::regclass,
            'public.budgets'::regclass
        ])
    ) THEN
        RAISE EXCEPTION 'sync-rule column alignment must preserve RLS';
    END IF;
END;
$$;

-- Exercise the exact migration against pre-column rows without changing public data.
CREATE TEMP TABLE transactions (id INTEGER PRIMARY KEY);
CREATE TEMP TABLE categories (
    id INTEGER PRIMARY KEY, household_id INTEGER NOT NULL, name TEXT NOT NULL
);
CREATE TEMP TABLE budgets (
    id INTEGER PRIMARY KEY, household_id INTEGER NOT NULL, category_id INTEGER NOT NULL
);
INSERT INTO transactions VALUES (1);
INSERT INTO categories VALUES (1, 1, 'Synthetic first'), (2, 2, 'Synthetic second');
INSERT INTO budgets VALUES (1, 1, 1), (2, 2, 2);
SET LOCAL search_path = pg_temp, public;
\ir ../migrations/20261105000001_sync_rule_column_alignment.sql

DO $$
BEGIN
    IF NOT (SELECT tags = '[]' FROM transactions WHERE id = 1)
       OR EXISTS (SELECT 1 FROM categories WHERE is_system IS DISTINCT FROM false)
       OR EXISTS (
           SELECT 1 FROM budgets b JOIN categories c ON c.id = b.category_id
           WHERE b.name IS DISTINCT FROM c.name
       ) THEN
        RAISE EXCEPTION 'sync-rule alignment defaults or budget backfill mismatch';
    END IF;
END;
$$;

UPDATE transactions SET tags = '["synthetic"]' WHERE id = 1;
UPDATE categories SET is_system = true WHERE id = 1;
UPDATE budgets SET name = 'Synthetic custom name' WHERE id = 1;
\ir ../migrations/20261105000001_sync_rule_column_alignment.sql

DO $$
BEGIN
    IF NOT (SELECT tags = '["synthetic"]' FROM transactions WHERE id = 1)
       OR NOT (SELECT is_system FROM categories WHERE id = 1)
       OR NOT (SELECT name = 'Synthetic custom name' FROM budgets WHERE id = 1) THEN
        RAISE EXCEPTION 'repeated alignment must preserve stored client values';
    END IF;
END;
$$;
ROLLBACK;
