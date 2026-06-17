// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MOOD_JOURNAL_STORAGE_KEY,
  clearMoodJournalEntries,
  createMoodJournalEntry,
  deleteMoodJournalEntry,
  listMoodJournalEntries,
  summarizeSpendingForDate,
  updateMoodJournalEntry,
} from './journal';
import type { MoodSpendingRecord } from './types';

const spendingRecords: MoodSpendingRecord[] = [
  { date: '2025-03-05', amountCents: 4500, category: 'Shopping' },
  { date: '2025-03-05', amountCents: 1800, category: 'Dining' },
  { date: '2025-03-06', amountCents: 2200, category: 'Dining' },
];

describe('mood journal storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates and hydrates entries with same-day spending totals', () => {
    const created = createMoodJournalEntry(
      {
        timestamp: '2025-03-05T12:00:00',
        moodLevel: 2,
        emotions: ['stressed', 'anxious'],
        note: 'Impulse browsing after a rough meeting',
      },
      spendingRecords,
    );

    expect(created.date).toBe('2025-03-05');
    expect(created.spending.totalCents).toBe(6300);
    expect(created.spending.transactionCount).toBe(2);
    expect(created.spending.categories[0]?.category).toBe('Shopping');
    expect(listMoodJournalEntries(spendingRecords)).toHaveLength(1);
  });

  it('updates existing entries while preserving hydration', () => {
    const created = createMoodJournalEntry(
      {
        timestamp: '2025-03-05T12:00:00',
        moodLevel: 2,
        emotions: ['stressed'],
        note: 'Tense',
      },
      spendingRecords,
    );

    const updated = updateMoodJournalEntry(
      created.id,
      {
        moodLevel: 4,
        emotions: ['content'],
        note: 'Felt better after reviewing the budget',
      },
      spendingRecords,
    );

    expect(updated).not.toBeNull();
    expect(updated?.moodLevel).toBe(4);
    expect(updated?.emotions).toEqual(['content']);
    expect(updated?.spending.totalCents).toBe(6300);
  });

  it('deletes and clears entries', () => {
    const created = createMoodJournalEntry(
      {
        timestamp: '2025-03-05T12:00:00',
        moodLevel: 2,
        emotions: ['sad'],
      },
      spendingRecords,
    );

    expect(deleteMoodJournalEntry(created.id)).toBe(true);
    expect(listMoodJournalEntries(spendingRecords)).toHaveLength(0);

    createMoodJournalEntry(
      {
        timestamp: '2025-03-06T12:00:00',
        moodLevel: 5,
        emotions: ['happy'],
      },
      spendingRecords,
    );
    clearMoodJournalEntries();

    expect(localStorage.getItem(MOOD_JOURNAL_STORAGE_KEY)).toBeNull();
    expect(listMoodJournalEntries(spendingRecords)).toHaveLength(0);
  });

  it('summarizes spending records for a given day', () => {
    const summary = summarizeSpendingForDate(spendingRecords, '2025-03-05');

    expect(summary.totalCents).toBe(6300);
    expect(summary.transactionCount).toBe(2);
    expect(summary.categories.map((category) => category.category)).toEqual(['Shopping', 'Dining']);
  });
});
