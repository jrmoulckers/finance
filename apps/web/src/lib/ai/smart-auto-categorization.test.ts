// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  learnCategoryCorrection,
  suggestSmartCategoryCandidates,
  type AiCategory,
  type LearnedCategoryCorrection,
} from './smart-auto-categorization';

const CATEGORIES: AiCategory[] = [
  { id: 'groceries', name: 'Groceries' },
  { id: 'dining', name: 'Dining' },
  { id: 'shopping', name: 'Shopping' },
  { id: 'entertainment', name: 'Entertainment' },
];

describe('suggestSmartCategoryCandidates', () => {
  it('returns ranked built-in candidates with explanations and auto-apply', () => {
    const [top] = suggestSmartCategoryCandidates(
      { description: 'Starbucks store 1234', amountCents: 650 },
      CATEGORIES,
      [],
      { autoApplyThreshold: 0.7 },
    );

    expect(top).toMatchObject({ categoryId: 'dining', source: 'builtin', autoApply: true });
    expect(top.confidence).toBeGreaterThan(0.7);
    expect(top.explanation).toContain('starbucks');
  });

  it('learns from merchant, amount band, memo tokens, and account context', () => {
    const corrections: LearnedCategoryCorrection[] = [
      {
        merchant: 'target optical',
        categoryId: 'shopping',
        amountBand: 'medium',
        memoTokens: ['glasses', 'vision'],
        accountId: 'checking',
        correctionCount: 4,
        learnedAt: '2025-02-01T00:00:00.000Z',
      },
    ];

    const [top] = suggestSmartCategoryCandidates(
      {
        description: 'TARGET OPTICAL 4421',
        amountCents: 12_500,
        memo: 'new glasses vision exam',
        accountId: 'checking',
      },
      CATEGORIES,
      corrections,
      { now: new Date('2025-02-10T00:00:00.000Z') },
    );

    expect(top.categoryId).toBe('shopping');
    expect(top.source).toBe('learned');
    expect(top.confidence).toBeGreaterThan(0.8);
    expect(top.explanation).toContain('same account');
  });

  it('marks ambiguous close candidates for review', () => {
    const candidates = suggestSmartCategoryCandidates(
      { description: 'Amazon prime video', amountCents: 1_299 },
      CATEGORIES,
      [],
      { autoApplyThreshold: 0.5 },
    );

    expect(candidates.map((candidate) => candidate.categoryId)).toContain('shopping');
    expect(candidates.map((candidate) => candidate.categoryId)).toContain('entertainment');
    expect(candidates[0].reviewRequired).toBe(true);
  });

  it('falls back to low-confidence review when no signals match', () => {
    const [top] = suggestSmartCategoryCandidates(
      { description: 'Unknown counterparty', amountCents: 250_000 },
      CATEGORIES,
    );

    expect(top).toMatchObject({ source: 'fallback', autoApply: false, reviewRequired: true });
    expect(top.confidence).toBeLessThan(0.3);
  });
});

describe('learnCategoryCorrection', () => {
  it('records normalized correction context without external services', () => {
    const learned = learnCategoryCorrection(
      {
        description: 'POS Target Optical #12345',
        amountCents: 9_900,
        memo: 'Vision glasses',
        accountId: 'checking',
      },
      'shopping',
    );

    expect(learned).toHaveLength(1);
    expect(learned[0]).toMatchObject({
      merchant: 'target optical',
      categoryId: 'shopping',
      amountBand: 'medium',
      accountId: 'checking',
      correctionCount: 1,
    });
    expect(learned[0].memoTokens).toContain('vision');
  });
});
