// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ESSENTIAL_THRESHOLD_PERCENT,
  classifyBudget,
  summarizeEssentialsBudget,
} from './essentials-budgeting';

const budgets = [
  { id: 'rent', amountCents: 120000 },
  { id: 'meds', amountCents: 30000 },
  { id: 'dining', amountCents: 20000 },
  { id: 'hobbies', amountCents: 10000 },
];

const classification = {
  rent: 'essential',
  meds: 'essential',
  dining: 'discretionary',
  hobbies: 'discretionary',
} as const;

describe('classifyBudget', () => {
  it('falls back to discretionary by default', () => {
    expect(classifyBudget({}, 'unknown')).toBe('discretionary');
    expect(classifyBudget({}, 'unknown', 'essential')).toBe('essential');
  });
});

describe('summarizeEssentialsBudget', () => {
  it('splits essentials and discretionary and anchors to income', () => {
    const summary = summarizeEssentialsBudget({
      budgets,
      classification,
      monthlyIncomeCents: 200000,
    });

    expect(summary.essentialCents).toBe(150000);
    expect(summary.discretionaryCents).toBe(30000);
    expect(summary.totalBudgetedCents).toBe(180000);
    expect(summary.discretionaryRemainderCents).toBe(50000);
    expect(summary.essentialSharePercent).toBe(75);
    expect(summary.essentialCount).toBe(2);
    expect(summary.discretionaryCount).toBe(2);
  });

  it('warns when essentials exceed the configured share of income', () => {
    const summary = summarizeEssentialsBudget({
      budgets,
      classification,
      monthlyIncomeCents: 200000,
      essentialThresholdPercent: 70,
    });
    // Essentials are 75% of income, above the 70% threshold.
    expect(summary.overThreshold).toBe(true);
    expect(summary.essentialsExceedIncome).toBe(false);
  });

  it('does not warn when essentials are under the threshold', () => {
    const summary = summarizeEssentialsBudget({
      budgets,
      classification,
      monthlyIncomeCents: 300000,
    });
    expect(summary.essentialThresholdPercent).toBe(DEFAULT_ESSENTIAL_THRESHOLD_PERCENT);
    expect(summary.overThreshold).toBe(false);
  });

  it('flags a negative discretionary remainder when essentials exceed income', () => {
    const summary = summarizeEssentialsBudget({
      budgets,
      classification,
      monthlyIncomeCents: 100000,
    });
    expect(summary.essentialsExceedIncome).toBe(true);
    expect(summary.discretionaryRemainderCents).toBe(-50000);
  });

  it('treats income of zero as "no income set"', () => {
    const summary = summarizeEssentialsBudget({
      budgets,
      classification,
      monthlyIncomeCents: 0,
    });
    expect(summary.hasIncome).toBe(false);
    expect(summary.essentialSharePercent).toBe(0);
    expect(summary.overThreshold).toBe(false);
  });

  it('honors the default class for unclassified budgets', () => {
    const summary = summarizeEssentialsBudget({
      budgets: [{ id: 'x', amountCents: 5000 }],
      classification: {},
      monthlyIncomeCents: 10000,
      defaultClass: 'essential',
    });
    expect(summary.essentialCents).toBe(5000);
    expect(summary.discretionaryCents).toBe(0);
  });
});
