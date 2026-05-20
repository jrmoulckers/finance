// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the withdrawal optimizer engine.
 *
 * Covers banker's rounding, RMD calculation, tax computation,
 * bracket space detection, withdrawal plan generation, and
 * Roth conversion ladder analysis.
 *
 * References: #1688, #1737
 */

import { describe, expect, it } from 'vitest';
import type { RetirementAccount, TaxBracket } from './types';
import {
  bankersRound,
  safeDivide,
  getDistributionPeriod,
  calculateRMD,
  calculateTax,
  findBracketSpace,
  generateWithdrawalPlan,
  analyzeRothConversionLadder,
  RMD_START_AGE,
  FEDERAL_TAX_BRACKETS_2024,
} from './withdrawal-optimizer';
import type { WithdrawalOptimizerInput } from './withdrawal-optimizer';

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 2.5 to 2 (even)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds 3.5 to 4 (even)', () => {
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds 2.4 to 2', () => {
    expect(bankersRound(2.4)).toBe(2);
  });

  it('rounds 2.6 to 3', () => {
    expect(bankersRound(2.6)).toBe(3);
  });

  it('returns 0 for NaN', () => {
    expect(bankersRound(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(bankersRound(Infinity)).toBe(0);
  });

  it('handles negative values', () => {
    expect(bankersRound(-2.6)).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// safeDivide
// ---------------------------------------------------------------------------

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 2)).toBe(5);
  });

  it('returns 0 for zero denominator', () => {
    expect(safeDivide(10, 0)).toBe(0);
  });

  it('handles zero numerator', () => {
    expect(safeDivide(0, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RMD calculation
// ---------------------------------------------------------------------------

describe('getDistributionPeriod', () => {
  it('returns 0 for ages below RMD start', () => {
    expect(getDistributionPeriod(65)).toBe(0);
    // Age 72 is below RMD_START_AGE (73) under SECURE Act 2.0
    expect(getDistributionPeriod(72)).toBe(0);
  });

  it('returns period from table for age 72 entry via direct map lookup', () => {
    // The table has an entry for 72 but RMD starts at 73
    // so getDistributionPeriod returns 0 for 72
    expect(getDistributionPeriod(73)).toBe(26.5);
  });

  it('returns correct period for age 73', () => {
    expect(getDistributionPeriod(73)).toBe(26.5);
  });

  it('returns correct period for age 80', () => {
    expect(getDistributionPeriod(80)).toBe(20.2);
  });

  it('extrapolates for ages beyond 100', () => {
    const period = getDistributionPeriod(105);
    expect(period).toBeGreaterThanOrEqual(1.0);
    expect(period).toBeLessThan(6.4);
  });
});

describe('calculateRMD', () => {
  it('returns 0 for ages below RMD start', () => {
    expect(calculateRMD(1000000_00, 65)).toBe(0);
  });

  it('calculates correct RMD at age 73', () => {
    // $1,000,000 / 26.5 = $37,735.849... → rounds to 3773585
    const rmd = calculateRMD(1000000_00, 73);
    expect(rmd).toBe(3773585);
  });

  it('calculates correct RMD at age 80', () => {
    // $500,000 / 20.2 = $24,752.475... → rounds to 2475248
    const rmd = calculateRMD(500000_00, 80);
    expect(rmd).toBe(2475248);
  });

  it('returns 0 for zero balance', () => {
    expect(calculateRMD(0, 75)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tax calculation
// ---------------------------------------------------------------------------

describe('calculateTax', () => {
  it('returns 0 for zero income', () => {
    expect(calculateTax(0)).toBe(0);
  });

  it('returns 0 for negative income', () => {
    expect(calculateTax(-5000_00)).toBe(0);
  });

  it('calculates tax in first bracket', () => {
    // $10,000 at 10% = $1,000
    expect(calculateTax(1000000)).toBe(100000);
  });

  it('calculates tax across multiple brackets', () => {
    // $50,000 (5,000,000 cents):
    // $11,600 (1,160,000) @ 10% = 116,000
    // $35,675 (3,567,500) @ 12% = 428,100
    // $2,725  (272,500)   @ 22% = 59,950
    // Total = 604,050
    const tax = calculateTax(5000000);
    expect(tax).toBe(604050);
  });

  it('accepts custom brackets', () => {
    const simpleBrackets: TaxBracket[] = [
      { minCents: 0, maxCents: 1000000, rate: 0.1 },
      { minCents: 1000000, maxCents: Infinity, rate: 0.2 },
    ];
    // $15,000 = $10,000 @ 10% + $5,000 @ 20% = $1,000 + $1,000 = $2,000
    expect(calculateTax(1500000, simpleBrackets)).toBe(200000);
  });
});

describe('findBracketSpace', () => {
  it('returns full first bracket for zero income', () => {
    expect(findBracketSpace(0)).toBe(1160000);
  });

  it('returns remaining space in current bracket', () => {
    // $5,000 in first bracket (max $11,600): remaining = $6,600
    expect(findBracketSpace(500000)).toBe(660000);
  });

  it('returns Infinity for top bracket', () => {
    expect(findBracketSpace(100000000)).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// Withdrawal plan generation
// ---------------------------------------------------------------------------

describe('generateWithdrawalPlan', () => {
  const baseAccounts: RetirementAccount[] = [
    { id: '1', name: '401k', balanceCents: 500000_00, taxType: 'traditional', ownerAge: 65 },
    { id: '2', name: 'Roth IRA', balanceCents: 200000_00, taxType: 'roth', ownerAge: 65 },
    { id: '3', name: 'Brokerage', balanceCents: 100000_00, taxType: 'taxable', ownerAge: 65 },
  ];

  it('returns empty plan when endAge <= currentAge', () => {
    const input: WithdrawalOptimizerInput = {
      accounts: baseAccounts,
      annualNeedCents: 50000_00,
      startYear: 2025,
      currentAge: 65,
      endAge: 65,
      annualReturnRate: 0.05,
      strategy: 'traditional-first',
    };
    const plan = generateWithdrawalPlan(input);
    expect(plan.years).toHaveLength(0);
    expect(plan.exhaustionAge).toBeNull();
  });

  it('generates year-by-year plan with traditional-first strategy', () => {
    const input: WithdrawalOptimizerInput = {
      accounts: baseAccounts,
      annualNeedCents: 50000_00,
      startYear: 2025,
      currentAge: 65,
      endAge: 70,
      annualReturnRate: 0.05,
      strategy: 'traditional-first',
    };
    const plan = generateWithdrawalPlan(input);

    expect(plan.strategy).toBe('traditional-first');
    expect(plan.years).toHaveLength(5);
    expect(plan.years[0]!.age).toBe(65);
    expect(plan.years[0]!.year).toBe(2025);

    // Traditional-first: should withdraw from traditional first
    expect(plan.years[0]!.traditionalCents).toBeGreaterThan(0);
    expect(plan.totalWithdrawnCents).toBeGreaterThan(0);
  });

  it('generates plan with proportional strategy', () => {
    const input: WithdrawalOptimizerInput = {
      accounts: baseAccounts,
      annualNeedCents: 50000_00,
      startYear: 2025,
      currentAge: 65,
      endAge: 70,
      annualReturnRate: 0.05,
      strategy: 'proportional',
    };
    const plan = generateWithdrawalPlan(input);

    // Proportional should distribute across account types
    const firstYear = plan.years[0]!;
    expect(firstYear.totalCents).toBe(50000_00);
  });

  it('enforces RMD withdrawals at age 73+', () => {
    const olderAccounts: RetirementAccount[] = [
      { id: '1', name: '401k', balanceCents: 1000000_00, taxType: 'traditional', ownerAge: 73 },
      { id: '2', name: 'Roth', balanceCents: 200000_00, taxType: 'roth', ownerAge: 73 },
    ];
    const input: WithdrawalOptimizerInput = {
      accounts: olderAccounts,
      annualNeedCents: 30000_00,
      startYear: 2025,
      currentAge: 73,
      endAge: 76,
      annualReturnRate: 0.05,
      strategy: 'roth-first',
    };
    const plan = generateWithdrawalPlan(input);

    // Even with roth-first strategy, RMD should be taken from traditional
    expect(plan.years[0]!.rmdCents).toBeGreaterThan(0);
    expect(plan.years[0]!.traditionalCents).toBeGreaterThanOrEqual(plan.years[0]!.rmdCents);
  });

  it('calculates estimated tax on withdrawals', () => {
    const input: WithdrawalOptimizerInput = {
      accounts: baseAccounts,
      annualNeedCents: 50000_00,
      startYear: 2025,
      currentAge: 65,
      endAge: 67,
      annualReturnRate: 0.05,
      strategy: 'traditional-first',
    };
    const plan = generateWithdrawalPlan(input);

    expect(plan.totalTaxCents).toBeGreaterThan(0);
    expect(plan.years[0]!.afterTaxCents).toBeLessThan(plan.years[0]!.totalCents);
  });

  it('tracks remaining balances with growth', () => {
    const input: WithdrawalOptimizerInput = {
      accounts: [
        { id: '1', name: '401k', balanceCents: 100000_00, taxType: 'traditional', ownerAge: 65 },
      ],
      annualNeedCents: 10000_00,
      startYear: 2025,
      currentAge: 65,
      endAge: 67,
      annualReturnRate: 0.05,
      strategy: 'traditional-first',
    };
    const plan = generateWithdrawalPlan(input);

    // After year 1: (100000 - 10000) * 1.05 = 94500
    expect(plan.years[0]!.remainingTraditionalCents).toBe(9450000);
  });
});

// ---------------------------------------------------------------------------
// Roth Conversion Ladder
// ---------------------------------------------------------------------------

describe('analyzeRothConversionLadder', () => {
  it('returns empty for zero balance', () => {
    expect(analyzeRothConversionLadder(0, 55, 65)).toHaveLength(0);
  });

  it('returns empty when retirement age <= current age', () => {
    expect(analyzeRothConversionLadder(500000_00, 65, 60)).toHaveLength(0);
  });

  it('generates conversion plan filling lower brackets', () => {
    const conversions = analyzeRothConversionLadder(500000_00, 55, 65, 0, 0.22);

    expect(conversions.length).toBeGreaterThan(0);
    for (const c of conversions) {
      expect(c.conversionCents).toBeGreaterThan(0);
      expect(c.taxCostCents).toBeGreaterThanOrEqual(0);
      expect(c.bracketSpaceCents).toBeGreaterThan(0);
    }
  });

  it('accounts for other income reducing bracket space', () => {
    const withoutIncome = analyzeRothConversionLadder(500000_00, 55, 65, 0, 0.22);
    const withIncome = analyzeRothConversionLadder(500000_00, 55, 65, 3000000, 0.22);

    // With other income, less bracket space available
    if (withoutIncome.length > 0 && withIncome.length > 0) {
      expect(withIncome[0]!.conversionCents).toBeLessThan(withoutIncome[0]!.conversionCents);
    }
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('RMD_START_AGE is 73', () => {
    expect(RMD_START_AGE).toBe(73);
  });

  it('federal brackets are ordered and cover all income', () => {
    for (let i = 1; i < FEDERAL_TAX_BRACKETS_2024.length; i++) {
      expect(FEDERAL_TAX_BRACKETS_2024[i]!.minCents).toBe(
        FEDERAL_TAX_BRACKETS_2024[i - 1]!.maxCents,
      );
      expect(FEDERAL_TAX_BRACKETS_2024[i]!.rate).toBeGreaterThan(
        FEDERAL_TAX_BRACKETS_2024[i - 1]!.rate,
      );
    }
    expect(FEDERAL_TAX_BRACKETS_2024[FEDERAL_TAX_BRACKETS_2024.length - 1]!.maxCents).toBe(
      Infinity,
    );
  });
});
