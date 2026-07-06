// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  DEBT_TRACKER_STORAGE_KEY,
  readDebtTracker,
  writeDebtTracker,
} from './debt-tracker-persistence';
import type { Debt } from '../debt-types';

const debt: Debt = {
  id: 'manual-1',
  name: 'Marcus Visa',
  balanceCents: 150_000,
  originalBalanceCents: 200_000,
  annualRateBps: 1999,
  minimumPaymentCents: 4_500,
  type: 'credit_card',
  rateEstimated: false,
  minimumEstimated: false,
};

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    store,
  };
}

describe('debt tracker persistence', () => {
  it('round-trips manual debts and adjustments through storage (#3357)', () => {
    const storage = memoryStorage();
    writeDebtTracker(storage, {
      manualDebts: [debt],
      debtAdjustments: { 'acct-1': { annualRateBps: 650, rateEstimated: false } },
    });

    expect(storage.store.has(DEBT_TRACKER_STORAGE_KEY)).toBe(true);
    const restored = readDebtTracker(storage);
    expect(restored.manualDebts).toEqual([debt]);
    expect(restored.debtAdjustments).toEqual({
      'acct-1': { annualRateBps: 650, rateEstimated: false },
    });
  });

  it('returns empty state for missing, corrupt, or wrong-version data', () => {
    const storage = memoryStorage();
    expect(readDebtTracker(storage)).toEqual({ manualDebts: [], debtAdjustments: {} });

    storage.setItem(DEBT_TRACKER_STORAGE_KEY, '{not json');
    expect(readDebtTracker(storage)).toEqual({ manualDebts: [], debtAdjustments: {} });

    storage.setItem(DEBT_TRACKER_STORAGE_KEY, JSON.stringify({ version: 2, manualDebts: [debt] }));
    expect(readDebtTracker(storage)).toEqual({ manualDebts: [], debtAdjustments: {} });
  });

  it('drops malformed debts and unknown adjustment values', () => {
    const storage = memoryStorage();
    storage.setItem(
      DEBT_TRACKER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        manualDebts: [debt, { id: 'bad', name: 'No amounts' }],
        debtAdjustments: {
          'acct-1': { annualRateBps: 650, bogusField: 'x', minimumEstimated: true },
          'acct-2': 'not-an-object',
        },
      }),
    );

    const restored = readDebtTracker(storage);
    expect(restored.manualDebts).toEqual([debt]);
    expect(restored.debtAdjustments['acct-1']).toEqual({
      annualRateBps: 650,
      minimumEstimated: true,
    });
    expect(restored.debtAdjustments['acct-2']).toBeUndefined();
  });
});
