// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  ALL_CHECK_IN_SUMMARY_TYPES,
  buildNeutralSummary,
  buildPrivacySafeCheckInSummary,
  cadenceToDays,
  canStartCheckIn,
  DEFAULT_CHECK_IN_PROMPTS,
  filterSharedSummary,
  selectNextPrompt,
  type CheckInFacts,
} from './check-in-rules';

describe('couples check-in shared rules', () => {
  it('requires consent and cadence before prompting', () => {
    expect(canStartCheckIn({ a: true, b: true }, '2026-04-01', '2026-04-08', 7)).toBe(true);
    expect(canStartCheckIn({ a: true, b: false }, null, '2026-04-08', 7)).toBe(false);
    expect(canStartCheckIn({ a: true, b: true }, '2026-04-05', '2026-04-08', 7)).toBe(false);
  });

  it('rotates prompts and redacts private summary entries', () => {
    const prompts = [
      { id: 'values', category: 'money-values' as const, text: 'What felt fair?' },
      { id: 'goals', category: 'goals' as const, text: 'What goal changed?' },
    ];
    expect(selectNextPrompt(prompts, ['values'])?.id).toBe('goals');
    expect(
      buildPrivacySafeCheckInSummary([
        { participantId: 'a', text: 'Rent was easy', private: false },
        { participantId: 'b', text: 'Private stressor', private: true },
      ]),
    ).toEqual(['a: Rent was easy', 'b: redacted']);
  });
});

describe('couples check-in cadence + prompts (#2150)', () => {
  it('translates an opt-in cadence into the gating day count', () => {
    expect(cadenceToDays('weekly')).toBe(7);
    expect(cadenceToDays('monthly')).toBe(30);
  });

  it('gates the first check-in by cadence once both partners consent', () => {
    const consent = { saver: true, spender: true };
    // Weekly: one week elapsed is enough.
    expect(canStartCheckIn(consent, '2026-04-01', '2026-04-08', cadenceToDays('weekly'))).toBe(
      true,
    );
    // Monthly: one week elapsed is too soon.
    expect(canStartCheckIn(consent, '2026-04-01', '2026-04-08', cadenceToDays('monthly'))).toBe(
      false,
    );
  });

  it('ships a supportive default prompt set spanning every category', () => {
    const categories = new Set(DEFAULT_CHECK_IN_PROMPTS.map((prompt) => prompt.category));
    expect(categories).toEqual(new Set(['money-values', 'goals', 'stress', 'celebration']));
  });

  it('walks the default prompts unused-first across the full flow', () => {
    const used: string[] = [];
    const order: string[] = [];
    for (let i = 0; i < DEFAULT_CHECK_IN_PROMPTS.length; i += 1) {
      const next = selectNextPrompt(DEFAULT_CHECK_IN_PROMPTS, used);
      expect(next).not.toBeNull();
      order.push(next!.id);
      used.push(next!.id);
    }
    expect(order).toEqual(DEFAULT_CHECK_IN_PROMPTS.map((prompt) => prompt.id));
  });
});

describe('couples check-in neutral summary (#2150)', () => {
  const facts: CheckInFacts = {
    categoryTotals: [
      { label: 'Groceries', amountCents: 42_000 },
      { label: 'Dining out', amountCents: 18_000 },
    ],
    budgetDriftByCategory: [
      { label: 'Groceries', amountCents: 2_000 },
      { label: 'Dining out', amountCents: -1_500 },
    ],
    sharedSpendingChanges: [{ label: 'Wedding', amountCents: 35_000 }],
  };

  it('produces neutral aggregate headlines before any line-item detail', () => {
    const sections = buildNeutralSummary(facts);
    expect(sections.map((section) => section.type)).toEqual([...ALL_CHECK_IN_SUMMARY_TYPES]);

    const totals = sections.find((section) => section.type === 'category-totals');
    // Neutral headline is the aggregate, computed independently of the detail rows.
    expect(totals?.summaryCents).toBe(60_000);
    // Detail (line items) is still carried, but kept separate from the headline.
    expect(totals?.detail).toHaveLength(2);

    const drift = sections.find((section) => section.type === 'budget-drift');
    expect(drift?.summaryCents).toBe(500);

    const shared = sections.find((section) => section.type === 'shared-spending');
    expect(shared?.summaryCents).toBe(35_000);
    expect(shared?.detail[0]?.label).toBe('Wedding');
  });

  it('shares only the summary types a partner consented to', () => {
    const sections = buildNeutralSummary(facts);
    const shared = filterSharedSummary(sections, ['category-totals', 'shared-spending']);
    expect(shared.map((section) => section.type)).toEqual(['category-totals', 'shared-spending']);
    expect(filterSharedSummary(sections, [])).toEqual([]);
  });
});
