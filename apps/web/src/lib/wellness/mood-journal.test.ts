// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for emotional spending and mood correlation journal utilities.
 *
 * References: #1773
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_MOOD_TAGS,
  DEFAULT_WELLNESS_CONFIG,
  createMoodEntry,
  filterByMood,
  filterByDateRange,
  calculateSpendingCorrelation,
  calculateMoodFrequency,
  spendingByMood,
  averageSpendingForMood,
  calculateMoodTrend,
  monthPeriod,
  weekPeriod,
} from './mood-journal';
import type { MoodEntry, WellnessConfig } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const entries: MoodEntry[] = [
  {
    id: 'm1',
    transactionId: 't1',
    mood: 'happy',
    amountCents: 5000,
    category: 'food',
    date: '2024-01-05',
    note: '',
  },
  {
    id: 'm2',
    transactionId: 't2',
    mood: 'stressed',
    amountCents: 15000,
    category: 'shopping',
    date: '2024-01-10',
    note: 'Bad day',
  },
  {
    id: 'm3',
    transactionId: 't3',
    mood: 'impulsive',
    amountCents: 20000,
    category: 'shopping',
    date: '2024-01-15',
    note: '',
  },
  {
    id: 'm4',
    transactionId: 't4',
    mood: 'happy',
    amountCents: 3000,
    category: 'food',
    date: '2024-01-20',
    note: '',
  },
  {
    id: 'm5',
    transactionId: 't5',
    mood: 'planned',
    amountCents: 100000,
    category: 'bills',
    date: '2024-02-01',
    note: '',
  },
  {
    id: 'm6',
    transactionId: 't6',
    mood: 'guilty',
    amountCents: 8000,
    category: 'entertainment',
    date: '2024-02-05',
    note: '',
  },
  {
    id: 'm7',
    transactionId: 't7',
    mood: 'proud',
    amountCents: 50000,
    category: 'savings',
    date: '2024-02-10',
    note: '',
  },
  {
    id: 'm8',
    transactionId: 't8',
    mood: 'stressed',
    amountCents: 12000,
    category: 'food',
    date: '2024-02-15',
    note: '',
  },
];

