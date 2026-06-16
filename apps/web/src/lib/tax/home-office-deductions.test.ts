// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  calculateHomeOfficeDeduction,
  summarizeHomeOfficeDeductions,
  type HomeOfficeEntry,
} from './home-office-deductions';

describe('home-office deductions', () => {
  it('calculates simplified-method deduction using the IRS $5 per square foot cap and active months', () => {
    const result = calculateHomeOfficeDeduction({
      id: 'office',
      taxYear: 2025,
      method: 'SIMPLIFIED',
      businessSquareFeet: 400,
      totalHomeSquareFeet: 2_000,
      activeMonths: 6,
      receiptReference: 'floor-plan',
    });

    expect(result.deductibleSquareFeet).toBe(300);
    expect(result.businessUsePercent).toBe(20);
    expect(result.deductionCents).toBe(750_00);
    expect(result.warnings).toEqual([]);
  });

  it('calculates actual-expense deduction and summarizes missing support', () => {
    const entries: HomeOfficeEntry[] = [
      {
        id: 'actual',
        taxYear: 2025,
        method: 'ACTUAL_EXPENSE',
        businessSquareFeet: 120,
        totalHomeSquareFeet: 1_200,
        activeMonths: 12,
        actualHomeExpenseCents: 18_000_00,
      },
    ];

    const summary = summarizeHomeOfficeDeductions(entries, 2025);

    expect(summary.totalDeductionCents).toBe(1_800_00);
    expect(summary.missingSupportCount).toBe(1);
    expect(summary.results[0].warnings).toContain('Add supporting notes or receipt references for tax-prep review.');
  });
});
