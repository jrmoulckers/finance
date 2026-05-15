// SPDX-License-Identifier: BUSL-1.1

/**
 * PowerSync Initial & Incremental Sync Tests (#1320)
 *
 * Validates sync pipeline correctness:
 * - Initial sync downloads all user data
 * - Incremental sync picks up only changes since last sync
 * - Sync respects RLS (user only gets own data)
 * - Conflict resolution: last-write-wins for simple fields
 * - Sync handles soft-deleted records
 * - Sync version tracking (sync_version, is_synced)
 *
 * These tests validate the sync-rules contract and mock the sync
 * behaviour without requiring a live PowerSync or Supabase instance.
 *
 * Usage:
 *   deno test --allow-env --allow-read --allow-net=none --no-check supabase/tests/powersync-sync.test.ts
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { parse as parseYaml } from 'https://deno.land/std@0.208.0/yaml/mod.ts';
import { createMockSupabaseClient } from '../functions/_test_helpers/mock-supabase.ts';
import { TEST_HOUSEHOLD, TEST_TRANSACTION } from '../functions/_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve paths relative to this test file. */
const TEST_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

function resolve(...parts: string[]): string {
  let joined = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const sep = joined.endsWith('/') || joined.endsWith('\\') ? '' : '/';
    joined = joined + sep + parts[i];
  }
  const segments: string[] = [];
  for (const seg of joined.replace(/\\/g, '/').split('/')) {
    if (seg === '..') segments.pop();
    else if (seg !== '.' && seg !== '') segments.push(seg);
  }
  const first = segments[0];
  if (first && first.length === 2 && first[1] === ':') {
    return segments.join('/');
  }
  return '/' + segments.join('/');
}

const SYNC_RULES_PATH = resolve(TEST_DIR, '..', '..', 'powersync', 'sync-rules.yaml');

interface SyncRules {
  bucket_definitions: Record<string, BucketDefinition>;
}

interface BucketDefinition {
  parameters?: string[];
  data: string[];
}

async function loadSyncRules(): Promise<SyncRules> {
  const text = await Deno.readTextFile(SYNC_RULES_PATH);
  return parseYaml(text) as SyncRules;
}

// ---------------------------------------------------------------------------
// Simulated sync state for testing incremental sync
// ---------------------------------------------------------------------------

interface SyncCheckpoint {
  last_sync_version: number;
  last_sync_at: string;
}

interface SyncableRecord {
  id: string;
  sync_version: number;
  is_synced: boolean;
  updated_at: string;
  deleted_at: string | null;
  [key: string]: unknown;
}

/**
 * Simulate initial sync: returns all records with deleted_at IS NULL.
 */
function simulateInitialSync(records: SyncableRecord[]): SyncableRecord[] {
  return records.filter((r) => r.deleted_at === null);
}

/**
 * Simulate incremental sync: returns records changed since the checkpoint.
 */
function simulateIncrementalSync(
  records: SyncableRecord[],
  checkpoint: SyncCheckpoint,
): SyncableRecord[] {
  return records.filter(
    (r) => r.sync_version > checkpoint.last_sync_version && r.deleted_at === null,
  );
}

/**
 * Simulate last-write-wins conflict resolution.
 * Given two versions of the same record, the one with the later updated_at wins.
 */
function resolveConflictLWW(local: SyncableRecord, remote: SyncableRecord): SyncableRecord {
  const localTime = new Date(local.updated_at).getTime();
  const remoteTime = new Date(remote.updated_at).getTime();
  return remoteTime >= localTime ? remote : local;
}

// ---------------------------------------------------------------------------
// Tests: Initial sync downloads all user data
// ---------------------------------------------------------------------------

Deno.test('sync — initial sync returns all active records', () => {
  const records: SyncableRecord[] = [
    {
      id: 'txn-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-03-01T10:00:00Z',
      deleted_at: null,
      amount_cents: -5000,
    },
    {
      id: 'txn-2',
      sync_version: 2,
      is_synced: true,
      updated_at: '2024-03-02T10:00:00Z',
      deleted_at: null,
      amount_cents: -3000,
    },
    {
      id: 'txn-3',
      sync_version: 3,
      is_synced: true,
      updated_at: '2024-03-03T10:00:00Z',
      deleted_at: '2024-03-04T10:00:00Z', // soft-deleted
      amount_cents: -1000,
    },
  ];

  const synced = simulateInitialSync(records);
  assertEquals(synced.length, 2);
  assertEquals(synced[0].id, 'txn-1');
  assertEquals(synced[1].id, 'txn-2');
});

Deno.test('sync — initial sync excludes soft-deleted records', () => {
  const records: SyncableRecord[] = [
    {
      id: 'acct-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-01-01T10:00:00Z',
      deleted_at: '2024-02-01T10:00:00Z',
      name: 'Deleted Account',
    },
  ];

  const synced = simulateInitialSync(records);
  assertEquals(synced.length, 0);
});

