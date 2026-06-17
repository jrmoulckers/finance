// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { learnCategoryCorrection, suggestCategory } from './categorization-suggestions';

describe('shared categorization suggestions', () => {
  it('prefers learned merchant corrections with high confidence', () => {
    const correction = learnCategoryCorrection('Whole Foods #12', 'groceries');
    expect(
      suggestCategory({
        merchant: 'Whole Foods #12',
        description: 'organic market',
        amountCents: 58_00,
        rules: [{ categoryId: 'restaurants', keywords: ['food'] }],
        corrections: [correction],
      }),
    ).toEqual({
      categoryId: 'groceries',
      confidence: 0.95,
      strategy: 'correction',
      matchedOn: 'whole foods 12',
      needsReview: false,
    });
  });

  it('falls back to deterministic keyword and review strategies', () => {
    expect(
      suggestCategory({
        merchant: 'Shell',
        description: 'fuel',
        amountCents: 42_00,
        rules: [{ categoryId: 'transportation', keywords: ['fuel', 'gas'] }],
        corrections: [],
      }).categoryId,
    ).toBe('transportation');
    expect(
      suggestCategory({ merchant: '', description: '', amountCents: 1_00, rules: [], corrections: [] }).needsReview,
    ).toBe(true);
  });
});
