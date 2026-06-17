// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { calculateMoodCorrelations } from './correlation';
import type { MoodJournalEntry } from './types';

const entries: MoodJournalEntry[] = [
  {
    id: '1',
    timestamp: '2025-03-01T12:00:00Z',
    date: '2025-03-01',
    moodLevel: 1,
    emotions: ['sad'],
    note: '',
    spending: {
      totalCents: 1200,
      transactionCount: 1,
      categories: [{ category: 'Dining', amountCents: 1200, transactionCount: 1 }],
    },
  },
  {
    id: '2',
    timestamp: '2025-03-02T12:00:00Z',
    date: '2025-03-02',
    moodLevel: 2,
    emotions: ['stressed'],
    note: '',
    spending: {
      totalCents: 3000,
      transactionCount: 1,
      categories: [{ category: 'Shopping', amountCents: 3000, transactionCount: 1 }],
    },
  },
  {
    id: '3',
    timestamp: '2025-03-03T12:00:00Z',
    date: '2025-03-03',
    moodLevel: 4,
    emotions: ['content'],
    note: '',
    spending: {
      totalCents: 4500,
      transactionCount: 2,
      categories: [{ category: 'Groceries', amountCents: 4500, transactionCount: 2 }],
    },
  },
  {
    id: '4',
    timestamp: '2025-03-04T12:00:00Z',
    date: '2025-03-04',
    moodLevel: 5,
    emotions: ['happy'],
    note: '',
    spending: {
      totalCents: 7000,
      transactionCount: 2,
      categories: [{ category: 'Entertainment', amountCents: 7000, transactionCount: 2 }],
    },
  },
];

describe('calculateMoodCorrelations', () => {
  it('calculates an overall mood-to-spending correlation', () => {
    const result = calculateMoodCorrelations(entries);

    expect(result.overall.sampleSize).toBe(4);
    expect(result.overall.coefficient).toBeGreaterThan(0.9);
    expect(result.overall.direction).toBe('positive');
    expect(result.overall.strength).toBe('strong');
  });

  it('builds emotion and category breakdowns', () => {
    const result = calculateMoodCorrelations(entries);

    expect(result.byEmotion.find((item) => item.emotion === 'stressed')?.averageSpendCents).toBe(
      3000,
    );
    expect(result.byCategory[0]?.category).toBe('Entertainment');
    expect(result.byCategory.find((item) => item.category === 'Shopping')?.averageMoodLevel).toBe(
      2,
    );
  });
});
