// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { ComplianceStatus, ExpatFilingStatus } from './types';
import type { ExpatAccount } from './types';
import {
  convertToUsdCents,
  evaluateFBAR,
  evaluateFATCA,
  calculateFEIE,
  estimateForeignTaxCredit,
  daysUntilFBARDeadline,
  generateAccountAlert,
  buildComplianceDashboard,
} from './expat-tax';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeExpatAccount(overrides: Partial<ExpatAccount> = {}): ExpatAccount {
  return {
    id: 'fa-1',
    institutionName: 'Deutsche Bank',
    country: 'DE',
    currencyCode: 'EUR',
    balanceForeignCents: 5_000_00,
    balanceUsdCents: 5_500_00,
    maxBalanceUsdCents: 7_000_00,
    accountType: 'Savings',
    isJoint: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expat-tax', () => {
  describe('convertToUsdCents', () => {
    it('converts foreign cents to USD cents using exchange rate', () => {
      // 1000.00 EUR at 1.08 rate = $1,080.00
      expect(convertToUsdCents(100_000, 1.08)).toBe(108_000);
    });

    it('handles 1:1 rate', () => {
      expect(convertToUsdCents(50_000, 1.0)).toBe(50_000);
    });

    it('returns 0 for zero exchange rate', () => {
      expect(convertToUsdCents(50_000, 0)).toBe(0);
    });

    it('returns 0 for negative exchange rate', () => {
      expect(convertToUsdCents(50_000, -1.5)).toBe(0);
    });

    it('uses banker rounding for fractional cents', () => {
      // 100 * 1.005 = 100.5 → bankers round to 100 (even)
      expect(convertToUsdCents(100, 1.005)).toBe(100);
      // 200 * 1.025 = 205.0 → exact, no rounding needed
      expect(convertToUsdCents(200, 1.025)).toBe(205);
      // 333 * 1.1 = 366.3 → floor to 366
      expect(convertToUsdCents(333, 1.1)).toBe(366);
    });
  });

  describe('evaluateFBAR', () => {
    it('requires filing when aggregate max exceeds $10,000', () => {
      const accounts = [
        makeExpatAccount({ maxBalanceUsdCents: 6_000_00 }),
        makeExpatAccount({ id: 'fa-2', maxBalanceUsdCents: 5_000_00 }),
      ];
      const result = evaluateFBAR(accounts, 2024);
      expect(result.filingRequired).toBe(true);
      expect(result.aggregateMaxBalanceCents).toBe(11_000_00);
      expect(result.thresholdCents).toBe(10_000_00);
      expect(result.reportableAccountCount).toBe(2);
    });

    it('does not require filing when under $10,000', () => {
      const accounts = [makeExpatAccount({ maxBalanceUsdCents: 4_000_00 })];
      const result = evaluateFBAR(accounts, 2024);
      expect(result.filingRequired).toBe(false);
    });

    it('does not require filing at exactly $10,000', () => {
      const accounts = [makeExpatAccount({ maxBalanceUsdCents: 10_000_00 })];
      const result = evaluateFBAR(accounts, 2024);
      expect(result.filingRequired).toBe(false);
    });

    it('sets correct deadlines', () => {
      const result = evaluateFBAR([makeExpatAccount()], 2024);
      expect(result.filingDeadline).toBe('2025-04-15');
      expect(result.extendedDeadline).toBe('2025-10-15');
    });

    it('handles empty accounts', () => {
      const result = evaluateFBAR([], 2024);
      expect(result.filingRequired).toBe(false);
      expect(result.aggregateMaxBalanceCents).toBe(0);
      expect(result.reportableAccountCount).toBe(0);
    });
  });

  describe('evaluateFATCA', () => {
    it('requires filing when end-of-year exceeds threshold (single, US resident)', () => {
      const accounts = [makeExpatAccount({ balanceUsdCents: 55_000_00 })];
      const result = evaluateFATCA(accounts, ExpatFilingStatus.SINGLE, false);
      expect(result.filingRequired).toBe(true);
      expect(result.endOfYearThresholdCents).toBe(50_000_00);
    });

    it('does not require filing when under threshold', () => {
      const accounts = [makeExpatAccount({ balanceUsdCents: 30_000_00 })];
      const result = evaluateFATCA(accounts, ExpatFilingStatus.SINGLE, false);
      expect(result.filingRequired).toBe(false);
    });

    it('uses higher thresholds for MFJ', () => {
      const accounts = [makeExpatAccount({ balanceUsdCents: 80_000_00 })];
      const result = evaluateFATCA(accounts, ExpatFilingStatus.MARRIED_FILING_JOINTLY, false);
      expect(result.filingRequired).toBe(false);
      expect(result.endOfYearThresholdCents).toBe(100_000_00);
    });

    it('uses abroad thresholds when residing abroad', () => {
      const accounts = [makeExpatAccount({ balanceUsdCents: 150_000_00 })];
      const result = evaluateFATCA(accounts, ExpatFilingStatus.SINGLE, true);
      expect(result.filingRequired).toBe(false);
      expect(result.endOfYearThresholdCents).toBe(200_000_00);
    });

    it('triggers on mid-year max even if EOY is under', () => {
      const accounts = [
        makeExpatAccount({
          balanceUsdCents: 40_000_00,
          maxBalanceUsdCents: 80_000_00,
        }),
      ];
      const result = evaluateFATCA(accounts, ExpatFilingStatus.SINGLE, false);
      // EOY: 40k < 50k threshold, but mid-year 80k > 75k threshold
      expect(result.filingRequired).toBe(true);
    });
  });

  describe('calculateFEIE', () => {
    it('excludes up to $126,500 for 2024', () => {
      const result = calculateFEIE(150_000_00, 2024);
      expect(result.maxExclusionCents).toBe(126_500_00);
      expect(result.excludedAmountCents).toBe(126_500_00);
      expect(result.taxableRemainderCents).toBe(23_500_00);
    });

    it('excludes full income if under max', () => {
      const result = calculateFEIE(100_000_00, 2024);
      expect(result.excludedAmountCents).toBe(100_000_00);
      expect(result.taxableRemainderCents).toBe(0);
    });

    it('handles zero income', () => {
      const result = calculateFEIE(0, 2024);
      expect(result.excludedAmountCents).toBe(0);
      expect(result.taxableRemainderCents).toBe(0);
    });

    it('handles negative income (clamps to zero)', () => {
      const result = calculateFEIE(-50_000_00, 2024);
      expect(result.excludedAmountCents).toBe(0);
      expect(result.taxableRemainderCents).toBe(0);
    });
  });

  describe('estimateForeignTaxCredit', () => {
    it('calculates usable credit within limit', () => {
      const result = estimateForeignTaxCredit(
        5_000_00, // foreign taxes paid
        50_000_00, // foreign source income
        100_000_00, // worldwide income
        20_000_00, // US tax liability
      );
      // Limit: (50k / 100k) * 20k = 10k
      expect(result.creditLimitCents).toBe(10_000_00);
      expect(result.usableCreditCents).toBe(5_000_00);
      expect(result.excessCreditCents).toBe(0);
    });

    it('caps credit at the limit', () => {
      const result = estimateForeignTaxCredit(15_000_00, 50_000_00, 100_000_00, 20_000_00);
      expect(result.usableCreditCents).toBe(10_000_00);
      expect(result.excessCreditCents).toBe(5_000_00);
    });

    it('handles divide-by-zero on worldwide income', () => {
      const result = estimateForeignTaxCredit(5_000_00, 50_000_00, 0, 20_000_00);
      expect(result.creditLimitCents).toBe(0);
      expect(result.usableCreditCents).toBe(0);
      expect(result.excessCreditCents).toBe(5_000_00);
    });

    it('handles zero US tax liability', () => {
      const result = estimateForeignTaxCredit(5_000_00, 50_000_00, 100_000_00, 0);
      expect(result.creditLimitCents).toBe(0);
      expect(result.usableCreditCents).toBe(0);
      expect(result.excessCreditCents).toBe(5_000_00);
    });

    it('caps ratio at 1.0 when foreign > worldwide', () => {
      const result = estimateForeignTaxCredit(
        5_000_00,
        200_000_00, // foreign > worldwide (unusual but possible)
        100_000_00,
        20_000_00,
      );
      // Ratio capped at 1.0, so limit = 20,000
      expect(result.creditLimitCents).toBe(20_000_00);
      expect(result.usableCreditCents).toBe(5_000_00);
    });
  });

  describe('daysUntilFBARDeadline', () => {
    it('calculates days until April 15 deadline', () => {
      const days = daysUntilFBARDeadline(2024, '2025-01-01', false);
      // Jan 1 to Apr 15 = 104 days
      expect(days).toBe(104);
    });

    it('calculates days until extended October 15 deadline', () => {
      const days = daysUntilFBARDeadline(2024, '2025-01-01', true);
      // Jan 1 to Oct 15 = 287 days
      expect(days).toBe(287);
    });

    it('returns negative when past due', () => {
      const days = daysUntilFBARDeadline(2024, '2025-05-01', false);
      expect(days).toBeLessThan(0);
    });
  });

  describe('generateAccountAlert', () => {
    it('returns ACTION_REQUIRED when both FBAR and FATCA required', () => {
      const alert = generateAccountAlert(makeExpatAccount(), true, true, 2024);
      expect(alert.status).toBe(ComplianceStatus.ACTION_REQUIRED);
      expect(alert.requiredAction).toContain('FBAR');
      expect(alert.requiredAction).toContain('Form 8938');
    });

    it('returns ACTION_REQUIRED for FBAR only', () => {
      const alert = generateAccountAlert(makeExpatAccount(), true, false, 2024);
      expect(alert.status).toBe(ComplianceStatus.ACTION_REQUIRED);
      expect(alert.requiredAction).toContain('FinCEN 114');
    });

    it('returns WARNING for FATCA only', () => {
      const alert = generateAccountAlert(makeExpatAccount(), false, true, 2024);
      expect(alert.status).toBe(ComplianceStatus.WARNING);
    });

    it('returns COMPLIANT when no filing required', () => {
      const alert = generateAccountAlert(makeExpatAccount(), false, false, 2024);
      expect(alert.status).toBe(ComplianceStatus.COMPLIANT);
      expect(alert.requiredAction).toBeNull();
      expect(alert.deadline).toBeNull();
    });
  });

  describe('buildComplianceDashboard', () => {
    it('builds full dashboard with FBAR + FATCA triggers', () => {
      const accounts = [
        makeExpatAccount({
          balanceUsdCents: 60_000_00,
          maxBalanceUsdCents: 80_000_00,
        }),
      ];
      const dashboard = buildComplianceDashboard(
        accounts,
        ExpatFilingStatus.SINGLE,
        false,
        2024,
        150_000_00,
        20_000_00,
        200_000_00,
        30_000_00,
      );

      expect(dashboard.overallStatus).toBe(ComplianceStatus.ACTION_REQUIRED);
      expect(dashboard.fbar.filingRequired).toBe(true);
      expect(dashboard.fatca.filingRequired).toBe(true);
      expect(dashboard.feie).not.toBeNull();
      expect(dashboard.feie!.excludedAmountCents).toBe(126_500_00);
      expect(dashboard.foreignTaxCredit).not.toBeNull();
      expect(dashboard.alerts).toHaveLength(1);
    });

    it('builds dashboard with no filing requirements', () => {
      const accounts = [makeExpatAccount({ maxBalanceUsdCents: 3_000_00 })];
      const dashboard = buildComplianceDashboard(accounts, ExpatFilingStatus.SINGLE, false, 2024);
      expect(dashboard.overallStatus).toBe(ComplianceStatus.COMPLIANT);
      expect(dashboard.fbar.filingRequired).toBe(false);
      expect(dashboard.fatca.filingRequired).toBe(false);
      expect(dashboard.feie).toBeNull();
      expect(dashboard.foreignTaxCredit).toBeNull();
    });

    it('handles empty accounts', () => {
      const dashboard = buildComplianceDashboard([], ExpatFilingStatus.SINGLE, false, 2024);
      expect(dashboard.overallStatus).toBe(ComplianceStatus.COMPLIANT);
      expect(dashboard.alerts).toHaveLength(0);
    });

    it('includes FEIE when foreign income is provided', () => {
      const dashboard = buildComplianceDashboard(
        [makeExpatAccount()],
        ExpatFilingStatus.SINGLE,
        true,
        2024,
        100_000_00,
      );
      expect(dashboard.feie).not.toBeNull();
      expect(dashboard.feie!.excludedAmountCents).toBe(100_000_00);
    });

    it('includes FTC when foreign taxes and worldwide income provided', () => {
      const dashboard = buildComplianceDashboard(
        [makeExpatAccount()],
        ExpatFilingStatus.SINGLE,
        false,
        2024,
        null,
        10_000_00,
        200_000_00,
        40_000_00,
      );
      expect(dashboard.foreignTaxCredit).not.toBeNull();
    });
  });
});
