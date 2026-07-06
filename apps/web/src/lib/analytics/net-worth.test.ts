// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for net worth analytics calculation utilities.
 *
 * References: issue #1578
 */

import { describe, it, expect } from 'vitest';
import {
  computeCurrentNetWorth,
  computeAssetClassBreakdown,
  detectMilestones,
  computePeriodComparison,
  isLiabilityType,
  netWorthContribution,
} from './net-worth';
import type { Account } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAccount(
  overrides: Partial<Account> & { type: Account['type']; balance: number },
): Account {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    householdId: 'hh-1',
    name: overrides.name ?? 'Test Account',
    type: overrides.type,
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: overrides.balance } as Account['currentBalance'],
    isArchived: overrides.isArchived ?? false,
    sortOrder: 0,
    icon: null,
    color: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  } as Account;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isLiabilityType', () => {
  it('identifies CREDIT_CARD as liability', () => {
    expect(isLiabilityType('CREDIT_CARD')).toBe(true);
  });

  it('identifies LOAN as liability', () => {
    expect(isLiabilityType('LOAN')).toBe(true);
  });

  it('identifies CHECKING as non-liability', () => {
    expect(isLiabilityType('CHECKING')).toBe(false);
  });

  it('identifies INVESTMENT as non-liability', () => {
    expect(isLiabilityType('INVESTMENT')).toBe(false);
  });
});

describe('computeCurrentNetWorth', () => {
  it('calculates net worth from assets and liabilities', () => {
    const accounts = [
      makeAccount({ type: 'CHECKING', balance: 500000 }),
      makeAccount({ type: 'SAVINGS', balance: 1000000 }),
      makeAccount({ type: 'CREDIT_CARD', balance: -200000 }),
    ];

    const nw = computeCurrentNetWorth(accounts);

    expect(nw.assets).toBe(1500000);
    expect(nw.liabilities).toBe(200000);
    expect(nw.netWorth).toBe(1300000);
  });

  it('excludes archived accounts', () => {
    const accounts = [
      makeAccount({ type: 'CHECKING', balance: 500000 }),
      makeAccount({ type: 'SAVINGS', balance: 1000000, isArchived: true }),
    ];

    const nw = computeCurrentNetWorth(accounts);
    expect(nw.assets).toBe(500000);
  });

  it('handles empty accounts', () => {
    const nw = computeCurrentNetWorth([]);
    expect(nw.assets).toBe(0);
    expect(nw.liabilities).toBe(0);
    expect(nw.netWorth).toBe(0);
  });
});

describe('netWorthContribution', () => {
  it('returns the raw balance for asset accounts', () => {
    expect(netWorthContribution(makeAccount({ type: 'CHECKING', balance: 956405 }))).toBe(956405);
    expect(netWorthContribution(makeAccount({ type: 'SAVINGS', balance: 1200000 }))).toBe(1200000);
    expect(netWorthContribution(makeAccount({ type: 'CASH', balance: 7375 }))).toBe(7375);
    expect(netWorthContribution(makeAccount({ type: 'INVESTMENT', balance: 1250000 }))).toBe(
      1250000,
    );
  });

  it('subtracts liabilities stored as positive amounts owed', () => {
    // Production convention (issue #3202): credit cards / loans store a
    // positive balance owed, so they must reduce net worth.
    expect(netWorthContribution(makeAccount({ type: 'CREDIT_CARD', balance: 67299 }))).toBe(-67299);
    expect(netWorthContribution(makeAccount({ type: 'LOAN', balance: 2500000 }))).toBe(-2500000);
  });

  it('subtracts liabilities stored with a negative sign convention', () => {
    // Mirrors computeCurrentNetWorth's Math.abs handling so both sign
    // conventions reduce net worth by the same magnitude.
    expect(netWorthContribution(makeAccount({ type: 'CREDIT_CARD', balance: -125000 }))).toBe(
      -125000,
    );
  });

  it('summing contributions equals assets minus liabilities and matches computeCurrentNetWorth', () => {
    // Reproduces the live /accounts data from issue #3202.
    const accounts = [
      makeAccount({ type: 'CHECKING', balance: 956405 }), // $9,564.05
      makeAccount({ type: 'SAVINGS', balance: 1200000 }), // $12,000.00
      makeAccount({ type: 'CASH', balance: 7375 }), // $73.75
      makeAccount({ type: 'CREDIT_CARD', balance: 67299 }), // $672.99 owed
    ];

    const total = accounts.reduce((sum, acct) => sum + netWorthContribution(acct), 0);

    // assets 21,637.80 - liability 672.99 = 20,964.81 (what /net-worth shows).
    expect(total).toBe(2096481);
    expect(total).toBe(computeCurrentNetWorth(accounts).netWorth);

    // The old sign-blind sum overstated by exactly 2x the liability ($22,310.79).
    const naiveSum = accounts.reduce((sum, acct) => sum + acct.currentBalance.amount, 0);
    expect(naiveSum).toBe(2231079);
    expect(naiveSum - total).toBe(2 * 67299);
  });
});

