// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  CONSOLIDATION_SCENARIO_STORAGE_KEY,
  readConsolidationScenario,
  restoreConsolidationScenario,
  writeConsolidationScenario,
} from './consolidation-scenario-persistence';
import type { Debt } from '../debt-types';

const debts: Debt[] = [
  {
    id: 'active',
    name: 'Active',
    balanceCents: 100_00,
    annualRateBps: 1000,
    minimumPaymentCents: 25_00,
    type: 'credit_card',
  },
  {
    id: 'paid',
    name: 'Paid',
    balanceCents: 0,
    annualRateBps: 1000,
    minimumPaymentCents: 0,
    type: 'personal_loan',
  },
];

describe('consolidation scenario persistence', () => {
  it('restores saved scenarios while ignoring deleted or paid-off debts', () => {
    const restored = restoreConsolidationScenario(
      {
        version: 1,
        selectedDebtIds: ['active', 'paid', 'deleted'],
        annualRateBps: 900,
        termMonths: 36,
        originationFeeCents: 50_00,
        feeTreatment: 'paid_upfront',
      },
      debts,
    );

    expect(restored.selectedDebtIds).toEqual(['active']);
    expect(restored.ignoredDebtIds).toEqual(['paid', 'deleted']);
  });

  it('round-trips scenarios through offline storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };

    writeConsolidationScenario(storage, {
      version: 1,
      selectedDebtIds: ['active'],
      annualRateBps: 799,
      termMonths: 48,
      originationFeeCents: 0,
      feeTreatment: 'financed',
      targetPaymentCents: 200_00,
    });

    expect(store.has(CONSOLIDATION_SCENARIO_STORAGE_KEY)).toBe(true);
    expect(readConsolidationScenario(storage)?.targetPaymentCents).toBe(200_00);
  });
});
