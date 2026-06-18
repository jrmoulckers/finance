// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildDebtPayoffProgressRingCard,
  buildStudentLoanProgressRingCard,
} from './debt-progress-rings';
import type {
  DebtMilestoneSummary,
  StrategyResult,
  StudentLoanDashboardSummary,
} from '../debt-types';

const strategyResult: StrategyResult = {
  strategy: 'avalanche',
  schedules: [],
  payoffOrder: [],
  totalInterestCents: 25_00,
  totalPaidCents: 1_025_00,
  totalMonths: 18,
  timelineBalanceCents: [],
};

const milestones: DebtMilestoneSummary = {
  totalOriginalDebtCents: 2_000_00,
  currentDebtCents: 1_100_00,
  paidOffCents: 900_00,
  totalInterestPaidToDateCents: 50_00,
  percentPaidOff: 45,
  milestones: [
    { thresholdPercent: 10, isReached: true },
    { thresholdPercent: 25, isReached: true },
    { thresholdPercent: 50, isReached: false },
    { thresholdPercent: 75, isReached: false },
    { thresholdPercent: 100, isReached: false },
  ],
};

describe('debt progress rings', () => {
  it('builds accessible payoff ring text with the next milestone', () => {
    const card = buildDebtPayoffProgressRingCard({
      milestones,
      activeResult: strategyResult,
      interestSavedCents: 123_45,
      debtFreeLabel: 'Jan 2027',
    });

    expect(card.percent).toBe(45);
    expect(card.ariaLabel).toContain('45% paid off');
    expect(card.detailItems).toContain('Next milestone: 50% paid off');
  });

  it('clamps student loan ring progress and keeps payoff/interest text equivalent', () => {
    const summary: StudentLoanDashboardSummary = {
      monthlyPaymentCents: 200_00,
      monthsToPayoff: 12,
      estimatedPayoffDate: '2026-01-01',
      totalInterestCents: 300_00,
      totalBalanceCents: 1_000_00,
      totalOriginalBalanceCents: 1_000_00,
      weightedAverageRateBps: 500,
      percentPaidOff: 125,
    };

    const card = buildStudentLoanProgressRingCard({ summary, interestSavedCents: 75_00 });

    expect(card.percent).toBe(100);
    expect(card.ariaLabel).toContain('Estimated payoff: 2026-01-01');
    expect(card.detailItems).toContain('Interest saved with current what-if: 7500 cents');
  });
});
