// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Investment, InvestmentLot } from '../../kmp/bridge';
import {
  buildDCADashboardViewModel,
  buildDCAPlanFromDraft,
  clearDCAPlans,
  deleteDCAPlan,
  loadDCAPlans,
  mapInvestmentLotsToDCAPurchases,
  saveDCAPlans,
  upsertDCAPlan,
  validateDCAPlanDraft,
} from './dca-plan-view';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('DCA plan view helpers', () => {
  it('validates, normalizes, persists, and deletes local plans', () => {
    const storage = new MemoryStorage();
    const invalid = validateDCAPlanDraft({
      symbol: '',
      cadence: 'MONTHLY',
      targetAmountCents: 0,
      startDate: 'bad-date',
    });
    const plan = buildDCAPlanFromDraft({
      symbol: ' vti ',
      cadence: 'MONTHLY',
      targetAmountCents: 500_00,
      startDate: '2025-01-01',
      amountOverrides: [{ effectiveDate: '2025-02-01', targetAmountCents: 750_00 }],
    });

    expect(invalid.valid).toBe(false);
    expect(plan.symbol).toBe('VTI');
    expect(plan.id).toBe('vti-monthly-2025-01-01');
    saveDCAPlans(storage, upsertDCAPlan([], plan));
    expect(loadDCAPlans(storage)).toEqual([plan]);
    expect(deleteDCAPlan([plan], plan.id)).toEqual([]);
    clearDCAPlans(storage);
    expect(loadDCAPlans(storage)).toEqual([]);
  });

  it('maps investment lots and builds dashboard reminders without external notifications', () => {
    const investment = { id: 'inv-1', symbol: 'VTI' } as Investment;
    const lot = {
      investmentId: 'inv-1',
      purchaseDate: '2025-01-03',
      shares: 2,
      totalCost: { amount: 400_00, currency: 'USD' },
    } as unknown as InvestmentLot;
    const plan = buildDCAPlanFromDraft({
      symbol: 'VTI',
      cadence: 'MONTHLY',
      targetAmountCents: 500_00,
      startDate: '2025-01-01',
    });

    const purchases = mapInvestmentLotsToDCAPurchases(
      [investment],
      new Map<string, readonly InvestmentLot[]>([['inv-1', [lot]]]),
    );
    const dashboard = buildDCADashboardViewModel([plan], purchases, '2025-02-15', new Map([['VTI', 250_00]]));

    expect(purchases).toEqual([
      { symbol: 'VTI', purchaseDate: '2025-01-03', shares: 2, totalCostCents: 400_00 },
    ]);
    expect(dashboard.rows[0]?.statusCounts.PARTIAL).toBe(1);
    expect(dashboard.rows[0]?.currentValueCents).toBe(500_00);
    expect(dashboard.reminders[0]).toMatchObject({
      planId: plan.id,
      symbol: 'VTI',
      dueDate: '2025-01-01',
      status: 'overdue',
    });
    expect(dashboard.reminders.at(-1)).toMatchObject({
      dueDate: '2025-03-01',
      status: 'upcoming',
    });
  });
});
