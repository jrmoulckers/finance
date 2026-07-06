// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the useInvoices hook (issues #2169, #3273).
 *
 * The hook now reads and writes through the database-backed invoices repository
 * instead of localStorage. These tests mock the DatabaseProvider and the
 * repository (a stateful in-memory store) so they can prove the durable
 * behaviour that #3273 requires: records survive a simulated cache clear, the
 * one-time legacy migration runs on mount, the #3266 payment link round-trips,
 * and nothing is ever written to `localStorage`.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInvoices } from '../useInvoices';
import type { CreateInvoiceInput, Invoice } from '../../lib/analytics/invoices';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

/** Durable in-memory store standing in for the SQLite-backed repository. */
const store = new Map<string, Invoice>();
const importLegacyInvoices = vi.fn<() => number>(() => 0);

vi.mock('../../db/repositories/invoices', () => ({
  getAllInvoices: () =>
    [...store.values()].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    ),
  getInvoiceById: (_db: unknown, id: string) => store.get(id) ?? null,
  insertInvoice: (_db: unknown, invoice: Invoice) => {
    store.set(invoice.id, invoice);
    return invoice;
  },
  updateInvoiceRecord: (_db: unknown, invoice: Invoice) => {
    if (!store.has(invoice.id)) return null;
    store.set(invoice.id, invoice);
    return invoice;
  },
  deleteInvoiceRecord: (_db: unknown, id: string) => store.delete(id),
  importLegacyInvoices: () => importLegacyInvoices(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function input(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    clientName: 'Studio Delacroix',
    amountCents: 120000,
    issueDate: '2026-01-01',
    paymentTerm: 'net-30',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    importLegacyInvoices.mockReturnValue(0);
    localStorage.clear();
  });

  it('starts empty and runs the one-time legacy migration on mount', () => {
    const { result } = renderHook(() => useInvoices());

    expect(result.current.invoices).toEqual([]);
    expect(importLegacyInvoices).toHaveBeenCalledTimes(1);
  });

  it('adds an invoice through the repository and returns it', () => {
    const { result } = renderHook(() => useInvoices());

    let created: Invoice | undefined;
    act(() => {
      created = result.current.addInvoice(input());
    });

    expect(created?.clientName).toBe('Studio Delacroix');
    expect(result.current.invoices).toHaveLength(1);
    expect(result.current.invoices[0]?.id).toBe(created?.id);
  });

  it('never writes invoices to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useInvoices());

    act(() => {
      result.current.addInvoice(input());
    });

    expect(localStorage.getItem('finance:invoices')).toBeNull();
    expect(setItem).not.toHaveBeenCalledWith('finance:invoices', expect.anything());
    setItem.mockRestore();
  });

  it('persists across a simulated cache clear (data lives in the database)', () => {
    const first = renderHook(() => useInvoices());
    let created: Invoice | undefined;
    act(() => {
      created = first.result.current.addInvoice(input());
    });
    first.unmount();

    // Simulate the user clearing browser storage — the durable copy is in the
    // repository/database, not localStorage, so it must still be readable.
    localStorage.clear();

    const second = renderHook(() => useInvoices());
    expect(second.result.current.invoices).toHaveLength(1);
    expect(second.result.current.invoices[0]?.id).toBe(created?.id);
  });

  it('records a payment and preserves the #3266 cash-inflow link', () => {
    const { result } = renderHook(() => useInvoices());
    let created: Invoice | undefined;
    act(() => {
      created = result.current.addInvoice(input({ amountCents: 10000 }));
    });

    act(() => {
      result.current.recordPayment(created!.id, 10000, '2026-02-01', {
        accountId: 'acc-1',
        transactionId: 'txn-1',
      });
    });

    const paid = result.current.invoices.find((invoice) => invoice.id === created?.id);
    expect(paid?.status).toBe('Paid');
    expect(paid?.paymentAccountId).toBe('acc-1');
    expect(paid?.paymentTransactionId).toBe('txn-1');
    expect(paid?.amountPaidCents).toBe(10000);
  });

  it('updates an invoice status through the repository', () => {
    const { result } = renderHook(() => useInvoices());
    let created: Invoice | undefined;
    act(() => {
      created = result.current.addInvoice(input());
    });

    act(() => {
      result.current.updateInvoiceStatus(created!.id, 'Draft');
    });

    expect(result.current.invoices[0]?.status).toBe('Draft');
  });

  it('deletes an invoice through the repository', () => {
    const { result } = renderHook(() => useInvoices());
    let created: Invoice | undefined;
    act(() => {
      created = result.current.addInvoice(input());
    });
    expect(result.current.invoices).toHaveLength(1);

    act(() => {
      result.current.deleteInvoice(created!.id);
    });

    expect(result.current.invoices).toHaveLength(0);
  });
});
