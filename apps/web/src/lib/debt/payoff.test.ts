// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the single-loan debt payoff engine (#2175).
 *
 * Covers known amortization values, banker's rounding ties, and edge cases:
 * 0% APR, already-paid debts, and never-amortizing minimum payments.
 */

import { describe, expect, it } from 'vitest';
import {
  addMonthsToIso,
  bankersRound,
  buildPayoffRingViewModel,
  calculatePayoffMilestones,
  calculatePayoffProgress,
  compareExtraPayment,
  formatMonthsDuration,
  formatPercent,
  formatUsdCents,
  monthlyInterestCents,
  projectPayoff,
  type LoanPayoffInput,
} from './payoff';

const START_ISO = '2025-01-01';

function loan(overrides: Partial<LoanPayoffInput> = {}): LoanPayoffInput {
  return {
    id: 'loan-1',
    name: 'Test Loan',
    balanceCents: 1_000_000, // $10,000
    originalPrincipalCents: 1_000_000,
    annualRateBps: 1200, // 12% APR
    minimumPaymentCents: 30_000, // $300
    ...overrides,
  };
}

describe('bankersRound', () => {
  it('rounds halves to the nearest even integer', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(-0.5)).toBe(0);
    expect(bankersRound(-1.5)).toBe(-2);
  });

  it('rounds non-tie values normally', () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
    expect(bankersRound(8329.1666)).toBe(8329);
  });

  it('returns 0 for non-finite input', () => {
    expect(bankersRound(Number.NaN)).toBe(0);
    expect(bankersRound(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('monthlyInterestCents', () => {
  it('computes monthly interest from APR with monthly compounding', () => {
    // $10,000 at 12% APR → 1% monthly → $100.
    expect(monthlyInterestCents(1_000_000, 1200)).toBe(10_000);
    // $5,000 at 19.99% APR → 1,999/120,000 monthly.
    expect(monthlyInterestCents(500_000, 1999)).toBe(8329);
  });

  it('returns 0 for zero/negative balance or rate', () => {
    expect(monthlyInterestCents(0, 1200)).toBe(0);
    expect(monthlyInterestCents(-100, 1200)).toBe(0);
    expect(monthlyInterestCents(1_000_000, 0)).toBe(0);
  });
});

describe('formatUsdCents', () => {
  it('formats whole dollars without trailing cents', () => {
    expect(formatUsdCents(1_000_000)).toBe('$10,000');
    expect(formatUsdCents(0)).toBe('$0');
  });

  it('formats fractional dollars with two decimals', () => {
    expect(formatUsdCents(380_050)).toBe('$3,800.50');
    expect(formatUsdCents(-1_25)).toBe('-$1.25');
  });
});

describe('formatPercent', () => {
  it('drops a redundant trailing .0', () => {
    expect(formatPercent(62)).toBe('62%');
    expect(formatPercent(62.5)).toBe('62.5%');
    expect(formatPercent(33.33)).toBe('33.3%');
  });
});

describe('addMonthsToIso', () => {
  it('advances by whole months across year boundaries', () => {
    expect(addMonthsToIso('2025-01-01', 0)).toBe('2025-01-01');
    expect(addMonthsToIso('2025-01-01', 12)).toBe('2026-01-01');
    expect(addMonthsToIso('2025-11-01', 3)).toBe('2026-02-01');
  });
});

describe('projectPayoff — known amortization values', () => {
  it('amortizes a 0% APR loan as pure principal reduction', () => {
    const result = projectPayoff(
      loan({ annualRateBps: 0, balanceCents: 100_000, minimumPaymentCents: 10_000 }),
      10_000,
      { startDateIso: START_ISO },
    );
    expect(result.amortizes).toBe(true);
    expect(result.monthsToPayoff).toBe(10);
    expect(result.totalInterestCents).toBe(0);
    expect(result.totalPrincipalCents).toBe(100_000);
    expect(result.totalPaidCents).toBe(100_000);
    expect(result.estimatedPayoffDateIso).toBe('2025-11-01');
  });

  it('produces correct first-month split for a 12% APR loan', () => {
    const result = projectPayoff(loan(), 30_000, { startDateIso: START_ISO });
    const first = result.schedule[0];
    expect(first.month).toBe(1);
    expect(first.interestCents).toBe(10_000); // 1% of $10,000
    expect(first.principalCents).toBe(20_000); // $300 - $100
    expect(first.remainingBalanceCents).toBe(980_000);
    expect(result.amortizes).toBe(true);
    expect(result.monthsToPayoff).toBeGreaterThan(0);
  });

  it('conserves money: total paid equals principal plus interest', () => {
    const result = projectPayoff(loan(), 30_000, { startDateIso: START_ISO });
    expect(result.totalPaidCents).toBe(result.totalPrincipalCents + result.totalInterestCents);
    expect(result.totalPrincipalCents).toBe(1_000_000);
  });

  it('never overpays — the final payment clears the exact balance', () => {
    const result = projectPayoff(loan(), 30_000, { startDateIso: START_ISO });
    const last = result.schedule[result.schedule.length - 1];
    expect(last.remainingBalanceCents).toBe(0);
  });
});

describe('projectPayoff — edge cases', () => {
  it('treats an already-paid debt as a zero-month payoff', () => {
    const result = projectPayoff(loan({ balanceCents: 0 }), 30_000, { startDateIso: START_ISO });
    expect(result.amortizes).toBe(true);
    expect(result.monthsToPayoff).toBe(0);
    expect(result.schedule).toHaveLength(0);
    expect(result.totalInterestCents).toBe(0);
    expect(result.estimatedPayoffDateIso).toBe(START_ISO);
  });

  it('flags a non-amortizing payment below the monthly interest', () => {
    // $5,000 at 24% APR → $100/month interest; pay only $50.
    const result = projectPayoff(
      loan({ balanceCents: 500_000, annualRateBps: 2400, minimumPaymentCents: 5_000 }),
      5_000,
      { startDateIso: START_ISO },
    );
    expect(result.amortizes).toBe(false);
    expect(result.monthsToPayoff).toBeNull();
    expect(result.estimatedPayoffDateIso).toBeNull();
    expect(result.schedule).toHaveLength(0);
  });

  it('flags a payment exactly equal to the monthly interest as non-amortizing', () => {
    // $10,000 at 12% APR → $100/month interest; pay exactly $100.
    const result = projectPayoff(loan({ minimumPaymentCents: 10_000 }), 10_000, {
      startDateIso: START_ISO,
    });
    expect(result.amortizes).toBe(false);
    expect(result.monthsToPayoff).toBeNull();
  });
});

describe('calculatePayoffProgress', () => {
  it('computes percent paid and a text alternative', () => {
    const progress = calculatePayoffProgress(
      loan({ originalPrincipalCents: 1_000_000, balanceCents: 380_000 }),
    );
    expect(progress.paidPrincipalCents).toBe(620_000);
    expect(progress.percentPaid).toBe(62);
    expect(progress.isPaidOff).toBe(false);
    expect(progress.textAlternative).toBe('62% paid — $6,200 of $10,000');
  });

  it('reports 100% paid when the balance is cleared', () => {
    const progress = calculatePayoffProgress(loan({ balanceCents: 0 }));
    expect(progress.percentPaid).toBe(100);
    expect(progress.isPaidOff).toBe(true);
  });

  it('never reports negative progress when balance exceeds original', () => {
    const progress = calculatePayoffProgress(
      loan({ originalPrincipalCents: 500_000, balanceCents: 800_000 }),
    );
    expect(progress.percentPaid).toBe(0);
    expect(progress.paidPrincipalCents).toBe(0);
    // Original principal is normalised up to the current balance.
    expect(progress.originalPrincipalCents).toBe(800_000);
  });
});

describe('calculatePayoffMilestones', () => {
  it('marks reached milestones and reports remaining principal for the rest', () => {
    const milestones = calculatePayoffMilestones(
      loan({ originalPrincipalCents: 1_000_000, balanceCents: 380_000 }),
    );
    const byThreshold = Object.fromEntries(milestones.map((m) => [m.thresholdPercent, m]));
    expect(byThreshold[25].isReached).toBe(true);
    expect(byThreshold[50].isReached).toBe(true);
    expect(byThreshold[75].isReached).toBe(false);
    expect(byThreshold[75].remainingToReachCents).toBe(130_000); // $7,500 target - $6,200 paid
    expect(byThreshold[100].isReached).toBe(false);
    expect(byThreshold[75].label).toContain('to go');
    expect(byThreshold[25].label).toContain('milestone reached');
  });

  it('marks all milestones reached when paid off', () => {
    const milestones = calculatePayoffMilestones(loan({ balanceCents: 0 }));
    expect(milestones.every((m) => m.isReached)).toBe(true);
    expect(milestones.every((m) => m.remainingToReachCents === 0)).toBe(true);
  });
});

describe('compareExtraPayment', () => {
  it('reports months saved and interest saved for an extra payment', () => {
    const comparison = compareExtraPayment(loan(), 20_000, { startDateIso: START_ISO });
    expect(comparison.baseline.amortizes).toBe(true);
    expect(comparison.accelerated.amortizes).toBe(true);
    expect(comparison.monthsSaved).not.toBeNull();
    expect(comparison.monthsSaved!).toBeGreaterThan(0);
    expect(comparison.interestSavedCents).toBeGreaterThan(0);
    expect(comparison.hasImpact).toBe(true);
    // Accelerated plan finishes sooner than baseline.
    expect(comparison.accelerated.monthsToPayoff!).toBeLessThan(
      comparison.baseline.monthsToPayoff!,
    );
  });

  it('reports no impact for a zero extra payment', () => {
    const comparison = compareExtraPayment(loan(), 0, { startDateIso: START_ISO });
    expect(comparison.hasImpact).toBe(false);
    expect(comparison.monthsSaved).toBe(0);
    expect(comparison.interestSavedCents).toBe(0);
  });

  it('does not fabricate savings when the baseline never amortizes', () => {
    const comparison = compareExtraPayment(
      loan({ balanceCents: 500_000, annualRateBps: 2400, minimumPaymentCents: 5_000 }),
      100_000,
      { startDateIso: START_ISO },
    );
    expect(comparison.baseline.amortizes).toBe(false);
    expect(comparison.interestSavedCents).toBe(0);
    expect(comparison.monthsSaved).toBeNull();
    expect(comparison.hasImpact).toBe(false);
  });
});

describe('buildPayoffRingViewModel', () => {
  it('assembles progress, payoff date, milestones, and savings copy', () => {
    const vm = buildPayoffRingViewModel(
      loan({ originalPrincipalCents: 1_000_000, balanceCents: 620_000 }),
      20_000,
      { startDateIso: START_ISO },
    );
    expect(vm.progress.percentPaid).toBe(38);
    expect(vm.payoffDateLabel).toMatch(/\d{4}/);
    expect(vm.payoffDurationLabel).not.toBe('');
    expect(vm.nextMilestone).not.toBeNull();
    expect(vm.ringAriaLabel).toContain('Test Loan payoff ring');
    expect(vm.ringAriaLabel).toContain('38% paid');
    expect(vm.comparison.hasImpact).toBe(true);
    expect(vm.savingsMessage).toContain('saves');
  });

  it('uses the accelerated projection for the payoff date when extra is applied', () => {
    const baselineVm = buildPayoffRingViewModel(loan(), 0, { startDateIso: START_ISO });
    const acceleratedVm = buildPayoffRingViewModel(loan(), 50_000, { startDateIso: START_ISO });
    expect(acceleratedVm.activeProjection.monthsToPayoff!).toBeLessThan(
      baselineVm.activeProjection.monthsToPayoff!,
    );
  });

  it('describes a paid-off debt without a payoff date', () => {
    const vm = buildPayoffRingViewModel(loan({ balanceCents: 0 }), 0, { startDateIso: START_ISO });
    expect(vm.progress.isPaidOff).toBe(true);
    expect(vm.payoffDateLabel).toBe('Paid off');
    expect(vm.ringAriaLabel).toContain('paid off');
  });

  it('explains a non-amortizing minimum payment', () => {
    const vm = buildPayoffRingViewModel(
      loan({ balanceCents: 500_000, annualRateBps: 2400, minimumPaymentCents: 5_000 }),
      0,
      { startDateIso: START_ISO },
    );
    expect(vm.payoffDateLabel).toBe('No payoff at this payment');
    expect(vm.savingsMessage).toContain('does not cover');
  });
});

describe('formatMonthsDuration', () => {
  it('formats years and months', () => {
    expect(formatMonthsDuration(0)).toBe('paid off');
    expect(formatMonthsDuration(1)).toBe('1 month');
    expect(formatMonthsDuration(12)).toBe('1 year');
    expect(formatMonthsDuration(14)).toBe('1 year, 2 months');
    expect(formatMonthsDuration(null)).toBe('no payoff at this payment');
  });
});
