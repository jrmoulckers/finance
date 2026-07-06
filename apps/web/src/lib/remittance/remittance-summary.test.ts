// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for remittance summary aggregation (issue #2170).
 */

import { describe, it, expect } from 'vitest';

import { summarizeRemittances, summarizeByRecipient } from './remittance-summary';
import type { RemittanceRecord } from './remittance-types';

function record(overrides: Partial<RemittanceRecord> = {}): RemittanceRecord {
  return {
    id: 'r1',
    date: '2026-06-01',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    sendAmountMinor: 50_000,
    feeMinor: 500,
    fxRate: 17.0,
    feeModel: 'ADDITIVE',
    referenceRate: 17.5,
    recipient: { name: 'Familia', country: 'MX' },
    note: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('summarizeRemittances', () => {
  it('returns empty groupings for no records', () => {
    const s = summarizeRemittances([]);
    expect(s.count).toBe(0);
    expect(s.sentByCurrency).toEqual({});
    expect(s.feesByCurrency).toEqual({});
    expect(s.receivedByCurrency).toEqual({});
    expect(s.totalCostByCurrency).toEqual({});
    expect(s.destinationCountries).toEqual([]);
  });

  it('sums sent (total paid), fees, received, and cost per currency', () => {
    const s = summarizeRemittances([record({ id: 'a' }), record({ id: 'b' })]);
    expect(s.count).toBe(2);
    // total paid = send + fee = 50500 each (additive)
    expect(s.sentByCurrency).toEqual({ USD: 101_000 });
    expect(s.feesByCurrency).toEqual({ USD: 1_000 });
    expect(s.receivedByCurrency).toEqual({ MXN: 1_700_000 }); // 850000 * 2
    expect(s.totalCostByCurrency).toEqual({ USD: 3_858 }); // 1929 * 2
  });

  it('groups distinct source and destination currencies separately', () => {
    const s = summarizeRemittances([
      record({ id: 'a' }),
      record({
        id: 'b',
        sourceCurrency: 'EUR',
        destCurrency: 'BRL',
        fxRate: 5.0,
        referenceRate: 5.1,
        recipient: { name: 'Amigo', country: 'BR' },
      }),
    ]);
    expect(Object.keys(s.sentByCurrency).sort()).toEqual(['EUR', 'USD']);
    expect(Object.keys(s.receivedByCurrency).sort()).toEqual(['BRL', 'MXN']);
    expect(s.destinationCountries).toEqual(['MX', 'BR']);
  });

  it('falls back to the explicit fee when a record has no reference rate', () => {
    const s = summarizeRemittances([record({ referenceRate: null })]);
    expect(s.totalCostByCurrency).toEqual({ USD: 500 }); // just the fee
  });

  it('dedupes destination countries in first-seen order', () => {
    const s = summarizeRemittances([
      record({ id: 'a', recipient: { name: 'A', country: 'MX' } }),
      record({ id: 'b', recipient: { name: 'B', country: 'MX' } }),
      record({ id: 'c', recipient: { name: 'C', country: 'GT' } }),
    ]);
    expect(s.destinationCountries).toEqual(['MX', 'GT']);
  });
});

describe('summarizeByRecipient', () => {
  it('returns an empty list for no records', () => {
    expect(summarizeByRecipient([])).toEqual([]);
  });

  it('groups per supplier and sorts by transfer count (desc)', () => {
    const out = summarizeByRecipient([
      record({ id: 'a', recipient: { name: 'Supplier A', country: 'MX' } }),
      record({ id: 'b', recipient: { name: 'Supplier A', country: 'MX' } }),
      record({ id: 'c', recipient: { name: 'Supplier B', country: 'GT' } }),
    ]);

    expect(out.map((r) => r.name)).toEqual(['Supplier A', 'Supplier B']);
    expect(out[0].count).toBe(2);
    expect(out[0].country).toBe('MX');
    // total paid = (send + fee) per record, additive: 50500 * 2
    expect(out[0].sentByCurrency).toEqual({ USD: 101_000 });
    expect(out[0].receivedByCurrency).toEqual({ MXN: 1_700_000 });
    expect(out[0].totalCostByCurrency).toEqual({ USD: 3_858 });
    expect(out[1].count).toBe(1);
  });

  it('breaks count ties by most recent date, then name', () => {
    const out = summarizeByRecipient([
      record({ id: 'a', date: '2026-05-01', recipient: { name: 'Older', country: 'MX' } }),
      record({ id: 'b', date: '2026-06-15', recipient: { name: 'Newer', country: 'MX' } }),
    ]);

    expect(out.map((r) => r.name)).toEqual(['Newer', 'Older']);
    expect(out[0].lastDate).toBe('2026-06-15');
  });

  it('keeps a supplier paid in multiple corridors grouped per currency', () => {
    const out = summarizeByRecipient([
      record({ id: 'a', recipient: { name: 'Multi', country: 'MX' } }),
      record({
        id: 'b',
        sourceCurrency: 'EUR',
        destCurrency: 'INR',
        fxRate: 90,
        referenceRate: 91,
        recipient: { name: 'Multi', country: 'MX' },
      }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(Object.keys(out[0].sentByCurrency).sort()).toEqual(['EUR', 'USD']);
    expect(Object.keys(out[0].receivedByCurrency).sort()).toEqual(['INR', 'MXN']);
  });
});
