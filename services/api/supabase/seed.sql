-- =============================================================================
-- Seed Data for Local Development
-- =============================================================================
-- Issues: #211
--
-- Provides realistic seed data for the Finance app local Supabase instance.
-- Run automatically on `supabase db reset` or manually via `psql -f seed.sql`.
--
-- Contents:
--   2 users, 2 households, 5 accounts, 10 categories,
--   30 transactions, 4 budgets, 2 goals
--
-- All monetary values are in cents (BIGINT). Currency is USD unless noted.
-- UUIDs are deterministic where needed for FK references, and generated
-- with gen_random_uuid() elsewhere.
-- =============================================================================

-- Temporarily disable triggers so updated_at isn't overwritten during seeding
SET session_replication_role = 'replica';

-- =============================================================================
-- Users
-- =============================================================================

INSERT INTO users (id, email, display_name, avatar_url, currency_code) VALUES
    ('a1a1a1a1-1111-4111-a111-111111111111', 'alice@example.com',  'Alice Johnson', NULL, 'USD'),
    ('b2b2b2b2-2222-4222-b222-222222222222', 'bob@example.com',    'Bob Smith',     NULL, 'USD');

-- =============================================================================
-- Households
-- =============================================================================

INSERT INTO households (id, name, created_by) VALUES
    ('11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Alice''s Household',  'a1a1a1a1-1111-4111-a111-111111111111'),
    ('22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'Shared Household',    'a1a1a1a1-1111-4111-a111-111111111111');

-- =============================================================================
-- Household Members
-- =============================================================================

INSERT INTO household_members (id, household_id, user_id, role) VALUES
    -- Alice owns her personal household
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'a1a1a1a1-1111-4111-a111-111111111111', 'owner'),
    -- Alice owns the shared household; Bob is a member
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'a1a1a1a1-1111-4111-a111-111111111111', 'owner'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'b2b2b2b2-2222-4222-b222-222222222222', 'member');

-- =============================================================================
-- Accounts  (5 total)
-- =============================================================================
-- Deterministic UUIDs so transactions can reference them below.

