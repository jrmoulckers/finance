// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { detectEmotionalSpendingPatterns } from './patterns';
import type { MoodJournalEntry } from './types';

const entries: MoodJournalEntry[] = [
  {
    id: '1',
    timestamp: '2025-03-01T12:00:00Z',
    date: '2025-03-01',
    moodLevel: 2,
    emotions: ['stressed', 'anxious'],
    note: '',
    spending: {
      totalCents: 9000,
      transactionCount: 2,
      categories: [{ category: 'Shopping', amountCents: 9000, transactionCount: 2 }],
    },
  },
  {
    id: '2',
    timestamp: '2025-03-02T12:00:00Z',
    date: '2025-03-02',
    moodLevel: 2,
    emotions: ['overwhelmed'],
    note: '',
    spending: {
      totalCents: 7600,
      transactionCount: 2,
      categories: [{ category: 'Retail', amountCents: 7600, transactionCount: 2 }],
    },
  },
  {
    id: '3',
    timestamp: '2025-03-03T12:00:00Z',
    date: '2025-03-03',
    moodLevel: 1,
    emotions: ['sad'],
    note: '',
    spending: {
      totalCents: 4200,
      transactionCount: 1,
      categories: [{ category: 'Dining', amountCents: 4200, transactionCount: 1 }],
    },
  },
  {
    id: '4',
    timestamp: '2025-03-04T12:00:00Z',
    date: '2025-03-04',
    moodLevel: 5,
    emotions: ['celebratory', 'happy'],
    note: '',
    spending: {
      totalCents: 6800,
      transactionCount: 2,
      categories: [{ category: 'Entertainment', amountCents: 6800, transactionCount: 2 }],
    },
  },
  {
    id: '5',
    timestamp: '2025-03-05T12:00:00Z',
    date: '2025-03-05',
    moodLevel: 4,
    emotions: ['content'],
    note: '',
    spending: {
      totalCents: 1800,
      transactionCount: 1,
      categories: [{ category: 'Groceries', amountCents: 1800, transactionCount: 1 }],
    },
  },
];

describe('detectEmotionalSpendingPatterns', () => {
  it('detects the named emotional spending patterns', () => {
    const patterns = detectEmotionalSpendingPatterns(entries);

    expect(patterns.map((pattern) => pattern.id)).toEqual(
      expect.arrayContaining(['stress-shopping', 'sad-dining', 'happy-impulsive']),
    );
    expect(patterns.find((pattern) => pattern.id === 'stress-shopping')?.matchedCategories).toEqual(
      expect.arrayContaining(['Shopping', 'Retail']),
    );
  });
});
