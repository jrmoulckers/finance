// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  calculatePaymentToReachUtilization,
  simulateCreditScoreImpact,
} from './credit-score-impact';
import type { CreditCard } from '../debt-types';

const CARDS: CreditCard[] = [
  {
    id: 'card-a',
    name: 'Daily Card',
    balanceCents: 4_000_00,
    creditLimitCents: 10_000_00,
    minimumPaymentCents: 100_00,
    dueDate: '2025-02-20',
    annualRateBps: 1999,
    statementDate: '2025-02-05',
  },
  {
    id: 'card-b',
    name: 'Travel Card',
    balanceCents: 1_000_00,
    creditLimitCents: 5_000_00,
    minimumPaymentCents: 50_00,
    dueDate: '2025-02-22',
    annualRateBps: 1899,
    statementDate: '2025-02-08',
  },
];

describe('calculatePaymentToReachUtilization', () => {
  it('calculates the payment needed to reach a target utilization', () => {
    expect(calculatePaymentToReachUtilization(CARDS[0], 30)).toBe(1_000_00);
  });

  it('returns null when the credit limit is unknown', () => {
    expect(
      calculatePaymentToReachUtilization({ ...CARDS[0], creditLimitCents: undefined }, 30),
    ).toBeNull();
  });
});

describe('simulateCreditScoreImpact', () => {
  it('marks utilization payoff scenarios as positive without exact score promises', () => {
    const result = simulateCreditScoreImpact({
      cards: CARDS,
      plannedPaymentsCents: { 'card-a': 2_000_00 },
      onTimePaymentMonths: 3,
    });
    const utilization = result.factorImpacts.find((impact) => impact.factor === 'utilization');

    expect(utilization?.direction).toBe('positive');
    expect(utilization?.afterPercent).toBeLessThan(utilization?.beforePercent ?? 0);
    expect(result.disclaimer).toContain('does not predict exact');
  });

  it('reports unknown utilization when limits are missing', () => {
    const result = simulateCreditScoreImpact({
      cards: [{ ...CARDS[0], creditLimitCents: undefined }],
      plannedPaymentsCents: { 'card-a': 1_000_00 },
    });
    const utilization = result.factorImpacts.find((impact) => impact.factor === 'utilization');

    expect(utilization?.direction).toBe('unknown');
    expect(utilization?.assumptions).toContain('One or more card credit limits are unknown.');
    expect(result.suggestedActions).toContain(
      'Add missing credit limits to improve utilization modeling.',
    );
  });

  it('treats hard inquiries as a negative new-credit factor', () => {
    const result = simulateCreditScoreImpact({ cards: CARDS, newHardInquiries: 2 });
    const newCredit = result.factorImpacts.find((impact) => impact.factor === 'new_credit');

    expect(newCredit?.direction).toBe('negative');
    expect(newCredit?.magnitude).toBe('low');
  });
});
