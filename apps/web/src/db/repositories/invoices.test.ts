// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the invoice persistence repository (issue #3273).
 *
 * The repository is a thin layer over the SQLite-WASM primitives, so these
 * tests mock `../sqlite-wasm` (and the household helper) and assert the SQL /
 * parameters, the row → {@link Invoice} mapping (including the #3266 payment
 * link), soft-delete, and the one-time localStorage → database migration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row, SqliteDb } from '../sqlite-wasm';

vi.mock('../sqlite-wasm', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock('./household', () => ({
  getPrimaryHouseholdId: vi.fn(),
}));

import { execute, query, queryOne } from '../sqlite-wasm';
import { getPrimaryHouseholdId } from './household';
import {
  deleteInvoiceRecord,
  getAllInvoices,
  importLegacyInvoices,
  insertInvoice,
  updateInvoiceRecord,
} from './invoices';
import type { Invoice } from '../../lib/analytics/invoices';

const mockExecute = vi.mocked(execute);
const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockGetPrimaryHouseholdId = vi.mocked(getPrimaryHouseholdId);

const mockDb = {} as SqliteDb;

function invoiceRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'inv-1',
    household_id: 'hh-1',
    client_name: 'Studio Delacroix',
    amount_cents: 120000,
    issue_date: '2026-01-01',
    payment_term: 'net-30',
    status: 'Sent',
    expected_pay_date: '2026-01-31',
    last_contacted_date: null,
    amount_paid_cents: 0,
    paid_date: null,
    payment_account_id: null,
    payment_transaction_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    sync_version: 1,
    is_synced: 0,
    ...overrides,
  };
}

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    clientName: 'Studio Delacroix',
    amountCents: 120000,
    issueDate: '2026-01-01',
    paymentTerm: 'net-30',
    status: 'Sent',
    expectedPayDate: '2026-01-31',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Wire the mocked primitives to an in-memory table keyed by id so inserts are
 * observable by the follow-up read (`getInvoiceById`) the repository performs.
 */
function useInMemoryInvoiceTable(seed: Row[] = []): Map<string, Row> {
  const table = new Map<string, Row>(seed.map((row) => [String(row.id), row]));

  mockExecute.mockImplementation((_db, sql, params) => {
    const text = String(sql);
    if (text.includes('INSERT INTO invoice')) {
      const id = String((params as unknown[])?.[0]);
      table.set(id, invoiceRow({ id, household_id: (params as unknown[])?.[1] as Row[string] }));
    }
    return { rowsAffected: 1 };
  });

  mockQueryOne.mockImplementation((_db, _sql, params) => {
    const id = String((params as unknown[])?.[0]);
    return table.get(id) ?? null;
  });

  mockQuery.mockImplementation(() => ({ columns: [], rows: [...table.values()] }));

  return table;
}

