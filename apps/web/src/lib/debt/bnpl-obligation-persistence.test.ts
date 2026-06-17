// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  BNPL_OBLIGATION_STORAGE_KEY,
  markBnplInstallmentPaidById,
  readBnplObligations,
  splitPersistedBnplLifecycle,
  writeBnplObligations,
} from './bnpl-obligation-persistence';
import type { BnplObligation } from '../debt-types';

const obligation: BnplObligation = {
  id: 'bnpl-a',
  merchantName: 'Store',
  originalAmountCents: 200_00,
  remainingBalanceCents: 100_00,
  totalInstallments: 2,
  paidInstallments: 1,
  installmentAmountCents: 100_00,
  annualRateBps: 0,
  totalFeesCents: 0,
  upcomingDueDates: ['2025-02-01'],
};

describe('BNPL obligation persistence', () => {
  it('round-trips obligations through local storage shape', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };

    writeBnplObligations(storage, [obligation]);

    expect(store.has(BNPL_OBLIGATION_STORAGE_KEY)).toBe(true);
    expect(readBnplObligations(storage)).toEqual([obligation]);
  });

  it('marks installments paid and keeps completed obligations out of active exposure', () => {
    const [completed] = markBnplInstallmentPaidById([obligation], 'bnpl-a');
    const lifecycle = splitPersistedBnplLifecycle([completed], 5_000_00);

    expect(completed.remainingBalanceCents).toBe(0);
    expect(lifecycle.active).toEqual([]);
    expect(lifecycle.completed.map((item) => item.id)).toEqual(['bnpl-a']);
  });
});