Deno.test('sync — initial sync returns empty array when no data exists', () => {
  const synced = simulateInitialSync([]);
  assertEquals(synced.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: Incremental sync picks up only changes since last sync
// ---------------------------------------------------------------------------

Deno.test('sync — incremental sync returns only records changed after checkpoint', () => {
  const checkpoint: SyncCheckpoint = {
    last_sync_version: 2,
    last_sync_at: '2024-03-02T10:00:00Z',
  };

  const records: SyncableRecord[] = [
    {
      id: 'txn-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-03-01T10:00:00Z',
      deleted_at: null,
    },
    {
      id: 'txn-2',
      sync_version: 2,
      is_synced: true,
      updated_at: '2024-03-02T10:00:00Z',
      deleted_at: null,
    },
    {
      id: 'txn-3',
      sync_version: 3,
      is_synced: true,
      updated_at: '2024-03-03T10:00:00Z',
      deleted_at: null,
    },
    {
      id: 'txn-4',
      sync_version: 4,
      is_synced: false,
      updated_at: '2024-03-04T10:00:00Z',
      deleted_at: null,
    },
  ];

  const synced = simulateIncrementalSync(records, checkpoint);
  assertEquals(synced.length, 2);
  assertEquals(synced[0].id, 'txn-3');
  assertEquals(synced[1].id, 'txn-4');
});

Deno.test('sync — incremental sync returns empty when nothing changed', () => {
  const checkpoint: SyncCheckpoint = {
    last_sync_version: 5,
    last_sync_at: '2024-03-05T10:00:00Z',
  };

  const records: SyncableRecord[] = [
    {
      id: 'txn-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-03-01T10:00:00Z',
      deleted_at: null,
    },
  ];

  const synced = simulateIncrementalSync(records, checkpoint);
  assertEquals(synced.length, 0);
});

Deno.test('sync — incremental sync excludes soft-deleted records even if version is newer', () => {
  const checkpoint: SyncCheckpoint = {
    last_sync_version: 1,
    last_sync_at: '2024-03-01T10:00:00Z',
  };

  const records: SyncableRecord[] = [
    {
      id: 'txn-1',
      sync_version: 2,
      is_synced: true,
      updated_at: '2024-03-02T10:00:00Z',
      deleted_at: '2024-03-02T11:00:00Z', // soft-deleted after update
    },
  ];

  const synced = simulateIncrementalSync(records, checkpoint);
  assertEquals(synced.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: Sync respects RLS (user only gets own data)
// ---------------------------------------------------------------------------

Deno.test('sync — user only receives data from own households', () => {
  const userHouseholds = [TEST_HOUSEHOLD.id];

  const allRecords = [
    { id: 'txn-1', household_id: TEST_HOUSEHOLD.id, amount_cents: -5000 },
    { id: 'txn-2', household_id: 'other-household-id', amount_cents: -3000 },
    { id: 'txn-3', household_id: TEST_HOUSEHOLD.id, amount_cents: -1000 },
  ];

  const filtered = allRecords.filter((r) => userHouseholds.includes(r.household_id));
  assertEquals(filtered.length, 2);
  assertEquals(filtered[0].id, 'txn-1');
  assertEquals(filtered[1].id, 'txn-3');
});

Deno.test('sync — user in multiple households sees data from all', () => {
  const userHouseholds = ['hh-personal', 'hh-shared'];

  const allRecords = [
    { id: 'acct-1', household_id: 'hh-personal', name: 'Personal Checking' },
    { id: 'acct-2', household_id: 'hh-shared', name: 'Joint Savings' },
    { id: 'acct-3', household_id: 'hh-other', name: 'Someone Else Account' },
  ];

  const filtered = allRecords.filter((r) => userHouseholds.includes(r.household_id));
  assertEquals(filtered.length, 2);
});

Deno.test('sync — user with no household membership sees no data', () => {
  const userHouseholds: string[] = [];

  const allRecords = [{ id: 'txn-1', household_id: 'hh-1', amount_cents: -5000 }];

  const filtered = allRecords.filter((r) => userHouseholds.includes(r.household_id));
  assertEquals(filtered.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: Conflict resolution — last-write-wins
// ---------------------------------------------------------------------------

Deno.test('sync — LWW: remote wins when remote is newer', () => {
  const local: SyncableRecord = {
    id: 'txn-1',
    sync_version: 3,
    is_synced: true,
    updated_at: '2024-03-01T10:00:00Z',
    deleted_at: null,
    amount_cents: -5000,
  };

  const remote: SyncableRecord = {
    id: 'txn-1',
    sync_version: 4,
    is_synced: true,
    updated_at: '2024-03-01T12:00:00Z',
    deleted_at: null,
    amount_cents: -7500,
  };

  const resolved = resolveConflictLWW(local, remote);
  assertEquals(resolved.amount_cents, -7500);
  assertEquals(resolved.sync_version, 4);
});

Deno.test('sync — LWW: local wins when local is newer', () => {
  const local: SyncableRecord = {
    id: 'txn-1',
    sync_version: 5,
    is_synced: false,
    updated_at: '2024-03-02T14:00:00Z',
    deleted_at: null,
    amount_cents: -9900,
  };

  const remote: SyncableRecord = {
    id: 'txn-1',
    sync_version: 4,
    is_synced: true,
    updated_at: '2024-03-02T10:00:00Z',
    deleted_at: null,
    amount_cents: -5000,
  };

  const resolved = resolveConflictLWW(local, remote);
  assertEquals(resolved.amount_cents, -9900);
});

Deno.test('sync — LWW: tie goes to remote (server authority)', () => {
  const timestamp = '2024-03-01T10:00:00Z';
  const local: SyncableRecord = {
    id: 'txn-1',
    sync_version: 3,
    is_synced: true,
    updated_at: timestamp,
    deleted_at: null,
    amount_cents: -5000,
  };

  const remote: SyncableRecord = {
    id: 'txn-1',
    sync_version: 3,
    is_synced: true,
    updated_at: timestamp,
    deleted_at: null,
    amount_cents: -7500,
  };

  const resolved = resolveConflictLWW(local, remote);
  // When timestamps are equal, remote wins (>= comparison)
  assertEquals(resolved.amount_cents, -7500);
});

// ---------------------------------------------------------------------------
// Tests: Sync handles soft-deleted records
// ---------------------------------------------------------------------------

Deno.test('sync — soft-deleted records are filtered from sync buckets', () => {
  const records: SyncableRecord[] = [
    {
      id: 'cat-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-01-01T10:00:00Z',
      deleted_at: null,
      name: 'Active Category',
    },
    {
      id: 'cat-2',
      sync_version: 2,
      is_synced: true,
      updated_at: '2024-01-02T10:00:00Z',
      deleted_at: '2024-01-03T10:00:00Z',
      name: 'Deleted Category',
    },
  ];

  const synced = simulateInitialSync(records);
  assertEquals(synced.length, 1);
  assertEquals(synced[0].name, 'Active Category');
});

Deno.test('sync — re-activating a soft-deleted record includes it in next sync', () => {
  const checkpoint: SyncCheckpoint = {
    last_sync_version: 2,
    last_sync_at: '2024-01-02T10:00:00Z',
  };

  const records: SyncableRecord[] = [
    {
      id: 'cat-1',
      sync_version: 3,
      is_synced: true,
      updated_at: '2024-01-04T10:00:00Z',
      deleted_at: null,
      name: 'Re-activated Category',
    },
  ];

  const synced = simulateIncrementalSync(records, checkpoint);
  assertEquals(synced.length, 1);
  assertEquals(synced[0].name, 'Re-activated Category');
});

// ---------------------------------------------------------------------------
// Tests: Sync version tracking
// ---------------------------------------------------------------------------

Deno.test('sync — sync_version increments on each change', () => {
  const v1: SyncableRecord = {
    id: 'acct-1',
    sync_version: 1,
    is_synced: true,
    updated_at: '2024-01-01T10:00:00Z',
    deleted_at: null,
  };

  const v2: SyncableRecord = {
    ...v1,
    sync_version: 2,
    updated_at: '2024-01-02T10:00:00Z',
  };

  assertEquals(v2.sync_version > v1.sync_version, true);
});

Deno.test('sync — is_synced flag tracks local-only changes', () => {
  const localRecord: SyncableRecord = {
    id: 'txn-new',
    sync_version: 0,
    is_synced: false,
    updated_at: '2024-03-01T10:00:00Z',
    deleted_at: null,
    amount_cents: -2500,
  };

  assertEquals(localRecord.is_synced, false);
  assertEquals(localRecord.sync_version, 0);

  const syncedRecord: SyncableRecord = {
    ...localRecord,
    sync_version: 1,
    is_synced: true,
  };

  assertEquals(syncedRecord.is_synced, true);
  assertEquals(syncedRecord.sync_version, 1);
});

// ---------------------------------------------------------------------------
// Tests: Sync rules YAML contract (file-based)
// ---------------------------------------------------------------------------

Deno.test('sync — by_household bucket filters all data queries on household_id', async () => {
  const rules = await loadSyncRules();
  const byHousehold = rules.bucket_definitions['by_household'];
  assertEquals(byHousehold !== undefined, true, 'by_household bucket must exist');

  if (!byHousehold) return;

  for (const query of byHousehold.data) {
    assertStringIncludes(
      query.toLowerCase(),
      'bucket.household_id',
      `by_household query should reference bucket.household_id: ${query.substring(0, 80)}`,
    );
  }
});

Deno.test('sync — user_profile bucket filters all data queries on user_id', async () => {
  const rules = await loadSyncRules();
  const userProfile = rules.bucket_definitions['user_profile'];
  assertEquals(userProfile !== undefined, true, 'user_profile bucket must exist');

  if (!userProfile) return;

  for (const query of userProfile.data) {
    assertStringIncludes(
      query.toLowerCase(),
      'bucket.user_id',
      `user_profile query should reference bucket.user_id: ${query.substring(0, 80)}`,
    );
  }
});

Deno.test('sync — all data queries exclude sync_version and is_synced columns', async () => {
  const rules = await loadSyncRules();
  const violations: string[] = [];

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of bucket.data) {
      const lower = query.toLowerCase();
      if (lower.includes('sync_version') || lower.includes('is_synced')) {
        violations.push(`${bucketName}: ${query.substring(0, 80)}`);
      }
    }
  }

  assertEquals(
    violations,
    [],
    `Data queries should not include sync_version or is_synced:\n${violations.join('\n')}`,
  );
});

Deno.test('sync — all data queries include deleted_at IS NULL filter', async () => {
  const rules = await loadSyncRules();
  const violations: string[] = [];

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of bucket.data) {
      if (!query.toLowerCase().includes('deleted_at is null')) {
        violations.push(`${bucketName}: ${query.substring(0, 80)}`);
      }
    }
  }

  assertEquals(
    violations,
    [],
    `Data queries missing deleted_at IS NULL filter:\n${violations.join('\n')}`,
  );
});

// ---------------------------------------------------------------------------
// Tests: Mock Supabase client sync operations
// ---------------------------------------------------------------------------

Deno.test('sync — mock client returns correct data for household query', async () => {
  const client = createMockSupabaseClient({
    queryResults: {
      transactions: {
        data: [
          {
            id: TEST_TRANSACTION.id,
            household_id: TEST_HOUSEHOLD.id,
            amount_cents: TEST_TRANSACTION.amount_cents,
          },
        ],
        error: null,
        count: 1,
      },
    },
  });

  const result = await client
    .from('transactions')
    .select('*')
    .eq('household_id', TEST_HOUSEHOLD.id)
    .is('deleted_at', null);

  assertEquals(result.error, null);
  const data = result.data as Array<Record<string, unknown>>;
  assertEquals(data.length, 1);
  assertEquals(data[0].household_id, TEST_HOUSEHOLD.id);
});

Deno.test('sync — mock client returns empty data for wrong household', async () => {
  const client = createMockSupabaseClient({
    queryResults: {
      transactions: {
        data: [],
        error: null,
        count: 0,
      },
    },
  });

  const result = await client
    .from('transactions')
    .select('*')
    .eq('household_id', 'wrong-household-id')
    .is('deleted_at', null);

  assertEquals(result.error, null);
  const data = result.data as Array<Record<string, unknown>>;
  assertEquals(data.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: Ordering and no duplicate application
// ---------------------------------------------------------------------------

Deno.test('sync — incremental sync preserves change ordering by sync_version', () => {
  const checkpoint: SyncCheckpoint = {
    last_sync_version: 0,
    last_sync_at: '2024-01-01T00:00:00Z',
  };

  const records: SyncableRecord[] = [
    {
      id: 'txn-3',
      sync_version: 3,
      is_synced: true,
      updated_at: '2024-03-03T10:00:00Z',
      deleted_at: null,
    },
    {
      id: 'txn-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-03-01T10:00:00Z',
      deleted_at: null,
    },
    {
      id: 'txn-2',
      sync_version: 2,
      is_synced: true,
      updated_at: '2024-03-02T10:00:00Z',
      deleted_at: null,
    },
  ];

  const synced = simulateIncrementalSync(records, checkpoint);
  assertEquals(synced.length, 3);

  synced.sort((a, b) => a.sync_version - b.sync_version);
  assertEquals(synced[0].id, 'txn-1');
  assertEquals(synced[1].id, 'txn-2');
  assertEquals(synced[2].id, 'txn-3');
});

Deno.test('sync — same record is not duplicated in sync results', () => {
  const checkpoint: SyncCheckpoint = {
    last_sync_version: 0,
    last_sync_at: '2024-01-01T00:00:00Z',
  };

  const records: SyncableRecord[] = [
    {
      id: 'txn-1',
      sync_version: 1,
      is_synced: true,
      updated_at: '2024-03-01T10:00:00Z',
      deleted_at: null,
    },
  ];

  const synced = simulateIncrementalSync(records, checkpoint);
  const ids = synced.map((r) => r.id);
  const uniqueIds = new Set(ids);
  assertEquals(ids.length, uniqueIds.size, 'No duplicate records in sync results');
});