INSERT INTO accounts (id, household_id, name, type, currency_code, balance_cents, is_active, icon, color, sort_order) VALUES
    -- Alice's personal household
    ('aaaa0001-0000-4000-a000-000000000001', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Checking',       'checking',     'USD',  524073, true,  'bank',        '#4CAF50', 0),
    ('aaaa0002-0000-4000-a000-000000000002', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Savings',        'savings',      'USD', 1250000, true,  'piggy-bank',  '#2196F3', 1),
    ('aaaa0003-0000-4000-a000-000000000003', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Credit Card',    'credit_card',  'USD', -185042, true,  'credit-card', '#F44336', 2),
    -- Shared household
    ('bbbb0001-0000-4000-b000-000000000001', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Joint Checking', 'checking',     'USD',  893215, true,  'bank',        '#9C27B0', 0),
    ('bbbb0002-0000-4000-b000-000000000002', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Joint Savings',  'savings',      'USD', 3400000, true,  'piggy-bank',  '#FF9800', 1);

-- =============================================================================
-- Categories  (10 total — 8 expense, 2 income)
-- =============================================================================

INSERT INTO categories (id, household_id, name, icon, color, parent_id, is_income, sort_order) VALUES
    -- Alice's personal categories
    ('cccc0001-0000-4000-c000-000000000001', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Groceries',       'cart',           '#4CAF50', NULL, false, 0),
    ('cccc0002-0000-4000-c000-000000000002', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Dining Out',      'utensils',       '#FF5722', NULL, false, 1),
    ('cccc0003-0000-4000-c000-000000000003', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Transportation',  'car',            '#607D8B', NULL, false, 2),
    ('cccc0004-0000-4000-c000-000000000004', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Salary',          'briefcase',      '#2196F3', NULL, true,  3),
    ('cccc0005-0000-4000-c000-000000000005', '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Subscriptions',   'repeat',         '#9C27B0', NULL, false, 4),
    -- Shared household categories
    ('cccc0006-0000-4000-c000-000000000006', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Rent',            'home',           '#795548', NULL, false, 0),
    ('cccc0007-0000-4000-c000-000000000007', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Utilities',       'zap',            '#FF9800', NULL, false, 1),
    ('cccc0008-0000-4000-c000-000000000008', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Household Income','wallet',         '#4CAF50', NULL, true,  2),
    ('cccc0009-0000-4000-c000-000000000009', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Entertainment',   'film',           '#E91E63', NULL, false, 3),
    ('cccc000a-0000-4000-c000-00000000000a', '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Insurance',       'shield',         '#3F51B5', NULL, false, 4);

-- =============================================================================
-- Transactions  (30 total)
-- =============================================================================
-- Dates use CURRENT_DATE offsets so data is always "recent" in any dev session.

INSERT INTO transactions (id, household_id, account_id, category_id, amount_cents, currency_code, type, payee, note, date, is_recurring, recurring_rule, status) VALUES
    -- ── Alice's personal checking (expense) ──────────────────────────────────
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0001-0000-4000-c000-000000000001',
     -8743,  'USD', 'DEBIT', 'Whole Foods',       'Weekly groceries',        CURRENT_DATE - INTERVAL '1 day',   false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0001-0000-4000-c000-000000000001',
     -6521,  'USD', 'DEBIT', 'Trader Joe''s',     'Snacks and basics',       CURRENT_DATE - INTERVAL '4 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0002-0000-4000-c000-000000000002',
     -3250,  'USD', 'DEBIT', 'Chipotle',          'Lunch with team',         CURRENT_DATE - INTERVAL '2 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0002-0000-4000-c000-000000000002',
     -4875,  'USD', 'DEBIT', 'Olive Garden',      'Dinner out',              CURRENT_DATE - INTERVAL '6 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0003-0000-4000-c000-000000000003',
     -5500,  'USD', 'DEBIT', 'Shell Gas Station',  'Fuel',                   CURRENT_DATE - INTERVAL '3 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0003-0000-4000-c000-000000000003',
     -2750,  'USD', 'DEBIT', 'Uber',              'Ride to airport',         CURRENT_DATE - INTERVAL '8 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0005-0000-4000-c000-000000000005',
     -1599,  'USD', 'DEBIT', 'Netflix',           'Monthly subscription',    CURRENT_DATE - INTERVAL '10 days', true, 'FREQ=MONTHLY;BYMONTHDAY=15', 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0005-0000-4000-c000-000000000005',
     -1099,  'USD', 'DEBIT', 'Spotify',           'Music streaming',         CURRENT_DATE - INTERVAL '10 days', true, 'FREQ=MONTHLY;BYMONTHDAY=15', 'CLEARED'),

    -- ── Alice's salary (income into checking) ────────────────────────────────
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0004-0000-4000-c000-000000000004',
      550000, 'USD', 'CREDIT', 'Acme Corp',       'Bi-weekly paycheck',      CURRENT_DATE - INTERVAL '14 days', true, 'FREQ=BIWEEKLY', 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0004-0000-4000-c000-000000000004',
      550000, 'USD', 'CREDIT', 'Acme Corp',       'Bi-weekly paycheck',      CURRENT_DATE - INTERVAL '0 days',  true, 'FREQ=BIWEEKLY', 'PENDING'),

    -- ── Alice's credit card ──────────────────────────────────────────────────
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0003-0000-4000-a000-000000000003', 'cccc0001-0000-4000-c000-000000000001',
     -12499, 'USD', 'DEBIT', 'Costco',            'Bulk household items',    CURRENT_DATE - INTERVAL '5 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0003-0000-4000-a000-000000000003', 'cccc0002-0000-4000-c000-000000000002',
     -7825,  'USD', 'DEBIT', 'Sushi Roku',        'Date night',             CURRENT_DATE - INTERVAL '7 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0003-0000-4000-a000-000000000003', 'cccc0005-0000-4000-c000-000000000005',
     -14999, 'USD', 'DEBIT', 'Adobe',             'Creative Cloud annual',   CURRENT_DATE - INTERVAL '20 days', true, 'FREQ=YEARLY', 'CLEARED'),

    -- ── Alice's savings transfer ─────────────────────────────────────────────
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', NULL,
     -50000, 'USD', 'TRANSFER', NULL,             'Monthly savings transfer', CURRENT_DATE - INTERVAL '12 days', true, 'FREQ=MONTHLY;BYMONTHDAY=1', 'CLEARED'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0002-0000-4000-a000-000000000002', NULL,
      50000, 'USD', 'TRANSFER', NULL,             'Monthly savings transfer', CURRENT_DATE - INTERVAL '12 days', true, 'FREQ=MONTHLY;BYMONTHDAY=1', 'CLEARED'),

    -- ── Shared household: joint checking ─────────────────────────────────────
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0006-0000-4000-c000-000000000006',
     -195000, 'USD', 'DEBIT', 'Landlord LLC',     'June rent',               CURRENT_DATE - INTERVAL '1 day',   true, 'FREQ=MONTHLY;BYMONTHDAY=1', 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0007-0000-4000-c000-000000000007',
     -15430,  'USD', 'DEBIT', 'City Power Co',    'Electric bill',           CURRENT_DATE - INTERVAL '5 days',  true, 'FREQ=MONTHLY', 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0007-0000-4000-c000-000000000007',
     -8950,   'USD', 'DEBIT', 'Comcast',          'Internet',                CURRENT_DATE - INTERVAL '5 days',  true, 'FREQ=MONTHLY', 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0007-0000-4000-c000-000000000007',
     -6200,   'USD', 'DEBIT', 'City Water Dept',  'Water & sewer',           CURRENT_DATE - INTERVAL '9 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0009-0000-4000-c000-000000000009',
     -3400,   'USD', 'DEBIT', 'AMC Theatres',     'Movie night',             CURRENT_DATE - INTERVAL '3 days',  false, NULL, 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0009-0000-4000-c000-000000000009',
     -5999,   'USD', 'DEBIT', 'Spotify Family',   'Family plan',             CURRENT_DATE - INTERVAL '11 days', true, 'FREQ=MONTHLY', 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc000a-0000-4000-c000-00000000000a',
     -24500,  'USD', 'DEBIT', 'State Farm',       'Renters insurance',       CURRENT_DATE - INTERVAL '15 days', true, 'FREQ=MONTHLY', 'CLEARED'),

    -- ── Shared household: income into joint checking ─────────────────────────
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0008-0000-4000-c000-000000000008',
      300000, 'USD', 'CREDIT', 'Alice contribution', 'Monthly household share', CURRENT_DATE - INTERVAL '1 day',  true, 'FREQ=MONTHLY;BYMONTHDAY=1', 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0008-0000-4000-c000-000000000008',
      300000, 'USD', 'CREDIT', 'Bob contribution',   'Monthly household share', CURRENT_DATE - INTERVAL '1 day',  true, 'FREQ=MONTHLY;BYMONTHDAY=1', 'CLEARED'),

    -- ── Shared household: joint savings ──────────────────────────────────────
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', NULL,
     -100000, 'USD', 'TRANSFER', NULL,            'Monthly joint savings',   CURRENT_DATE - INTERVAL '2 days',  true, 'FREQ=MONTHLY;BYMONTHDAY=5', 'CLEARED'),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0002-0000-4000-b000-000000000002', NULL,
      100000, 'USD', 'TRANSFER', NULL,            'Monthly joint savings',   CURRENT_DATE - INTERVAL '2 days',  true, 'FREQ=MONTHLY;BYMONTHDAY=5', 'CLEARED'),

    -- ── Pending / future transactions ────────────────────────────────────────
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'bbbb0001-0000-4000-b000-000000000001', 'cccc0006-0000-4000-c000-000000000006',
     -195000, 'USD', 'DEBIT', 'Landlord LLC',     'July rent',               CURRENT_DATE + INTERVAL '25 days', true, 'FREQ=MONTHLY;BYMONTHDAY=1', 'PENDING'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0001-0000-4000-c000-000000000001',
     -9500,   'USD', 'DEBIT', 'Whole Foods',      'Next week groceries',     CURRENT_DATE + INTERVAL '5 days',  false, NULL, 'PENDING'),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'aaaa0001-0000-4000-a000-000000000001', 'cccc0003-0000-4000-c000-000000000003',
     -4500,   'USD', 'DEBIT', 'Jiffy Lube',       'Oil change appointment',  CURRENT_DATE + INTERVAL '10 days', false, NULL, 'PENDING');

-- =============================================================================
-- Budgets  (4 total)
-- =============================================================================
-- period: 'monthly' | 'weekly' | 'yearly'

INSERT INTO budgets (id, household_id, category_id, amount_cents, currency_code, period, start_date, end_date) VALUES
    -- Alice's personal budgets
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'cccc0001-0000-4000-c000-000000000001',  60000, 'USD', 'monthly',
     date_trunc('month', CURRENT_DATE)::date, NULL),
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'cccc0002-0000-4000-c000-000000000002',  25000, 'USD', 'monthly',
     date_trunc('month', CURRENT_DATE)::date, NULL),
    -- Shared household budgets
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'cccc0007-0000-4000-c000-000000000007',  35000, 'USD', 'monthly',
     date_trunc('month', CURRENT_DATE)::date, NULL),
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'cccc0009-0000-4000-c000-000000000009',  15000, 'USD', 'monthly',
     date_trunc('month', CURRENT_DATE)::date, NULL);

-- =============================================================================
-- Goals  (2 total)
-- =============================================================================

INSERT INTO goals (id, household_id, name, target_cents, current_cents, currency_code, target_date, icon, color) VALUES
    -- Alice's personal goal
    (gen_random_uuid(), '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'Emergency Fund',  2000000,  1250000, 'USD',
     (CURRENT_DATE + INTERVAL '6 months')::date, 'shield', '#4CAF50'),
    -- Shared household goal
    (gen_random_uuid(), '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'Vacation Fund',   500000,   340000,  'USD',
     (CURRENT_DATE + INTERVAL '3 months')::date, 'airplane', '#2196F3');

-- =============================================================================
-- Re-enable triggers
-- =============================================================================
SET session_replication_role = 'origin';
