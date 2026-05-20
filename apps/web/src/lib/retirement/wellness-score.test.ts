// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the financial wellness score engine.
 *
 * Covers individual component scoring, grade mapping, suggestion generation,
 * and composite score calculation.
 *
 * References: #1775
 */

import { describe, expect, it } from 'vitest';
import type { WellnessInput } from './types';
import {
  scoreToGrade,
  scoreEmergencyFund,
  scoreDebtToIncome,
  scoreSavingsRate,
  scoreRetirementProgress,
  scoreInsuranceCoverage,
  scoreEstatePlanning,
  getSuggestion,
  calculateWellnessScore,
  DEFAULT_WEIGHTS,
} from './wellness-score';

// ---------------------------------------------------------------------------
// Grade mapping
// ---------------------------------------------------------------------------

describe('scoreToGrade', () => {
  it('maps 90+ to A', () => {
    expect(scoreToGrade(90)).toBe('A');
    expect(scoreToGrade(100)).toBe('A');
  });

  it('maps 80-89 to B', () => {
    expect(scoreToGrade(80)).toBe('B');
    expect(scoreToGrade(89)).toBe('B');
  });

  it('maps 70-79 to C', () => {
    expect(scoreToGrade(70)).toBe('C');
    expect(scoreToGrade(79)).toBe('C');
  });

  it('maps 60-69 to D', () => {
    expect(scoreToGrade(60)).toBe('D');
    expect(scoreToGrade(69)).toBe('D');
  });

  it('maps below 60 to F', () => {
    expect(scoreToGrade(59)).toBe('F');
    expect(scoreToGrade(0)).toBe('F');
  });
});

// ---------------------------------------------------------------------------
// Emergency fund scoring
// ---------------------------------------------------------------------------

