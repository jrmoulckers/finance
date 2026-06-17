// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  aggregateBnplDashboard,
  createBnplObligationFromDraft,
  markNextBnplInstallmentPaid,
} from './bnpl-aggregation';
import type { BnplObligation } from '../debt-types';

const OBLIGATIONS: BnplObligation[] = [
  {
    id: 'a',
    merchantName: 'Furniture',
    originalAmountCents: 800_00,
    remainingBalanceCents: 400_00,
    totalInstallments: 4,
    paidInstallments: 2,
    installmentAmountCents: 200_00,
    annualRateBps: 0,
    totalFeesCents: 0,
    upcomingDueDates: ['2025-02-15', '2025-03-15'],
  },
  {
    id: 'b',
    merchantName: 'Electronics',
    originalAmountCents: 600_00,
    remainingBalanceCents: 300_00,
    totalInstallments: 4,
    paidInstallments: 2,
    installmentAmountCents: 150_00,
    annualRateBps: 0,
    totalFeesCents: 25_00,
    upcomingDueDates: ['2025-02-15', '2025-03-15'],
  },
  {
    id: 'done',
    merchantName: 'Completed',
    originalAmountCents: 100_00,
    remainingBalanceCents: 0,
    totalInstallments: 4,
    paidInstallments: 4,
    installmentAmountCents: 25_00,
    annualRateBps: 0,
    totalFeesCents: 0,
    upcomingDueDates: [],
  },
];

describe('aggregateBnplDashboard', () => {
  it('separates active and completed obligations and sorts installments', () => {
    const result = aggregateBnplDashboard({
      obligations: OBLIGATIONS,
      monthlyIncomeCents: 5_000_00,
    });

    expect(result.activeObligations.map((obligation) => obligation.id)).toEqual(['a', 'b']);
    expect(result.completedObligations.map((obligation) => obligation.id)).toEqual(['done']);
    expect(result.upcomingInstallments[0]).toMatchObject({
      dueDate: '2025-02-15',
      amountCents: 200_00,
    });
    expect(result.summary.totalOutstandingCents).toBe(700_00);
  });

  it('emits critical collision alerts above the threshold', () => {
    const result = aggregateBnplDashboard({
      obligations: OBLIGATIONS,
      monthlyIncomeCents: 5_000_00,
      collisionThresholdCents: 300_00,
    });
    const collision = result.alerts.find((alert) => alert.type === 'collision');

    expect(collision?.level).toBe('critical');
    expect(collision?.totalDueCents).toBe(350_00);
  });

  it('filters past due dates from active exposure when today is supplied', () => {
    const result = aggregateBnplDashboard({
      obligations: OBLIGATIONS,
      monthlyIncomeCents: 5_000_00,
      todayIso: '2025-03-01',
    });

    expect(
      result.upcomingInstallments.every((installment) => installment.dueDate >= '2025-03-01'),
    ).toBe(true);
  });
});

describe('createBnplObligationFromDraft', () => {
  it('creates a remaining schedule from beta entry fields', () => {
    const obligation = createBnplObligationFromDraft({
      id: 'draft',
      merchantName: '  Shoes  ',
      originalAmountCents: 240_00,
      totalInstallments: 4,
      paidInstallments: 1,
      installmentAmountCents: 60_00,
      firstDueDateIso: '2025-02-01',
      cadenceDays: 14,
    });

    expect(obligation.merchantName).toBe('Shoes');
    expect(obligation.remainingBalanceCents).toBe(180_00);
    expect(obligation.upcomingDueDates).toEqual(['2025-02-01', '2025-02-15', '2025-03-01']);
  });

  it('marks the next installment paid without losing remaining schedule context', () => {
    const updated = markNextBnplInstallmentPaid(OBLIGATIONS[0]);

    expect(updated.paidInstallments).toBe(3);
    expect(updated.remainingBalanceCents).toBe(200_00);
    expect(updated.upcomingDueDates).toEqual(['2025-03-15']);
  });
});
