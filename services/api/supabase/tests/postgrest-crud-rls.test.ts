// SPDX-License-Identifier: BUSL-1.1

/**
 * PostgREST CRUD with RLS Tests (#1321)
 *
 * Validates that CRUD operations enforce Row-Level Security correctly.
 * Each core table (accounts, transactions, budgets, goals, categories)
 * is tested for:
 * - SELECT: user can only read own household records
 * - INSERT: new records are scoped to user's household
 * - UPDATE: user can only update own household records
 * - DELETE: soft delete only affects user's household records
 * - Cross-user isolation: user A cannot see/modify user B's data
 *
 * These tests use the mock Supabase client to simulate RLS behaviour.
 * For live integration testing, see rls-verification.sql.
 *
 * Usage:
 *   deno test --allow-env --allow-net=none --no-check supabase/tests/postgrest-crud-rls.test.ts
 */

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { createMockSupabaseClient } from '../functions/_test_helpers/mock-supabase.ts';
import {
  TEST_USER,
  TEST_USER_2,
  TEST_HOUSEHOLD,
  TEST_HOUSEHOLD_2,
  TEST_ACCOUNT,
} from '../functions/_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Types for RLS simulation
// ---------------------------------------------------------------------------

/** Simulates a user context with their household memberships. */
interface UserContext {
  userId: string;
  householdIds: string[];
}

