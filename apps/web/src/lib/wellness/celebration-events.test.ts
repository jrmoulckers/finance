// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { deriveHabitStreak, emitCelebrationEvents, isNearWin } from './celebration-events';

describe('celebration event rules', () => {
  it('derives streaks and near wins without using spending volume', () => {
    expect(deriveHabitStreak(['2026-04-10', '2026-04-09', '2026-04-08'])).toBe(3);
    expect(
      isNearWin({ domain: 'goals', date: '2026-04-10', percentComplete: 85, completed: false }),
    ).toBe(true);
    expect(
      emitCelebrationEvents([
        { domain: 'goals', date: '2026-04-10', percentComplete: 85, completed: false },
        { domain: 'learning', date: '2026-04-09', percentComplete: 100, completed: true },
        { domain: 'check-ins', date: '2026-04-08', percentComplete: 40, completed: false },
      ]),
    ).toEqual([
      { type: 'streak', domain: 'goals', ref: '3-day' },
      { type: 'near-win', domain: 'goals', ref: '85%' },
      { type: 'completion', domain: 'learning', ref: '2026-04-09' },
    ]);
  });
});
