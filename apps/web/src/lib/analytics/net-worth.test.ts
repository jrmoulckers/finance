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