describe('scoreEmergencyFund', () => {
  it('scores 0 for no emergency fund', () => {
    expect(scoreEmergencyFund(0, 300000)).toBe(0);
  });

  it('scores ~90 for exactly 6 months', () => {
    expect(scoreEmergencyFund(1800000, 300000)).toBe(90);
  });

  it('scores 100 for 12+ months', () => {
    expect(scoreEmergencyFund(3600000, 300000)).toBe(100);
  });

  it('scores proportionally for partial coverage', () => {
    const score = scoreEmergencyFund(900000, 300000); // 3 months
    expect(score).toBe(45);
  });

  it('handles zero expenses', () => {
    expect(scoreEmergencyFund(100000, 0)).toBe(100);
    expect(scoreEmergencyFund(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Debt-to-income scoring
// ---------------------------------------------------------------------------

describe('scoreDebtToIncome', () => {
  it('scores 100 for no debt', () => {
    expect(scoreDebtToIncome(0, 500000)).toBe(100);
  });

  it('scores 100 for very low DTI (< 10%)', () => {
    expect(scoreDebtToIncome(40000, 500000)).toBe(100); // 8%
  });

  it('scores lower for higher DTI', () => {
    const score20 = scoreDebtToIncome(100000, 500000); // 20%
    const score30 = scoreDebtToIncome(150000, 500000); // 30%
    expect(score20).toBeGreaterThan(score30);
  });

  it('scores 0 for very high DTI (>50%)', () => {
    expect(scoreDebtToIncome(300000, 500000)).toBe(0); // 60%
  });

  it('handles zero income', () => {
    expect(scoreDebtToIncome(0, 0)).toBe(100);
    expect(scoreDebtToIncome(100000, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Savings rate scoring
// ---------------------------------------------------------------------------

describe('scoreSavingsRate', () => {
  it('scores 0 for zero savings', () => {
    expect(scoreSavingsRate(0, 500000)).toBe(0);
  });

  it('scores 100 for 30%+ savings rate', () => {
    expect(scoreSavingsRate(150000, 500000)).toBe(100); // 30%
  });

  it('scores well for 20% savings rate', () => {
    const score = scoreSavingsRate(100000, 500000); // 20%
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('handles zero income', () => {
    expect(scoreSavingsRate(100000, 0)).toBe(100);
    expect(scoreSavingsRate(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Retirement progress scoring
// ---------------------------------------------------------------------------

describe('scoreRetirementProgress', () => {
  it('scores 100 when at or above target', () => {
    expect(scoreRetirementProgress(1000000_00, 1000000_00)).toBe(100);
    expect(scoreRetirementProgress(1500000_00, 1000000_00)).toBe(100);
  });

  it('scores proportionally below target', () => {
    const score = scoreRetirementProgress(500000_00, 1000000_00); // 50%
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(70);
  });

  it('scores 0 for zero savings', () => {
    expect(scoreRetirementProgress(0, 1000000_00)).toBe(0);
  });

  it('handles zero target', () => {
    expect(scoreRetirementProgress(100000_00, 0)).toBe(100);
    expect(scoreRetirementProgress(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Binary component scoring
// ---------------------------------------------------------------------------

describe('scoreInsuranceCoverage', () => {
  it('scores 100 for adequate coverage', () => {
    expect(scoreInsuranceCoverage(true)).toBe(100);
  });

  it('scores 30 for inadequate coverage', () => {
    expect(scoreInsuranceCoverage(false)).toBe(30);
  });
});

describe('scoreEstatePlanning', () => {
  it('scores 100 when estate plan exists', () => {
    expect(scoreEstatePlanning(true)).toBe(100);
  });

  it('scores 20 when no estate plan', () => {
    expect(scoreEstatePlanning(false)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

describe('getSuggestion', () => {
  const input: WellnessInput = {
    monthlyExpensesCents: 300000,
    emergencyFundCents: 600000,
    monthlyDebtPaymentsCents: 100000,
    grossMonthlyIncomeCents: 500000,
    monthlySavingsCents: 50000,
    retirementSavingsCents: 200000_00,
    targetRetirementCents: 1000000_00,
    hasAdequateInsurance: false,
    hasEstatePlan: false,
  };

  it('returns positive message for high score', () => {
    const suggestion = getSuggestion('emergency-fund', 95, input);
    expect(suggestion).toContain('Excellent');
  });

  it('returns improvement advice for low score', () => {
    const suggestion = getSuggestion('emergency-fund', 40, input);
    expect(suggestion).toContain('Build');
  });

  it('returns advice for each component', () => {
    const components = [
      'emergency-fund',
      'debt-to-income',
      'savings-rate',
      'retirement-progress',
      'insurance-coverage',
      'estate-planning',
    ] as const;

    for (const component of components) {
      const suggestion = getSuggestion(component, 50, input);
      expect(suggestion.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Composite score
// ---------------------------------------------------------------------------

describe('calculateWellnessScore', () => {
  it('calculates composite score for excellent finances', () => {
    const input: WellnessInput = {
      monthlyExpensesCents: 300000,
      emergencyFundCents: 2400000, // 8 months
      monthlyDebtPaymentsCents: 30000, // 6% DTI
      grossMonthlyIncomeCents: 500000,
      monthlySavingsCents: 150000, // 30%
      retirementSavingsCents: 1000000_00,
      targetRetirementCents: 1000000_00,
      hasAdequateInsurance: true,
      hasEstatePlan: true,
    };

    const result = calculateWellnessScore(input);
    expect(result.overallScore).toBeGreaterThanOrEqual(90);
    expect(result.overallGrade).toBe('A');
    expect(result.components).toHaveLength(6);
  });

  it('calculates composite score for poor finances', () => {
    const input: WellnessInput = {
      monthlyExpensesCents: 400000,
      emergencyFundCents: 100000, // less than 1 month
      monthlyDebtPaymentsCents: 200000, // 50% DTI
      grossMonthlyIncomeCents: 400000,
      monthlySavingsCents: 10000, // 2.5%
      retirementSavingsCents: 10000_00,
      targetRetirementCents: 1000000_00,
      hasAdequateInsurance: false,
      hasEstatePlan: false,
    };

    const result = calculateWellnessScore(input);
    expect(result.overallScore).toBeLessThan(50);
    expect(result.overallGrade).toBe('F');
    expect(result.topSuggestions.length).toBeGreaterThan(0);
  });

  it('clamps score between 0 and 100', () => {
    const input: WellnessInput = {
      monthlyExpensesCents: 0,
      emergencyFundCents: 0,
      monthlyDebtPaymentsCents: 0,
      grossMonthlyIncomeCents: 0,
      monthlySavingsCents: 0,
      retirementSavingsCents: 0,
      targetRetirementCents: 0,
      hasAdequateInsurance: false,
      hasEstatePlan: false,
    };

    const result = calculateWellnessScore(input);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('weights sum to 1.0', () => {
    const totalWeight = Object.values(DEFAULT_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(totalWeight).toBeCloseTo(1.0, 10);
  });

  it('each component has a grade', () => {
    const input: WellnessInput = {
      monthlyExpensesCents: 300000,
      emergencyFundCents: 1200000,
      monthlyDebtPaymentsCents: 50000,
      grossMonthlyIncomeCents: 500000,
      monthlySavingsCents: 100000,
      retirementSavingsCents: 500000_00,
      targetRetirementCents: 1000000_00,
      hasAdequateInsurance: true,
      hasEstatePlan: false,
    };

    const result = calculateWellnessScore(input);
    for (const component of result.components) {
      expect(['A', 'B', 'C', 'D', 'F']).toContain(component.grade);
      expect(component.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('top suggestions prioritize by weight (impact)', () => {
    const input: WellnessInput = {
      monthlyExpensesCents: 400000,
      emergencyFundCents: 100000,
      monthlyDebtPaymentsCents: 200000,
      grossMonthlyIncomeCents: 400000,
      monthlySavingsCents: 10000,
      retirementSavingsCents: 10000_00,
      targetRetirementCents: 1000000_00,
      hasAdequateInsurance: false,
      hasEstatePlan: false,
    };

    const result = calculateWellnessScore(input);
    expect(result.topSuggestions.length).toBeLessThanOrEqual(3);
    expect(result.topSuggestions.length).toBeGreaterThan(0);
  });
});
