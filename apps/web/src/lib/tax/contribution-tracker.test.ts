// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  ContributionAccountType,
  CONTRIBUTION_LIMITS_2024,
  getContributionLimit,
  isCatchUpEligible,
  getEffectiveLimit,
  calculateYTDContributions,
  getContributionStatus,
  getCombinedIRAStatus,
  generateContributionSummary,
  type Contribution,
} from './contribution-tracker';

describe('contribution-tracker', () => {
  // -----------------------------------------------------------------------
  // Constants verification
  // -----------------------------------------------------------------------
  describe('CONTRIBUTION_LIMITS_2024', () => {
    it('has correct IRA base limit ($7,000)', () => {
      const ira = CONTRIBUTION_LIMITS_2024.find(
        (l) => l.accountType === ContributionAccountType.TRADITIONAL_IRA,
      );
      expect(ira?.baseLimit).toBe(7_000_00);
      expect(ira?.catchUpLimit).toBe(1_000_00);
    });

    it('has correct 401k limit ($23,000)', () => {
      const k401 = CONTRIBUTION_LIMITS_2024.find(
        (l) => l.accountType === ContributionAccountType.FOUR01K,
      );
      expect(k401?.baseLimit).toBe(23_000_00);
      expect(k401?.catchUpLimit).toBe(7_500_00);
    });

    it('has correct HSA individual limit ($4,150)', () => {
      const hsa = CONTRIBUTION_LIMITS_2024.find(
        (l) => l.accountType === ContributionAccountType.HSA_INDIVIDUAL,
      );
      expect(hsa?.baseLimit).toBe(4_150_00);
    });

    it('has correct HSA family limit ($8,300)', () => {
      const hsa = CONTRIBUTION_LIMITS_2024.find(
        (l) => l.accountType === ContributionAccountType.HSA_FAMILY,
      );
      expect(hsa?.baseLimit).toBe(8_300_00);
    });

    it('has correct FSA limit ($3,200)', () => {
      const fsa = CONTRIBUTION_LIMITS_2024.find(
        (l) => l.accountType === ContributionAccountType.FSA,
      );
      expect(fsa?.baseLimit).toBe(3_200_00);
      expect(fsa?.catchUpLimit).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getContributionLimit
  // -----------------------------------------------------------------------
  describe('getContributionLimit', () => {
    it('returns limit for 2024', () => {
      const limit = getContributionLimit(ContributionAccountType.FOUR01K, 2024);
      expect(limit).not.toBeNull();
      expect(limit?.baseLimit).toBe(23_000_00);
    });

    it('returns null for unsupported year', () => {
      const limit = getContributionLimit(ContributionAccountType.FOUR01K, 2025);
      expect(limit).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // isCatchUpEligible
  // -----------------------------------------------------------------------
  describe('isCatchUpEligible', () => {
    it('age 50+ eligible for IRA catch-up', () => {
      expect(isCatchUpEligible(50, ContributionAccountType.TRADITIONAL_IRA)).toBe(true);
    });

    it('age 49 not eligible for IRA catch-up', () => {
      expect(isCatchUpEligible(49, ContributionAccountType.TRADITIONAL_IRA)).toBe(false);
    });

    it('age 55+ eligible for HSA catch-up', () => {
      expect(isCatchUpEligible(55, ContributionAccountType.HSA_INDIVIDUAL)).toBe(true);
    });

    it('age 54 not eligible for HSA catch-up', () => {
      expect(isCatchUpEligible(54, ContributionAccountType.HSA_INDIVIDUAL)).toBe(false);
    });

    it('FSA has no catch-up (returns false)', () => {
      expect(isCatchUpEligible(65, ContributionAccountType.FSA)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getEffectiveLimit
  // -----------------------------------------------------------------------
  describe('getEffectiveLimit', () => {
    it('IRA under 50: $7,000', () => {
      expect(getEffectiveLimit(ContributionAccountType.TRADITIONAL_IRA, 45)).toBe(7_000_00);
    });

    it('IRA age 50+: $8,000 (base + catch-up)', () => {
      expect(getEffectiveLimit(ContributionAccountType.TRADITIONAL_IRA, 50)).toBe(8_000_00);
    });

    it('401k under 50: $23,000', () => {
      expect(getEffectiveLimit(ContributionAccountType.FOUR01K, 45)).toBe(23_000_00);
    });

    it('401k age 50+: $30,500 (base + catch-up)', () => {
      expect(getEffectiveLimit(ContributionAccountType.FOUR01K, 55)).toBe(30_500_00);
    });

    it('HSA family age 55+: $9,300', () => {
      expect(getEffectiveLimit(ContributionAccountType.HSA_FAMILY, 55)).toBe(9_300_00);
    });

    it('FSA any age: $3,200 (no catch-up)', () => {
      expect(getEffectiveLimit(ContributionAccountType.FSA, 65)).toBe(3_200_00);
    });

    it('returns 0 for unsupported year', () => {
      expect(getEffectiveLimit(ContributionAccountType.FOUR01K, 45, 2025)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // calculateYTDContributions
  // -----------------------------------------------------------------------
  describe('calculateYTDContributions', () => {
    const contributions: Contribution[] = [
      {
        accountType: ContributionAccountType.FOUR01K,
        amount: 1_917_00,
        date: '2024-01-15',
      },
      {
        accountType: ContributionAccountType.FOUR01K,
        amount: 1_917_00,
        date: '2024-02-15',
      },
      {
        accountType: ContributionAccountType.FOUR01K,
        amount: 1_917_00,
        date: '2024-03-15',
      },
      {
        accountType: ContributionAccountType.TRADITIONAL_IRA,
        amount: 500_00,
        date: '2024-01-10',
      },
      {
        accountType: ContributionAccountType.FOUR01K,
        amount: 1_000_00,
        date: '2023-12-15',
      },
    ];

    it('sums only matching account type and year', () => {
      const ytd = calculateYTDContributions(contributions, ContributionAccountType.FOUR01K, 2024);
      expect(ytd).toBe(5_751_00); // 3 * $1,917
    });

    it('excludes prior year contributions', () => {
      const ytd = calculateYTDContributions(contributions, ContributionAccountType.FOUR01K, 2023);
      expect(ytd).toBe(1_000_00);
    });

    it('returns 0 when no matching contributions', () => {
      const ytd = calculateYTDContributions(contributions, ContributionAccountType.FSA, 2024);
      expect(ytd).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getContributionStatus
  // -----------------------------------------------------------------------
  describe('getContributionStatus', () => {
    it('calculates remaining room correctly', () => {
      const contributions: Contribution[] = [
        {
          accountType: ContributionAccountType.FOUR01K,
          amount: 15_000_00,
          date: '2024-06-01',
        },
      ];

      const status = getContributionStatus(contributions, ContributionAccountType.FOUR01K, 45);

      expect(status.annualLimit).toBe(23_000_00);
      expect(status.ytdContributions).toBe(15_000_00);
      expect(status.remainingRoom).toBe(8_000_00);
      expect(status.catchUpEligible).toBe(false);
      expect(status.isOverLimit).toBe(false);
      expect(status.percentUsed).toBe(65); // 15000/23000 ≈ 65%
    });

    it('detects over-limit contributions', () => {
      const contributions: Contribution[] = [
        {
          accountType: ContributionAccountType.TRADITIONAL_IRA,
          amount: 8_000_00,
          date: '2024-03-01',
        },
      ];

      const status = getContributionStatus(
        contributions,
        ContributionAccountType.TRADITIONAL_IRA,
        45,
      );

      expect(status.annualLimit).toBe(7_000_00);
      expect(status.isOverLimit).toBe(true);
      expect(status.remainingRoom).toBe(0);
    });

    it('includes catch-up for age 50+', () => {
      const status = getContributionStatus([], ContributionAccountType.FOUR01K, 52);

      expect(status.annualLimit).toBe(30_500_00);
      expect(status.catchUpEligible).toBe(true);
      expect(status.catchUpAmount).toBe(7_500_00);
    });
  });

  // -----------------------------------------------------------------------
  // getCombinedIRAStatus
  // -----------------------------------------------------------------------
  describe('getCombinedIRAStatus', () => {
    it('combines Traditional and Roth IRA contributions', () => {
      const contributions: Contribution[] = [
        {
          accountType: ContributionAccountType.TRADITIONAL_IRA,
          amount: 3_000_00,
          date: '2024-02-01',
        },
        {
          accountType: ContributionAccountType.ROTH_IRA,
          amount: 3_000_00,
          date: '2024-03-01',
        },
      ];

      const status = getCombinedIRAStatus(contributions, 45);

      expect(status.annualLimit).toBe(7_000_00);
      expect(status.ytdContributions).toBe(6_000_00);
      expect(status.remainingRoom).toBe(1_000_00);
    });

    it('detects over-limit across both IRA types', () => {
      const contributions: Contribution[] = [
        {
          accountType: ContributionAccountType.TRADITIONAL_IRA,
          amount: 4_000_00,
          date: '2024-01-15',
        },
        {
          accountType: ContributionAccountType.ROTH_IRA,
          amount: 4_000_00,
          date: '2024-04-15',
        },
      ];

      const status = getCombinedIRAStatus(contributions, 45);

      expect(status.isOverLimit).toBe(true);
      expect(status.ytdContributions).toBe(8_000_00);
    });

    it('allows $8,000 combined with catch-up at age 50', () => {
      const contributions: Contribution[] = [
        {
          accountType: ContributionAccountType.TRADITIONAL_IRA,
          amount: 4_000_00,
          date: '2024-01-15',
        },
        {
          accountType: ContributionAccountType.ROTH_IRA,
          amount: 4_000_00,
          date: '2024-04-15',
        },
      ];

      const status = getCombinedIRAStatus(contributions, 50);

      expect(status.annualLimit).toBe(8_000_00);
      expect(status.isOverLimit).toBe(false);
      expect(status.remainingRoom).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateContributionSummary
  // -----------------------------------------------------------------------
  describe('generateContributionSummary', () => {
    it('generates summary for all account types', () => {
      const contributions: Contribution[] = [
        {
          accountType: ContributionAccountType.FOUR01K,
          amount: 10_000_00,
          date: '2024-06-01',
        },
        {
          accountType: ContributionAccountType.HSA_INDIVIDUAL,
          amount: 2_000_00,
          date: '2024-03-01',
        },
      ];

      const summary = generateContributionSummary(contributions, 40);

      expect(summary.year).toBe(2024);
      expect(summary.accounts).toHaveLength(7); // All account types
      expect(summary.totalContributions).toBe(12_000_00);
      expect(summary.totalRemainingRoom).toBeGreaterThan(0);
    });

    it('empty contributions shows full room', () => {
      const summary = generateContributionSummary([], 45);

      expect(summary.totalContributions).toBe(0);
      // Total of all base limits
      const totalLimits = CONTRIBUTION_LIMITS_2024.reduce((sum, l) => sum + l.baseLimit, 0);
      expect(summary.totalRemainingRoom).toBe(totalLimits);
    });
  });
});
