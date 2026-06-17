// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildBusinessExpenseUpdate } from '../expenseRules';
import { generateTaxReadyExpenseReport } from '../reports';
import type { ExpenseTransactionInput, TripEntry } from '../types';

const trips: TripEntry[] = [
  {
    id: 'trip-business',
    date: '2024-02-14',
    startLocation: 'Home',
    endLocation: 'Client Site',
    miles: 100,
    odometerStart: null,
    odometerEnd: null,
    purpose: 'business',
    notes: 'Onsite discovery',
    businessUsePercent: 100,
    createdAt: '2024-02-14T12:00:00.000Z',
    updatedAt: '2024-02-14T12:00:00.000Z',
  },
  {
    id: 'trip-charity',
    date: '2024-02-18',
    startLocation: 'Home',
    endLocation: 'Food Bank',
    miles: 25,
    odometerStart: null,
    odometerEnd: null,
    purpose: 'charity',
    notes: 'Volunteer shift',
    businessUsePercent: 100,
    createdAt: '2024-02-18T12:00:00.000Z',
    updatedAt: '2024-02-18T12:00:00.000Z',
  },
];

const mealTransaction: ExpenseTransactionInput = {
  id: 'txn-meal',
  date: '2024-02-15',
  payee: 'Airport Cafe',
  note: 'Team lunch while traveling',
  amountCents: -12_000,
  type: 'EXPENSE',
  tags: [],
  customFields: null,
  categoryName: 'Travel Meals',
};

const taggedMeal = buildBusinessExpenseUpdate(mealTransaction, {
  enabled: true,
  category: 'meals',
  businessUsePercent: 100,
});

describe('tax-ready mileage report', () => {
  it('summarizes mileage and business expenses for a reporting period', () => {
    const report = generateTaxReadyExpenseReport({
      trips,
      transactions: [
        {
          ...mealTransaction,
          tags: taggedMeal.tags,
          customFields: taggedMeal.customFields,
        },
      ],
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });

    expect(report.totalMileageDeductionCents).toBe(7_050);
    expect(report.totalExpenseDeductionCents).toBe(6_000);
    expect(report.grandTotalDeductionCents).toBe(13_050);
    expect(report.mileageByPurpose).toEqual([
      {
        purpose: 'business',
        miles: 100,
        tripCount: 1,
        deductionCents: 6_700,
      },
      {
        purpose: 'charity',
        miles: 25,
        tripCount: 1,
        deductionCents: 350,
      },
    ]);
    expect(report.expenseByCategory[0]).toMatchObject({
      category: 'meals',
      deductibleAmountCents: 6_000,
      transactionCount: 1,
    });
  });
});