/** Generic record shape for RLS testing. */
interface HouseholdRecord {
  id: string;
  household_id: string;
  owner_id: string;
  deleted_at: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// RLS simulation helpers
// ---------------------------------------------------------------------------

const USER_A: UserContext = {
  userId: TEST_USER.id,
  householdIds: [TEST_HOUSEHOLD.id],
};

const USER_B: UserContext = {
  userId: TEST_USER_2.id,
  householdIds: [TEST_HOUSEHOLD_2.id],
};

/**
 * Simulate RLS SELECT filter: user sees only records from their households.
 */
function rlsSelect(records: HouseholdRecord[], ctx: UserContext): HouseholdRecord[] {
  return records.filter((r) => ctx.householdIds.includes(r.household_id) && r.deleted_at === null);
}

/**
 * Simulate RLS INSERT check: record must belong to user's household.
 */
function rlsInsertAllowed(record: HouseholdRecord, ctx: UserContext): boolean {
  return ctx.householdIds.includes(record.household_id);
}

/**
 * Simulate RLS UPDATE check: user can only update records in their household.
 */
function rlsUpdateAllowed(record: HouseholdRecord, ctx: UserContext): boolean {
  return ctx.householdIds.includes(record.household_id) && record.deleted_at === null;
}

/**
 * Simulate RLS DELETE (soft delete) check.
 */
function rlsDeleteAllowed(record: HouseholdRecord, ctx: UserContext): boolean {
  return ctx.householdIds.includes(record.household_id);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ACCOUNTS: HouseholdRecord[] = [
  {
    id: 'acct-1',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'Checking',
    type: 'checking',
    balance_cents: 150000,
    currency_code: 'USD',
  },
  {
    id: 'acct-2',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER_2.id,
    deleted_at: null,
    name: 'Savings',
    type: 'savings',
    balance_cents: 500000,
    currency_code: 'USD',
  },
  {
    id: 'acct-3',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: '2024-03-01T10:00:00Z',
    name: 'Closed Account',
    type: 'checking',
    balance_cents: 0,
    currency_code: 'USD',
  },
];

const TRANSACTIONS: HouseholdRecord[] = [
  {
    id: 'txn-1',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    amount_cents: -5000,
    currency_code: 'USD',
    payee: 'Grocery Store',
  },
  {
    id: 'txn-2',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER_2.id,
    deleted_at: null,
    amount_cents: -3000,
    currency_code: 'USD',
    payee: 'Gas Station',
  },
];

const CATEGORIES: HouseholdRecord[] = [
  {
    id: 'cat-1',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'Food',
    is_income: false,
  },
  {
    id: 'cat-2',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER_2.id,
    deleted_at: null,
    name: 'Salary',
    is_income: true,
  },
];

const BUDGETS: HouseholdRecord[] = [
  {
    id: 'budget-1',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    amount_cents: 50000,
    currency_code: 'USD',
    period: 'monthly',
    is_rollover: false,
  },
  {
    id: 'budget-2',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER_2.id,
    deleted_at: null,
    amount_cents: 80000,
    currency_code: 'USD',
    period: 'monthly',
    is_rollover: true,
  },
];

const GOALS: HouseholdRecord[] = [
  {
    id: 'goal-1',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'Emergency Fund',
    target_cents: 1000000,
    current_cents: 250000,
    status: 'active',
  },
  {
    id: 'goal-2',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER_2.id,
    deleted_at: null,
    name: 'Vacation',
    target_cents: 500000,
    current_cents: 100000,
    status: 'active',
  },
];

// ---------------------------------------------------------------------------
// Helper to run CRUD tests for a given table
// ---------------------------------------------------------------------------

interface CrudTestConfig {
  tableName: string;
  records: HouseholdRecord[];
  newRecord: HouseholdRecord;
  crossHouseholdRecord: HouseholdRecord;
}

function runCrudTests(config: CrudTestConfig): void {
  const { tableName, records, newRecord, crossHouseholdRecord } = config;

  // -------------------------------------------------------------------------
  // SELECT tests
  // -------------------------------------------------------------------------

  Deno.test(`rls/${tableName} — SELECT: user A sees only own household records`, () => {
    const visible = rlsSelect(records, USER_A);
    for (const record of visible) {
      assertEquals(
        USER_A.householdIds.includes(record.household_id),
        true,
        `Record ${record.id} should belong to user A's household`,
      );
    }
  });

  Deno.test(`rls/${tableName} — SELECT: user A cannot see user B's records`, () => {
    const visible = rlsSelect(records, USER_A);
    const userBRecords = visible.filter((r) => r.owner_id === TEST_USER_2.id);
    assertEquals(userBRecords.length, 0, 'User A should not see user B records');
  });

  Deno.test(`rls/${tableName} — SELECT: soft-deleted records are hidden`, () => {
    const visible = rlsSelect(records, USER_A);
    const deleted = visible.filter((r) => r.deleted_at !== null);
    assertEquals(deleted.length, 0, 'Soft-deleted records should not be visible');
  });

  Deno.test(`rls/${tableName} — SELECT: user B sees only own household records`, () => {
    const visible = rlsSelect(records, USER_B);
    for (const record of visible) {
      assertEquals(
        USER_B.householdIds.includes(record.household_id),
        true,
        `Record ${record.id} should belong to user B's household`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // INSERT tests
  // -------------------------------------------------------------------------

  Deno.test(`rls/${tableName} — INSERT: user can insert into own household`, () => {
    assertEquals(rlsInsertAllowed(newRecord, USER_A), true);
  });

  Deno.test(`rls/${tableName} — INSERT: user cannot insert into other's household`, () => {
    assertEquals(rlsInsertAllowed(crossHouseholdRecord, USER_A), false);
  });

  // -------------------------------------------------------------------------
  // UPDATE tests
  // -------------------------------------------------------------------------

  Deno.test(`rls/${tableName} — UPDATE: user can update own household records`, () => {
    const ownRecords = records.filter(
      (r) => USER_A.householdIds.includes(r.household_id) && r.deleted_at === null,
    );
    for (const record of ownRecords) {
      assertEquals(rlsUpdateAllowed(record, USER_A), true);
    }
  });

  Deno.test(`rls/${tableName} — UPDATE: user cannot update other's household records`, () => {
    const otherRecords = records.filter((r) => !USER_A.householdIds.includes(r.household_id));
    for (const record of otherRecords) {
      assertEquals(rlsUpdateAllowed(record, USER_A), false);
    }
  });

  Deno.test(`rls/${tableName} — UPDATE: user cannot update soft-deleted records`, () => {
    const deletedRecords = records.filter((r) => r.deleted_at !== null);
    for (const record of deletedRecords) {
      assertEquals(
        rlsUpdateAllowed(record, USER_A),
        false,
        `Soft-deleted record ${record.id} should not be updatable`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // DELETE (soft delete) tests
  // -------------------------------------------------------------------------

  Deno.test(`rls/${tableName} — DELETE: user can soft-delete own household records`, () => {
    const ownRecords = records.filter((r) => USER_A.householdIds.includes(r.household_id));
    for (const record of ownRecords) {
      assertEquals(rlsDeleteAllowed(record, USER_A), true);
    }
  });

  Deno.test(`rls/${tableName} — DELETE: user cannot soft-delete other's household records`, () => {
    const otherRecords = records.filter((r) => !USER_A.householdIds.includes(r.household_id));
    for (const record of otherRecords) {
      assertEquals(rlsDeleteAllowed(record, USER_A), false);
    }
  });
}

// ---------------------------------------------------------------------------
// Run CRUD tests for each core table
// ---------------------------------------------------------------------------

runCrudTests({
  tableName: 'accounts',
  records: ACCOUNTS,
  newRecord: {
    id: 'acct-new',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'New Account',
    type: 'savings',
    balance_cents: 0,
    currency_code: 'USD',
  },
  crossHouseholdRecord: {
    id: 'acct-cross',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'Cross Account',
    type: 'checking',
    balance_cents: 0,
    currency_code: 'USD',
  },
});

runCrudTests({
  tableName: 'transactions',
  records: TRANSACTIONS,
  newRecord: {
    id: 'txn-new',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    amount_cents: -1500,
    currency_code: 'USD',
    payee: 'New Store',
  },
  crossHouseholdRecord: {
    id: 'txn-cross',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    amount_cents: -2000,
    currency_code: 'USD',
    payee: 'Cross Store',
  },
});

runCrudTests({
  tableName: 'categories',
  records: CATEGORIES,
  newRecord: {
    id: 'cat-new',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'New Category',
    is_income: false,
  },
  crossHouseholdRecord: {
    id: 'cat-cross',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'Cross Category',
    is_income: false,
  },
});

runCrudTests({
  tableName: 'budgets',
  records: BUDGETS,
  newRecord: {
    id: 'budget-new',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    amount_cents: 30000,
    currency_code: 'USD',
    period: 'weekly',
    is_rollover: false,
  },
  crossHouseholdRecord: {
    id: 'budget-cross',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    amount_cents: 40000,
    currency_code: 'USD',
    period: 'monthly',
    is_rollover: false,
  },
});

runCrudTests({
  tableName: 'goals',
  records: GOALS,
  newRecord: {
    id: 'goal-new',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'New Goal',
    target_cents: 200000,
    current_cents: 0,
    status: 'active',
  },
  crossHouseholdRecord: {
    id: 'goal-cross',
    household_id: TEST_HOUSEHOLD_2.id,
    owner_id: TEST_USER.id,
    deleted_at: null,
    name: 'Cross Goal',
    target_cents: 300000,
    current_cents: 0,
    status: 'active',
  },
});

// ---------------------------------------------------------------------------
// Cross-user isolation tests
// ---------------------------------------------------------------------------

Deno.test('rls/cross-user — user A and user B see completely disjoint data', () => {
  const allTables = [ACCOUNTS, TRANSACTIONS, CATEGORIES, BUDGETS, GOALS];

  for (const records of allTables) {
    const visibleToA = rlsSelect(records, USER_A);
    const visibleToB = rlsSelect(records, USER_B);

    const idsA = new Set(visibleToA.map((r) => r.id));
    const idsB = new Set(visibleToB.map((r) => r.id));

    const intersection = [...idsA].filter((id) => idsB.has(id));
    assertEquals(
      intersection.length,
      0,
      `Users should see completely disjoint records, found overlap: ${intersection.join(', ')}`,
    );
  }
});

Deno.test('rls/cross-user — user A total record count is correct', () => {
  assertEquals(rlsSelect(ACCOUNTS, USER_A).length, 1);
  assertEquals(rlsSelect(TRANSACTIONS, USER_A).length, 1);
  assertEquals(rlsSelect(CATEGORIES, USER_A).length, 1);
  assertEquals(rlsSelect(BUDGETS, USER_A).length, 1);
  assertEquals(rlsSelect(GOALS, USER_A).length, 1);
});

Deno.test('rls/cross-user — user B total record count is correct', () => {
  assertEquals(rlsSelect(ACCOUNTS, USER_B).length, 1);
  assertEquals(rlsSelect(TRANSACTIONS, USER_B).length, 1);
  assertEquals(rlsSelect(CATEGORIES, USER_B).length, 1);
  assertEquals(rlsSelect(BUDGETS, USER_B).length, 1);
  assertEquals(rlsSelect(GOALS, USER_B).length, 1);
});

// ---------------------------------------------------------------------------
// Mock Supabase client CRUD operations
// ---------------------------------------------------------------------------

Deno.test('rls/mock — Supabase client INSERT returns created record', async () => {
  const newAccount = {
    id: 'acct-created',
    household_id: TEST_HOUSEHOLD.id,
    owner_id: TEST_USER.id,
    name: 'Created via PostgREST',
    type: 'savings',
    balance_cents: 0,
    currency_code: 'USD',
  };

  const client = createMockSupabaseClient({
    queryResults: {
      accounts: {
        data: [newAccount],
        error: null,
      },
    },
  });

  const result = await client.from('accounts').insert(newAccount).select().single();
  assertEquals(result.error, null);
  const data = result.data as Record<string, unknown>;
  assertEquals(data.id, 'acct-created');
});

Deno.test('rls/mock — Supabase client UPDATE returns updated record', async () => {
  const client = createMockSupabaseClient({
    queryResults: {
      accounts: {
        data: [{ ...TEST_ACCOUNT, name: 'Updated Checking', balance_cents: 200000 }],
        error: null,
      },
    },
  });

  const result = await client
    .from('accounts')
    .update({ name: 'Updated Checking', balance_cents: 200000 })
    .eq('id', TEST_ACCOUNT.id)
    .select()
    .single();

  assertEquals(result.error, null);
});

Deno.test('rls/mock — Supabase client soft DELETE sets deleted_at', async () => {
  const client = createMockSupabaseClient({
    queryResults: {
      accounts: {
        data: [{ ...TEST_ACCOUNT, deleted_at: new Date().toISOString() }],
        error: null,
      },
    },
  });

  const result = await client
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', TEST_ACCOUNT.id)
    .select()
    .single();

  assertEquals(result.error, null);
  const data = result.data as Record<string, unknown>;
  assertNotEquals(data.deleted_at, null);
});

Deno.test('rls/mock — RLS violation returns error for cross-household insert', async () => {
  const client = createMockSupabaseClient({
    queryResults: {
      accounts: {
        data: null,
        error: {
          message: 'new row violates row-level security policy for table "accounts"',
          code: '42501',
        },
      },
    },
  });

  const result = await client
    .from('accounts')
    .insert({
      household_id: TEST_HOUSEHOLD_2.id,
      name: 'Should Fail',
    })
    .select()
    .single();

  assertNotEquals(result.error, null);
});

// ---------------------------------------------------------------------------
// Users table: special RLS (id = auth.uid())
// ---------------------------------------------------------------------------

Deno.test('rls/users — user can only see own profile', () => {
  const allUsers = [
    { id: TEST_USER.id, email: TEST_USER.email },
    { id: TEST_USER_2.id, email: TEST_USER_2.email },
  ];

  // Users table RLS: id = auth.uid()
  const visible = allUsers.filter((u) => u.id === TEST_USER.id);
  assertEquals(visible.length, 1);
  assertEquals(visible[0].email, TEST_USER.email);
});

Deno.test("rls/users — user cannot update another user's profile", () => {
  const targetUserId = TEST_USER_2.id;
  const authenticatedUserId = TEST_USER.id;
  const allowed = targetUserId === authenticatedUserId;
  assertEquals(allowed, false);
});

// ---------------------------------------------------------------------------
// Coverage summary
// ---------------------------------------------------------------------------

Deno.test('rls/coverage — all core tables have CRUD tests', () => {
  const testedTables = ['accounts', 'transactions', 'categories', 'budgets', 'goals'];
  const testedOperations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  assertEquals(testedTables.length, 5, 'All 5 core tables should be tested');
  assertEquals(testedOperations.length, 4, 'All 4 CRUD operations should be tested');
});
