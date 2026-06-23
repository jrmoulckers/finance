// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the ITIN-aware newcomer onboarding tailoring logic.
 *
 * References: issue #2178
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NEWCOMER_PROFILE,
  INCOME_TYPES,
  TAX_ID_STATUSES,
  getNewcomerGuidance,
  isIncomeType,
  isTaxIdStatus,
  type IncomeType,
  type TaxIdStatus,
} from './newcomer-tax-profile';

describe('getNewcomerGuidance', () => {
  it('returns a safe generic default when nothing is specified', () => {
    const guidance = getNewcomerGuidance(DEFAULT_NEWCOMER_PROFILE);

    expect(guidance.explainers).toEqual(['w2', 'form1099', 'taxWithholding']);
    expect(guidance.explainers).not.toContain('itinBasics');
    expect(guidance.tips.length).toBeGreaterThan(0);
    expect(guidance.summary).toMatch(/general money basics/i);
    expect(guidance.summary).toMatch(/nothing is ever shared/i);
  });

  it('treats an empty profile the same as fully unspecified', () => {
    expect(getNewcomerGuidance({})).toEqual(getNewcomerGuidance(DEFAULT_NEWCOMER_PROFILE));
  });

  it('surfaces the ITIN explainer and ITIN-specific tips when ITIN is chosen', () => {
    const guidance = getNewcomerGuidance({ taxIdStatus: 'itin', incomeType: '1099' });

    expect(guidance.explainers).toEqual(['form1099', 'taxWithholding', 'itinBasics']);
    expect(guidance.tips.some((tip) => /itin/i.test(tip))).toBe(true);
    expect(guidance.tips.some((tip) => /quarter to a third/i.test(tip))).toBe(true);
  });

  it('surfaces the 401(k) explainer for W-2 SSN workers', () => {
    const guidance = getNewcomerGuidance({ taxIdStatus: 'ssn', incomeType: 'w2' });

    expect(guidance.explainers).toEqual(['w2', 'taxWithholding', 'retirement401k']);
    expect(guidance.explainers).not.toContain('itinBasics');
    expect(guidance.tips.some((tip) => /401\(k\)/i.test(tip))).toBe(true);
  });

  it('tailors hourly income tips around the lowest expected hours', () => {
    const guidance = getNewcomerGuidance({ taxIdStatus: 'none', incomeType: 'hourly' });

    expect(guidance.explainers).toEqual(['w2', 'taxWithholding']);
    expect(guidance.tips.some((tip) => /lowest expected hours/i.test(tip))).toBe(true);
  });

  it('covers seasonal income with buffer-building guidance', () => {
    const guidance = getNewcomerGuidance({ taxIdStatus: 'unspecified', incomeType: 'seasonal' });

    expect(guidance.explainers).toEqual(['w2', 'form1099', 'taxWithholding']);
    expect(guidance.tips.some((tip) => /busy months/i.test(tip))).toBe(true);
  });

  it('combines every relevant explainer for ITIN holders with mixed income', () => {
    const guidance = getNewcomerGuidance({ taxIdStatus: 'itin', incomeType: 'mixed' });

    expect(guidance.explainers).toEqual([
      'w2',
      'form1099',
      'taxWithholding',
      'retirement401k',
      'itinBasics',
    ]);
  });

  it('never repeats a tip even when sources overlap', () => {
    const guidance = getNewcomerGuidance({ taxIdStatus: 'ssn', incomeType: 'mixed' });
    const unique = new Set(guidance.tips);

    expect(unique.size).toBe(guidance.tips.length);
  });

  it('always returns explainers in canonical order for every combination', () => {
    const canonicalRank = (key: string) =>
      ['w2', 'form1099', 'taxWithholding', 'retirement401k', 'itinBasics'].indexOf(key);

    for (const taxIdStatus of TAX_ID_STATUSES) {
      for (const incomeType of INCOME_TYPES) {
        const { explainers, tips } = getNewcomerGuidance({ taxIdStatus, incomeType });
        const ranks = explainers.map(canonicalRank);
        const sorted = [...ranks].sort((a, b) => a - b);

        expect(ranks).toEqual(sorted);
        expect(tips.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('type guards', () => {
  it('recognises valid tax-ID statuses', () => {
    (['ssn', 'itin', 'none', 'unspecified'] satisfies TaxIdStatus[]).forEach((value) => {
      expect(isTaxIdStatus(value)).toBe(true);
    });
    expect(isTaxIdStatus('passport')).toBe(false);
  });

  it('recognises valid income types', () => {
    (['w2', '1099', 'hourly', 'seasonal', 'mixed', 'unspecified'] satisfies IncomeType[]).forEach(
      (value) => {
        expect(isIncomeType(value)).toBe(true);
      },
    );
    expect(isIncomeType('salary')).toBe(false);
  });
});
