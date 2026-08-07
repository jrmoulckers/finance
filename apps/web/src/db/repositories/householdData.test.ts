// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsyncDb } from '../async-db';
import { query, queryOne } from '../async-db';

// Shared in-memory table store for the mocked sqlite primitives. `vi.hoisted`
// keeps it available to both the (hoisted) mock factory and the test body.
const { tables } = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../async-db', () => ({
  beginSavepoint: vi.fn(),
  execute: vi.fn((_db: unknown, sql: string, params?: unknown[]) => {
    const deleteMatch = /^DELETE FROM\s+(\w+)/i.exec(sql);
    if (deleteMatch) {
      tables[deleteMatch[1]] = [];
      return;
    }
    const insertMatch = /^INSERT INTO\s+(\w+)\s+\(([^)]+)\)\s+VALUES/i.exec(sql);
    if (insertMatch) {
      const columns = [...insertMatch[2].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      const row = Object.fromEntries(columns.map((column, index) => [column, params?.[index]]));
      tables[insertMatch[1]] = [...(tables[insertMatch[1]] ?? []), row];
    }
    // SAVEPOINT / RELEASE / ROLLBACK statements are no-ops in this fake.
  }),
  query: vi.fn((_db: unknown, sql: string) => {
    const table = /FROM\s+(\w+)/i.exec(sql)?.[1] ?? '';
    return { columns: [], rows: tables[table] ?? [] };
  }),
  queryOne: vi.fn((_db: unknown, sql: string) => {
    const table = /FROM\s+(\w+)/i.exec(sql)?.[1] ?? '';
    return (tables[table] ?? [])[0] ?? null;
  }),
  releaseSavepoint: vi.fn(),
  rollbackToSavepoint: vi.fn(),
}));

import { HOUSEHOLD_SINGLETON_KEY, readHouseholdValue, writeHouseholdValue } from './householdData';

const db = {} as AsyncDb;

const MEMBERS_KEY = 'finance-household-members';
const CHILDREN_KEY = 'finance-household-children';
const ACCOUNT_SHARINGS_KEY = 'finance-account-sharings';

interface FakeMember {
  id: string;
  householdId: string;
  displayName: string;
  syncVersion: number;
  isSynced: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function makeMember(overrides: Partial<FakeMember> = {}): FakeMember {
  return {
    id: 'mem-1',
    householdId: 'hh-1',
    displayName: 'Jordan',
    syncVersion: 0,
    isSynced: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('householdData repository', () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) {
      delete tables[key];
    }
    vi.clearAllMocks();
  });

  it('returns the fallback when nothing is persisted', async () => {
    expect(await readHouseholdValue<FakeMember[]>(db, MEMBERS_KEY, [])).toEqual([]);
    expect(
      await readHouseholdValue<FakeMember | null>(db, HOUSEHOLD_SINGLETON_KEY, null),
    ).toBeNull();
  });

  it('round-trips a collection faithfully, preserving order', async () => {
    const members = [
      makeMember({ id: 'mem-1', displayName: 'Jordan' }),
      makeMember({ id: 'mem-2', displayName: 'Riley' }),
    ];

    await writeHouseholdValue(db, MEMBERS_KEY, members);

    expect(await readHouseholdValue<FakeMember[]>(db, MEMBERS_KEY, [])).toEqual(members);
  });

  it('round-trips deeply nested entities without loss', async () => {
    const children = [
      {
        id: 'child-1',
        householdId: 'hh-1',
        name: 'Maya',
        balance: 1400,
        chores: [
          { id: 'chore-1', name: 'Dishes', value: 200, completedThisWeek: true },
          { id: 'chore-2', name: 'Trash', value: 300, completedThisWeek: false },
        ],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deletedAt: null,
        syncVersion: 2,
        isSynced: true,
      },
    ];

    await writeHouseholdValue(db, CHILDREN_KEY, children);

    expect(await readHouseholdValue(db, CHILDREN_KEY, [])).toEqual(children);
  });

