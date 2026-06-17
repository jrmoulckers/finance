// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  approveCategoryRule,
  detectRuleConflicts,
  mineCategoryRulesFromHistory,
  type RuleMiningTransaction,
} from './category-rules-from-history';

const HISTORY: RuleMiningTransaction[] = [
  { id: 't1', date: '2025-01-01', merchant: 'Target Optical 123', amountCents: -12_000, categoryId: 'health', tags: ['vision'] },
  { id: 't2', date: '2025-01-15', merchant: 'Target Optical 999', amountCents: -11_500, categoryId: 'health', tags: ['vision'] },
  { id: 't3', date: '2025-02-01', merchant: 'Target Optical', amountCents: -13_000, categoryId: 'health', tags: ['vision'] },
  { id: 't4', date: '2025-02-15', merchant: 'Target Store', amountCents: -5_000, categoryId: 'shopping' },
];

describe('mineCategoryRulesFromHistory', () => {
  it('mines repeated merchant/category/amount/tag patterns with samples', () => {
    const [candidate] = mineCategoryRulesFromHistory(HISTORY, [], { minCoverage: 3 });

    expect(candidate).toMatchObject({
      merchantContains: 'target optical',
      categoryId: 'health',
      amountBand: 'medium',
      coverageCount: 3,
      tags: ['vision'],
      requiresApproval: true,
    });
    expect(candidate.confidence).toBeGreaterThan(0.8);
    expect(candidate.sampleTransactionIds).toEqual(['t1', 't2', 't3']);
  });

  it('detects overlapping conflicting existing rules', () => {
    const conflicts = detectRuleConflicts('target optical', 'health', 'medium', [
      { id: 'r1', merchantContains: 'target', categoryId: 'shopping', minAmountCents: 0, maxAmountCents: 50_000, enabled: true },
      { id: 'r2', merchantContains: 'coffee', categoryId: 'dining', enabled: true },
    ]);

    expect(conflicts).toEqual(['r1']);
  });

  it('returns approval flow data in the existing rules-engine shape', () => {
    const [candidate] = mineCategoryRulesFromHistory(HISTORY, [], { minCoverage: 3 });
    const approved = approveCategoryRule(candidate, 'approved-1');

    expect(approved).toMatchObject({
      id: 'approved-1',
      enabled: true,
      conditions: [
        { type: 'merchant', value: 'target optical' },
        { type: 'amount_range', value: '10000:49999' },
      ],
      action: { setCategoryId: 'health', addTags: ['vision'], autoReview: false },
    });
  });
});
