// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildPrivacySafeCheckInSummary, canStartCheckIn, selectNextPrompt } from './check-in-rules';

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