  it('persists and reads back the household singleton object', async () => {
    const household = {
      id: 'hh-1',
      name: 'Smith Family',
      ownerId: 'user-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: true,
    };

    await writeHouseholdValue(db, HOUSEHOLD_SINGLETON_KEY, household);

    expect(await readHouseholdValue(db, HOUSEHOLD_SINGLETON_KEY, null)).toEqual(household);
  });

  it('fully replaces prior contents on each write (delete-then-insert)', async () => {
    await writeHouseholdValue(db, MEMBERS_KEY, [
      makeMember({ id: 'mem-1' }),
      makeMember({ id: 'mem-2' }),
    ]);
    await writeHouseholdValue(db, MEMBERS_KEY, [makeMember({ id: 'mem-3', displayName: 'Sam' })]);

    const stored = await readHouseholdValue<FakeMember[]>(db, MEMBERS_KEY, []);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe('mem-3');
  });

  it('preserves soft-deleted tombstones in the persisted array', async () => {
    const members = [
      makeMember({ id: 'mem-1' }),
      makeMember({ id: 'mem-2', deletedAt: '2025-02-01T00:00:00Z' }),
    ];

    await writeHouseholdValue(db, MEMBERS_KEY, members);

    const stored = await readHouseholdValue<FakeMember[]>(db, MEMBERS_KEY, []);
    expect(stored).toHaveLength(2);
    expect(stored[1]?.deletedAt).toBe('2025-02-01T00:00:00Z');
  });

  it('promotes sync and query columns from each entity', async () => {
    await writeHouseholdValue(db, ACCOUNT_SHARINGS_KEY, [
      {
        id: 'as-1',
        householdId: 'hh-1',
        accountId: 'acct-1',
        ownerId: 'user-1',
        sharingMode: 'SHARED',
        syncVersion: 3,
        isSynced: true,
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-03T00:00:00Z',
        deletedAt: null,
      },
    ]);

    const row = tables['hh_account_sharing']?.[0];
    expect(row).toMatchObject({
      id: 'as-1',
      household_id: 'hh-1',
      sync_version: 3,
      is_synced: 1,
      deleted_at: null,
      created_at: '2025-01-02T00:00:00Z',
      updated_at: '2025-01-03T00:00:00Z',
    });
    expect(JSON.parse(String(row?.data))).toMatchObject({ id: 'as-1', sharingMode: 'SHARED' });
  });

  it('throws for an unknown storage key', async () => {
    await expect(readHouseholdValue(db, 'finance-not-a-household-key', [])).rejects.toThrow(
      /Unknown household storage key/,
    );
    await expect(writeHouseholdValue(db, 'finance-not-a-household-key', [])).rejects.toThrow(
      /Unknown household storage key/,
    );
  });

  it('orders reads by a PowerSync-view-safe column, never rowid', async () => {
    // In live mode the backing store is PowerSync, which exposes every table as
    // a SQLite *view* (no `rowid`). `ORDER BY rowid` therefore throws
    // `no such column: rowid`, breaking every household read and dead-ending
    // "Connect a bank" with the false "create a household first" wall. This
    // guards the ordering because the mocked async-db ignores SQL semantics and
    // cannot catch a view-incompatible clause behaviourally.
    await writeHouseholdValue(db, MEMBERS_KEY, [makeMember()]);
    await readHouseholdValue<FakeMember[]>(db, MEMBERS_KEY, []);
    await readHouseholdValue<FakeMember | null>(db, HOUSEHOLD_SINGLETON_KEY, null);

    const selects = [...vi.mocked(query).mock.calls, ...vi.mocked(queryOne).mock.calls].map(
      ([, sql]) => String(sql),
    );

    expect(selects.length).toBeGreaterThan(0);
    for (const sql of selects) {
      expect(sql).not.toMatch(/rowid/i);
      expect(sql).toMatch(/order by created_at/i);
    }
  });
});