describe('invoices repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrimaryHouseholdId.mockReturnValue('hh-1');
    globalThis.localStorage?.clear();
  });

  it('maps a full row to the Invoice domain shape, including the #3266 payment link', () => {
    mockQuery.mockReturnValue({
      columns: [],
      rows: [
        invoiceRow({
          last_contacted_date: '2026-02-05',
          amount_paid_cents: 120000,
          paid_date: '2026-02-10',
          status: 'Paid',
          payment_account_id: 'acc-9',
          payment_transaction_id: 'txn-9',
        }),
      ],
    });

    const [invoice] = getAllInvoices(mockDb);

    expect(invoice).toEqual({
      id: 'inv-1',
      clientName: 'Studio Delacroix',
      amountCents: 120000,
      issueDate: '2026-01-01',
      paymentTerm: 'net-30',
      status: 'Paid',
      expectedPayDate: '2026-01-31',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastContactedDate: '2026-02-05',
      amountPaidCents: 120000,
      paidDate: '2026-02-10',
      paymentAccountId: 'acc-9',
      paymentTransactionId: 'txn-9',
    });
  });

  it('omits optional fields when unset so the mapped shape matches the domain factory', () => {
    mockQuery.mockReturnValue({ columns: [], rows: [invoiceRow()] });

    const [invoice] = getAllInvoices(mockDb);

    expect(invoice).not.toHaveProperty('lastContactedDate');
    expect(invoice).not.toHaveProperty('amountPaidCents');
    expect(invoice).not.toHaveProperty('paidDate');
    expect(invoice).not.toHaveProperty('paymentAccountId');
    expect(invoice).not.toHaveProperty('paymentTransactionId');
  });

  it('inserts an invoice with the resolved household and the domain timestamps', () => {
    useInMemoryInvoiceTable();

    const created = insertInvoice(mockDb, baseInvoice());

    expect(mockGetPrimaryHouseholdId).toHaveBeenCalledWith(mockDb);
    const [, sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO invoice');
    expect(params).toEqual([
      'inv-1',
      'hh-1',
      'Studio Delacroix',
      120000,
      '2026-01-01',
      'net-30',
      'Sent',
      '2026-01-31',
      null,
      0,
      null,
      null,
      null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
    expect(created.id).toBe('inv-1');
  });

  it('stores a null household when no household exists yet (clean-slate workspace)', () => {
    mockGetPrimaryHouseholdId.mockReturnValue(null);
    useInMemoryInvoiceTable();

    insertInvoice(mockDb, baseInvoice());

    expect(mockExecute.mock.calls[0][2]?.[1]).toBeNull();
  });

  it('persists the #3266 payment link columns when present', () => {
    useInMemoryInvoiceTable();

    insertInvoice(
      mockDb,
      baseInvoice({
        status: 'Paid',
        amountPaidCents: 120000,
        paidDate: '2026-02-10',
        paymentAccountId: 'acc-9',
        paymentTransactionId: 'txn-9',
      }),
    );

    const params = mockExecute.mock.calls[0][2] as unknown[];
    expect(params[9]).toBe(120000); // amount_paid_cents
    expect(params[10]).toBe('2026-02-10'); // paid_date
    expect(params[11]).toBe('acc-9'); // payment_account_id
    expect(params[12]).toBe('txn-9'); // payment_transaction_id
  });

  it('returns null when updating an invoice that does not exist', () => {
    mockQueryOne.mockReturnValue(null);

    expect(updateInvoiceRecord(mockDb, baseInvoice())).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('soft-deletes an invoice by marking deleted_at', () => {
    useInMemoryInvoiceTable([invoiceRow()]);

    expect(deleteInvoiceRecord(mockDb, 'inv-1')).toBe(true);
    const updateCall = mockExecute.mock.calls.find(([, sql]) =>
      String(sql).includes('UPDATE invoice'),
    );
    expect(updateCall?.[1]).toContain('deleted_at =');
  });

  it('returns false when deleting an invoice that does not exist', () => {
    mockQueryOne.mockReturnValue(null);

    expect(deleteInvoiceRecord(mockDb, 'missing')).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('imports legacy localStorage invoices into the database and clears the key', () => {
    globalThis.localStorage.setItem(
      'finance:invoices',
      JSON.stringify([
        baseInvoice({ id: 'legacy-1' }),
        baseInvoice({ id: 'legacy-2', clientName: 'Atelier Rousseau' }),
      ]),
    );
    useInMemoryInvoiceTable();

    const imported = importLegacyInvoices(mockDb);

    expect(imported).toBe(2);
    expect(globalThis.localStorage.getItem('finance:invoices')).toBeNull();
    const insertCalls = mockExecute.mock.calls.filter(([, sql]) =>
      String(sql).includes('INSERT INTO invoice'),
    );
    expect(insertCalls).toHaveLength(2);
  });

  it('skips legacy records whose id already exists (idempotent re-import)', () => {
    globalThis.localStorage.setItem(
      'finance:invoices',
      JSON.stringify([baseInvoice({ id: 'existing' })]),
    );
    useInMemoryInvoiceTable([invoiceRow({ id: 'existing' })]);

    expect(importLegacyInvoices(mockDb)).toBe(0);
    const insertCalls = mockExecute.mock.calls.filter(([, sql]) =>
      String(sql).includes('INSERT INTO invoice'),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 0 and writes nothing when there is no legacy data', () => {
    useInMemoryInvoiceTable();

    expect(importLegacyInvoices(mockDb)).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
