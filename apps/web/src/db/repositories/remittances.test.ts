// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the remittance persistence repository (issue #3273).
 *
 * Mocks `../async-db` (and the household helper) and asserts the SQL /
 * parameters, the row → {@link RemittanceRecord} mapping (nested recipient,
 * nullable reference rate), soft-delete, and the one-time localStorage →
 * database migration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row, AsyncDb } from '../async-db';

vi.mock('../async-db', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock('./household', () => ({
  getPrimaryHouseholdId: vi.fn(),
}));

import { execute, query, queryOne } from '../async-db';
import { getPrimaryHouseholdId } from './household';
import {
  deleteRemittanceRecord,
  getAllRemittances,
  importLegacyRemittances,
  insertRemittance,
} from './remittances';
import type { RemittanceRecord } from '../../lib/remittance';

const mockExecute = vi.mocked(execute);
const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockGetPrimaryHouseholdId = vi.mocked(getPrimaryHouseholdId);

const mockDb = {} as AsyncDb;

function remittanceRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'rem-1',
    household_id: 'hh-1',
    date: '2026-06-01',
    source_currency: 'USD',
    dest_currency: 'INR',
    send_amount_minor: 50000,
    fee_minor: 500,
    fx_rate: 83.25,
    fee_model: 'ADDITIVE',
    reference_rate: 83.5,
    recipient_name: 'Priya Supplier',
    recipient_country: 'IN',
    note: 'June fabric order',
    created_at: '2026-06-01T09:00:00.000Z',
    updated_at: '2026-06-01T09:00:00.000Z',
    deleted_at: null,
    recurrence_frequency: null,
    recurrence_next_date: null,
    ...overrides,
  };
}

function baseRemittance(overrides: Partial<RemittanceRecord> = {}): RemittanceRecord {
  return {
    id: 'rem-1',
    date: '2026-06-01',
    sourceCurrency: 'USD',
    destCurrency: 'INR',
    sendAmountMinor: 50000,
    feeMinor: 500,
    fxRate: 83.25,
    feeModel: 'ADDITIVE',
    referenceRate: 83.5,
    recipient: { name: 'Priya Supplier', country: 'IN' },
    note: 'June fabric order',
    createdAt: '2026-06-01T09:00:00.000Z',
    recurrence: null,
    ...overrides,
  };
}

/** Wire the mocked primitives to an in-memory table keyed by id. */
function useInMemoryRemittanceTable(seed: Row[] = []): Map<string, Row> {
  const table = new Map<string, Row>(seed.map((row) => [String(row.id), row]));

  mockExecute.mockImplementation(async (_db, sql, params) => {
    const text = String(sql);
    if (text.includes('INSERT INTO remittances')) {
      const id = String((params as unknown[])?.[0]);
      table.set(id, remittanceRow({ id }));
    }
  });

  mockQueryOne.mockImplementation(async (_db, _sql, params) => {
    const id = String((params as unknown[])?.[0]);
    return table.get(id) ?? null;
  });

  mockQuery.mockImplementation(async () => ({ columns: [], rows: [...table.values()] }));

  return table;
}

describe('remittances repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrimaryHouseholdId.mockResolvedValue('hh-1');
    globalThis.localStorage?.clear();
  });

  it('maps a row to the RemittanceRecord domain shape with a nested recipient', async () => {
    mockQuery.mockResolvedValue({ columns: [], rows: [remittanceRow()] });

    const [record] = await getAllRemittances(mockDb);

    expect(record).toEqual({
      id: 'rem-1',
      date: '2026-06-01',
      sourceCurrency: 'USD',
      destCurrency: 'INR',
      sendAmountMinor: 50000,
      feeMinor: 500,
      fxRate: 83.25,
      feeModel: 'ADDITIVE',
      referenceRate: 83.5,
      recipient: { name: 'Priya Supplier', country: 'IN' },
      note: 'June fabric order',
      createdAt: '2026-06-01T09:00:00.000Z',
      recurrence: null,
    });
  });

  it('maps a null reference rate and note back to null', async () => {
    mockQuery.mockResolvedValue({
      columns: [],
      rows: [remittanceRow({ reference_rate: null, note: null })],
    });

    const [record] = await getAllRemittances(mockDb);

    expect(record.referenceRate).toBeNull();
    expect(record.note).toBeNull();
  });

  it('inserts a remittance with the resolved household and split recipient columns', async () => {
    useInMemoryRemittanceTable();

    const created = await insertRemittance(mockDb, baseRemittance());

    expect(mockGetPrimaryHouseholdId).toHaveBeenCalledWith(mockDb);
    const [, sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO remittances');
    // owner_id (NOT NULL) is backfilled from the current user, not a bound param,
    // so the parameter list stays unchanged.
    expect(String(sql)).toContain('(SELECT id FROM users LIMIT 1)');
    expect(params).toEqual([
      'rem-1',
      'hh-1',
      '2026-06-01',
      'USD',
      'INR',
      50000,
      500,
      83.25,
      'ADDITIVE',
      83.5,
      'Priya Supplier',
      'IN',
      'June fabric order',
      null,
      null,
      '2026-06-01T09:00:00.000Z',
      '2026-06-01T09:00:00.000Z',
    ]);
    expect(created.id).toBe('rem-1');
  });

  it('stores a null household when no household exists yet', async () => {
    mockGetPrimaryHouseholdId.mockResolvedValue(null);
    useInMemoryRemittanceTable();

    await insertRemittance(mockDb, baseRemittance());

    expect(mockExecute.mock.calls[0][2]?.[1]).toBeNull();
  });

  it('soft-deletes a remittance by marking deleted_at', async () => {
    useInMemoryRemittanceTable([remittanceRow()]);

    expect(await deleteRemittanceRecord(mockDb, 'rem-1')).toBe(true);
    const updateCall = mockExecute.mock.calls.find(([, sql]) =>
      String(sql).includes('UPDATE remittances'),
    );
    expect(updateCall?.[1]).toContain('deleted_at =');
  });

  it('returns false when deleting a remittance that does not exist', async () => {
    mockQueryOne.mockResolvedValue(null);

    expect(await deleteRemittanceRecord(mockDb, 'missing')).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('imports legacy localStorage remittances into the database and clears the key', async () => {
    globalThis.localStorage.setItem(
      'finance-remittances',
      JSON.stringify([
        baseRemittance({ id: 'legacy-1' }),
        baseRemittance({ id: 'legacy-2', recipient: { name: 'Vendor Two', country: 'IN' } }),
      ]),
    );
    useInMemoryRemittanceTable();

    const imported = await importLegacyRemittances(mockDb);

    expect(imported).toBe(2);
    expect(globalThis.localStorage.getItem('finance-remittances')).toBeNull();
    const insertCalls = mockExecute.mock.calls.filter(([, sql]) =>
      String(sql).includes('INSERT INTO remittances'),
    );
    expect(insertCalls).toHaveLength(2);
  });

  it('skips legacy records whose id already exists (idempotent re-import)', async () => {
    globalThis.localStorage.setItem(
      'finance-remittances',
      JSON.stringify([baseRemittance({ id: 'existing' })]),
    );
    useInMemoryRemittanceTable([remittanceRow({ id: 'existing' })]);

    expect(await importLegacyRemittances(mockDb)).toBe(0);
    const insertCalls = mockExecute.mock.calls.filter(([, sql]) =>
      String(sql).includes('INSERT INTO remittances'),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 0 and writes nothing when there is no legacy data', async () => {
    useInMemoryRemittanceTable();

    expect(await importLegacyRemittances(mockDb)).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
