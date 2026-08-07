// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for {@link ensureDefaultHousehold} — the fresh-start auto-provision that
 * removes the "create a household before connecting a bank" wall (PR3).
 *
 * `../async-db` and `./householdData` are mocked so the test asserts the
 * orchestration (read → write local docs → mirror synced rows) without a real
 * SQLite backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AsyncDb } from '../async-db';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  readHouseholdValue: vi.fn(),
  writeHouseholdValue: vi.fn(),
}));

vi.mock('../async-db', () => ({
  execute: mocks.execute,
  query: mocks.query,
  queryOne: mocks.queryOne,
}));

vi.mock('./householdData', () => ({
  HOUSEHOLD_SINGLETON_KEY: 'finance-household',
  HOUSEHOLD_MEMBERS_KEY: 'finance-household-members',
  readHouseholdValue: mocks.readHouseholdValue,
  writeHouseholdValue: mocks.writeHouseholdValue,
}));

import { ensureDefaultHousehold } from './household';

const db = { __fakeDb: true } as unknown as AsyncDb;

function membersWriteCall() {
  return mocks.writeHouseholdValue.mock.calls.find((c) => c[1] === 'finance-household-members');
}

describe('ensureDefaultHousehold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readHouseholdValue.mockResolvedValue(null);
    mocks.writeHouseholdValue.mockResolvedValue(undefined);
    // No pre-existing synced household / member rows.
    mocks.queryOne.mockResolvedValue(null);
    mocks.execute.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null and writes nothing without an authenticated user id', async () => {
    const id = await ensureDefaultHousehold(db, { id: '   ' });

    expect(id).toBeNull();
    expect(mocks.readHouseholdValue).not.toHaveBeenCalled();
    expect(mocks.writeHouseholdValue).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('returns the existing household id untouched (idempotent)', async () => {
    mocks.readHouseholdValue.mockResolvedValue({ id: 'existing-hh' });

    const id = await ensureDefaultHousehold(db, { id: 'user-1' });

    expect(id).toBe('existing-hh');
    expect(mocks.writeHouseholdValue).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('provisions a default household + owner member and mirrors the synced rows', async () => {
    const id = await ensureDefaultHousehold(db, { id: 'user-1', name: 'Alex Rivera' });

    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36); // uuid v4

    // Local doc store: household is written BEFORE members so the members write
    // can resolve the owning household id for its promoted column.
    expect(mocks.writeHouseholdValue).toHaveBeenNthCalledWith(
      1,
      db,
      'finance-household',
      expect.objectContaining({ id, name: 'My Household', ownerId: 'user-1', isSynced: false }),
    );
    const membersCall = membersWriteCall();
    expect(membersCall?.[2]).toEqual([
      expect.objectContaining({
        householdId: id,
        userId: 'user-1',
        role: 'OWNER',
        displayName: 'Alex Rivera',
      }),
    ]);

    // Synced mirror: inserts households + household_members for this owner.
    const sqls = mocks.execute.mock.calls.map((c) => String(c[1]));
    expect(sqls.some((sql) => /INSERT INTO households/.test(sql))).toBe(true);
    expect(sqls.some((sql) => /INSERT INTO household_members/.test(sql))).toBe(true);
    const householdsInsert = mocks.execute.mock.calls.find((c) =>
      /INSERT INTO households/.test(String(c[1])),
    );
    expect(householdsInsert?.[2]).toEqual([id, 'My Household', 'user-1']);
  });

  it('falls back to the email as the owner label when no name is present', async () => {
    await ensureDefaultHousehold(db, { id: 'user-1', email: 'alex@example.com' });

    expect(membersWriteCall()?.[2]).toEqual([
      expect.objectContaining({ displayName: 'alex@example.com' }),
    ]);
  });
});