const fullConfig: WellnessConfig = {
  moodTaggingEnabled: true,
  fullCorrelationEnabled: true,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('ALL_MOOD_TAGS', () => {
  it('contains all 6 mood tags', () => {
    expect(ALL_MOOD_TAGS).toHaveLength(6);
    expect(ALL_MOOD_TAGS).toContain('happy');
    expect(ALL_MOOD_TAGS).toContain('stressed');
    expect(ALL_MOOD_TAGS).toContain('impulsive');
    expect(ALL_MOOD_TAGS).toContain('planned');
    expect(ALL_MOOD_TAGS).toContain('guilty');
    expect(ALL_MOOD_TAGS).toContain('proud');
  });
});

describe('DEFAULT_WELLNESS_CONFIG', () => {
  it('has mood tagging enabled by default', () => {
    expect(DEFAULT_WELLNESS_CONFIG.moodTaggingEnabled).toBe(true);
  });

  it('has full correlation disabled by default', () => {
    expect(DEFAULT_WELLNESS_CONFIG.fullCorrelationEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createMoodEntry
// ---------------------------------------------------------------------------

describe('createMoodEntry', () => {
  it('creates a mood entry with all fields', () => {
    const entry = createMoodEntry('id1', 'tx1', 'happy', 5000, 'food', '2024-01-01', 'Lunch');
    expect(entry.id).toBe('id1');
    expect(entry.transactionId).toBe('tx1');
    expect(entry.mood).toBe('happy');
    expect(entry.amountCents).toBe(5000);
    expect(entry.category).toBe('food');
    expect(entry.date).toBe('2024-01-01');
    expect(entry.note).toBe('Lunch');
  });

  it('defaults note to empty string', () => {
    const entry = createMoodEntry('id1', 'tx1', 'stressed', 1000, 'other', '2024-01-01');
    expect(entry.note).toBe('');
  });
});

// ---------------------------------------------------------------------------
// filterByMood
// ---------------------------------------------------------------------------

describe('filterByMood', () => {
  it('filters entries by mood tag', () => {
    const result = filterByMood(entries, 'happy');
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.mood === 'happy')).toBe(true);
  });

  it('returns empty for mood with no entries', () => {
    const noEntries: MoodEntry[] = [];
    expect(filterByMood(noEntries, 'happy')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterByDateRange
// ---------------------------------------------------------------------------

describe('filterByDateRange', () => {
  it('filters entries within date range', () => {
    const result = filterByDateRange(entries, '2024-01-10', '2024-01-20');
    expect(result).toHaveLength(3); // m2, m3, m4
  });

  it('includes boundary dates', () => {
    const result = filterByDateRange(entries, '2024-01-05', '2024-01-05');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });
});

// ---------------------------------------------------------------------------
// calculateSpendingCorrelation
// ---------------------------------------------------------------------------

describe('calculateSpendingCorrelation', () => {
  it('returns empty when fullCorrelationEnabled is false', () => {
    const result = calculateSpendingCorrelation(entries, DEFAULT_WELLNESS_CONFIG);
    expect(result).toHaveLength(0);
  });

  it('calculates correlations when enabled', () => {
    const result = calculateSpendingCorrelation(entries, fullConfig);
    expect(result.length).toBeGreaterThan(0);
    // Should be sorted by total spending descending
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].totalSpendingCents).toBeGreaterThanOrEqual(result[i].totalSpendingCents);
    }
  });

  it('correctly calculates averages', () => {
    const result = calculateSpendingCorrelation(entries, fullConfig);
    const happy = result.find((r) => r.mood === 'happy');
    expect(happy).toBeDefined();
    expect(happy?.transactionCount).toBe(2);
    expect(happy?.totalSpendingCents).toBe(8000);
    expect(happy?.averageSpendingCents).toBe(4000);
  });

  it('returns empty for empty entries', () => {
    expect(calculateSpendingCorrelation([], fullConfig)).toHaveLength(0);
  });

  it('spending percentages sum to approximately 100', () => {
    const result = calculateSpendingCorrelation(entries, fullConfig);
    const totalPercent = result.reduce((sum, r) => sum + r.spendingPercent, 0);
    // Rounding may cause slight deviation
    expect(totalPercent).toBeGreaterThanOrEqual(95);
    expect(totalPercent).toBeLessThanOrEqual(105);
  });
});

// ---------------------------------------------------------------------------
// calculateMoodFrequency
// ---------------------------------------------------------------------------

describe('calculateMoodFrequency', () => {
  it('calculates frequency distribution', () => {
    const freq = calculateMoodFrequency(entries);
    expect(freq.length).toBeGreaterThan(0);
    // happy and stressed both have 2 entries
    const happy = freq.find((f) => f.mood === 'happy');
    expect(happy?.count).toBe(2);
  });

  it('sorts by count descending', () => {
    const freq = calculateMoodFrequency(entries);
    for (let i = 1; i < freq.length; i++) {
      expect(freq[i - 1].count).toBeGreaterThanOrEqual(freq[i].count);
    }
  });

  it('returns empty for no entries', () => {
    expect(calculateMoodFrequency([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// spendingByMood
// ---------------------------------------------------------------------------

describe('spendingByMood', () => {
  it('returns map of mood to total spending', () => {
    const result = spendingByMood(entries);
    expect(result.get('happy')).toBe(8000);
    expect(result.get('stressed')).toBe(27000);
    expect(result.get('impulsive')).toBe(20000);
  });

  it('returns empty map for no entries', () => {
    expect(spendingByMood([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// averageSpendingForMood
// ---------------------------------------------------------------------------

describe('averageSpendingForMood', () => {
  it('calculates average for a mood', () => {
    expect(averageSpendingForMood(entries, 'happy')).toBe(4000);
  });

  it('returns 0 for mood with no entries', () => {
    expect(averageSpendingForMood([], 'happy')).toBe(0);
  });

  it('handles single entry', () => {
    expect(averageSpendingForMood(entries, 'impulsive')).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// calculateMoodTrend
// ---------------------------------------------------------------------------

describe('calculateMoodTrend', () => {
  it('groups entries by month', () => {
    const trend = calculateMoodTrend(entries, monthPeriod);
    expect(trend).toHaveLength(2); // Jan and Feb
    expect(trend[0].period).toBe('2024-01');
    expect(trend[1].period).toBe('2024-02');
  });

  it('calculates spending per period', () => {
    const trend = calculateMoodTrend(entries, monthPeriod);
    const jan = trend.find((t) => t.period === '2024-01');
    expect(jan?.totalSpendingCents).toBe(43000); // 5000+15000+20000+3000
  });

  it('includes mood frequencies per period', () => {
    const trend = calculateMoodTrend(entries, monthPeriod);
    const jan = trend.find((t) => t.period === '2024-01');
    expect(jan?.frequencies.length).toBeGreaterThan(0);
  });

  it('returns empty for no entries', () => {
    expect(calculateMoodTrend([], monthPeriod)).toHaveLength(0);
  });

  it('sorts by period ascending', () => {
    const trend = calculateMoodTrend(entries, monthPeriod);
    for (let i = 1; i < trend.length; i++) {
      expect(trend[i - 1].period < trend[i].period).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Period functions
// ---------------------------------------------------------------------------

describe('monthPeriod', () => {
  it('extracts month from date', () => {
    expect(monthPeriod('2024-01-15')).toBe('2024-01');
  });
});

describe('weekPeriod', () => {
  it('extracts week from date', () => {
    const week = weekPeriod('2024-01-15');
    expect(week).toMatch(/^2024-W\d{2}$/);
  });
});