describe('computeAssetClassBreakdown', () => {
  it('groups accounts by asset class', () => {
    const accounts = [
      makeAccount({ type: 'CHECKING', balance: 500000 }),
      makeAccount({ type: 'CHECKING', balance: 300000 }),
      makeAccount({ type: 'SAVINGS', balance: 1000000 }),
    ];

    const classes = computeAssetClassBreakdown(accounts);

    expect(classes).toHaveLength(2);
    // Sorted by balance descending
    expect(classes[0].className).toBe('Savings');
    expect(classes[0].balance).toBe(1000000);
    expect(classes[1].className).toBe('Checking');
    expect(classes[1].balance).toBe(800000);
    expect(classes[1].accountCount).toBe(2);
  });

  it('computes asset percentages against assets only (excludes liabilities)', () => {
    const accounts = [
      makeAccount({ type: 'INVESTMENT', balance: 30_000_000 }), // $300K
      makeAccount({ type: 'LOAN', balance: 20_000_000 }), // $200K mortgage
    ];

    const classes = computeAssetClassBreakdown(accounts);
    const investments = classes.find((c) => c.className === 'Investments');
    const loans = classes.find((c) => c.className === 'Loans');

    // Investments are 100% of assets — NOT diluted to 60% by the loan.
    expect(investments?.isLiability).toBe(false);
    expect(investments?.percent).toBe(100);
    // Loans are 100% of liabilities, reported against their own denominator.
    expect(loans?.isLiability).toBe(true);
    expect(loans?.percent).toBe(100);
  });

  it('orders asset classes before liability classes', () => {
    const accounts = [
      makeAccount({ type: 'CREDIT_CARD', balance: 5_000_000 }),
      makeAccount({ type: 'CHECKING', balance: 1_000_000 }),
      makeAccount({ type: 'INVESTMENT', balance: 2_000_000 }),
    ];

    const classes = computeAssetClassBreakdown(accounts);

    // Assets first (by balance desc), then liabilities.
    expect(classes.map((c) => c.className)).toEqual(['Investments', 'Checking', 'Credit Cards']);
    expect(classes[classes.length - 1].isLiability).toBe(true);
  });
});

describe('detectMilestones', () => {
  it('marks reached milestones', () => {
    const milestones = detectMilestones(1_500_000, 0); // $15K, no debt

    const first1k = milestones.find((m) => m.label === 'First $1K');
    const first10k = milestones.find((m) => m.label === 'First $10K');
    const first25k = milestones.find((m) => m.label === 'First $25K');
    const debtFree = milestones.find((m) => m.label === 'Debt-free');

    expect(first1k?.reached).toBe(true);
    expect(first10k?.reached).toBe(true);
    expect(first25k?.reached).toBe(false);
    expect(debtFree?.reached).toBe(true);
  });

  it('marks debt-free as false when liabilities exist', () => {
    const milestones = detectMilestones(5_000_000, 100000);
    const debtFree = milestones.find((m) => m.label === 'Debt-free');
    expect(debtFree?.reached).toBe(false);
  });

  it('includes FIRE-scale milestones beyond $100K', () => {
    const milestones = detectMilestones(60_000_000, 0); // $600K net worth

    const first250k = milestones.find((m) => m.label === 'First $250K');
    const first500k = milestones.find((m) => m.label === 'First $500K');
    const first1m = milestones.find((m) => m.label === 'First $1M');

    expect(first250k?.reached).toBe(true);
    expect(first500k?.reached).toBe(true);
    // $600K has not yet reached the $1M marker.
    expect(first1m).toBeDefined();
    expect(first1m?.reached).toBe(false);
  });
});

describe('computePeriodComparison', () => {
  it('computes positive growth', () => {
    const cmp = computePeriodComparison(1200000, 1000000, 'This Month', 'Last Month');

    expect(cmp.changeCents).toBe(200000);
    expect(cmp.changePercent).toBe(20);
  });

  it('computes negative growth', () => {
    const cmp = computePeriodComparison(800000, 1000000, 'This Month', 'Last Month');

    expect(cmp.changeCents).toBe(-200000);
    expect(cmp.changePercent).toBe(-20);
  });

  it('handles zero previous', () => {
    const cmp = computePeriodComparison(500000, 0, 'Now', 'Before');
    expect(cmp.changePercent).toBe(0);
  });
});
