// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computeIRR,
  computeMOIC,
  computePrivateInvestmentSummary,
  countByStatus,
  groupByVintageYear,
  totalCapitalCalled,
  totalDistributions,
} from './private-investments';
import type { CapitalEvent, PrivateInvestment } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const events: CapitalEvent[] = [
  { id: 'e1', date: '2021-06-01', amountCents: 5000000, type: 'CALL' },
  { id: 'e2', date: '2022-06-01', amountCents: 3000000, type: 'CALL' },
  { id: 'e3', date: '2023-06-01', amountCents: 2000000, type: 'DISTRIBUTION' },
];

const investment1: PrivateInvestment = {
  id: 'inv1',
  companyName: 'TechStartup Inc',
  investmentDate: '2021-01-15',
  investedAmountCents: 10000000,
  currentValueCents: 25000000,
  vintageYear: 2021,
  status: 'ACTIVE',
  capitalEvents: events,
};

const investment2: PrivateInvestment = {
  id: 'inv2',
  companyName: 'BioHealth Co',
  investmentDate: '2022-03-01',
  investedAmountCents: 5000000,
  currentValueCents: 0,
  vintageYear: 2022,
  status: 'FAILED',
  capitalEvents: [],
};

const investment3: PrivateInvestment = {
  id: 'inv3',
  companyName: 'FinAPI Corp',
  investmentDate: '2021-07-15',
  investedAmountCents: 8000000,
  currentValueCents: 20000000,
  vintageYear: 2021,
  status: 'ACTIVE',
  capitalEvents: [{ id: 'e4', date: '2023-12-01', amountCents: 5000000, type: 'DISTRIBUTION' }],
};

const investments = [investment1, investment2, investment3];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('totalCapitalCalled', () => {
  it('sums capital calls', () => {
    expect(totalCapitalCalled(events)).toBe(8000000);
  });

  it('returns 0 for no events', () => {
    expect(totalCapitalCalled([])).toBe(0);
  });
});

describe('totalDistributions', () => {
  it('sums distributions', () => {
    expect(totalDistributions(events)).toBe(2000000);
  });

  it('returns 0 for no events', () => {
    expect(totalDistributions([])).toBe(0);
  });
});

describe('computeMOIC', () => {
  it('computes MOIC for profitable investment', () => {
    // (25M + 2M distributions) / 10M invested = 2.7x
    const moic = computeMOIC(investment1);
    expect(moic).toBe(2.7);
  });

  it('computes MOIC of 0 for failed investment', () => {
    // (0 + 0) / 5M = 0x
    expect(computeMOIC(investment2)).toBe(0);
  });
});

describe('computeIRR', () => {
  it('computes positive IRR for profitable investment', () => {
    const irr = computeIRR(investment1, '2024-06-15');
    // Should be a positive return
    expect(irr).toBeGreaterThan(0);
  });

  it('returns 0 for zero-length period', () => {
    const irr = computeIRR(investment1, investment1.investmentDate);
    expect(irr).toBe(0);
  });
});

describe('groupByVintageYear', () => {
  it('groups correctly', () => {
    const grouped = groupByVintageYear(investments);
    expect(grouped.get(2021)).toHaveLength(2);
    expect(grouped.get(2022)).toHaveLength(1);
  });
});

describe('countByStatus', () => {
  it('counts by status', () => {
    const counts = countByStatus(investments);
    expect(counts.get('ACTIVE')).toBe(2);
    expect(counts.get('FAILED')).toBe(1);
  });
});

describe('computePrivateInvestmentSummary', () => {
  it('computes full summary', () => {
    const summary = computePrivateInvestmentSummary(investments);
    // Total invested: 10M + 5M + 8M = 23M
    expect(summary.totalInvestedCents).toBe(23000000);
    // Total current: 25M + 0 + 20M = 45M
    expect(summary.totalCurrentValueCents).toBe(45000000);
    // Total distributions: 2M + 0 + 5M = 7M
    expect(summary.totalDistributionsCents).toBe(7000000);
    // MOIC: (45M + 7M) / 23M ≈ 2.26
    expect(summary.moic).toBe(2.26);
    expect(summary.activeCount).toBe(2);
  });

  it('returns zeros for empty portfolio', () => {
    const summary = computePrivateInvestmentSummary([]);
    expect(summary.totalInvestedCents).toBe(0);
    expect(summary.moic).toBe(0);
  });
});
