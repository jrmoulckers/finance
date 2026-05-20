// SPDX-License-Identifier: BUSL-1.1

/**
 * Emotional spending and mood correlation journal utilities.
 *
 * Provides mood tagging on transactions, mood-spending correlation analysis,
 * mood frequency tracking, spending-by-mood summary, and mood trends over time.
 *
 * Simple mood tagging is the default. Full wellness correlation is an
 * experimental opt-in feature controlled by WellnessConfig.
 *
 * All monetary values are in integer cents.
 *
 * References: #1773
 */

import type {
  MoodEntry,
  MoodTag,
  SpendingMoodCorrelation,
  MoodFrequency,
  MoodTrendPoint,
  WellnessConfig,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All valid mood tags. */
export const ALL_MOOD_TAGS: readonly MoodTag[] = [
  'happy',
  'stressed',
  'impulsive',
  'planned',
  'guilty',
  'proud',
] as const;

/** Default wellness configuration (basic tagging only). */
export const DEFAULT_WELLNESS_CONFIG: WellnessConfig = {
  moodTaggingEnabled: true,
  fullCorrelationEnabled: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding: rounds half to even.
 *
 * @param value - The value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - (rounded - 0.5)) < Number.EPSILON) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Mood tagging
// ---------------------------------------------------------------------------

/**
 * Create a mood entry for a transaction.
 *
 * @param id - Unique entry identifier
 * @param transactionId - Associated transaction ID
 * @param mood - Mood tag
 * @param amountCents - Transaction amount in cents
 * @param category - Transaction category
 * @param date - Entry date (ISO string)
 * @param note - Optional journal note
 * @returns A new MoodEntry
 */
export function createMoodEntry(
  id: string,
  transactionId: string,
  mood: MoodTag,
  amountCents: number,
  category: string,
  date: string,
  note: string = '',
): MoodEntry {
  return {
    id,
    transactionId,
    mood,
    amountCents,
    category,
    date,
    note,
  };
}

/**
 * Filter mood entries by mood tag.
 *
 * @param entries - All mood entries
 * @param mood - Mood to filter by
 * @returns Filtered entries
 */
export function filterByMood(entries: readonly MoodEntry[], mood: MoodTag): MoodEntry[] {
  return entries.filter((e) => e.mood === mood);
}

/**
 * Filter mood entries by date range.
 *
 * @param entries - All mood entries
 * @param startDate - Start date (ISO string, inclusive)
 * @param endDate - End date (ISO string, inclusive)
 * @returns Filtered entries
 */
export function filterByDateRange(
  entries: readonly MoodEntry[],
  startDate: string,
  endDate: string,
): MoodEntry[] {
  return entries.filter((e) => e.date >= startDate && e.date <= endDate);
}

// ---------------------------------------------------------------------------
// Mood-spending correlation
// ---------------------------------------------------------------------------

/**
 * Calculate spending correlation for each mood tag.
 *
 * Requires fullCorrelationEnabled in config; returns empty array if disabled.
 *
 * @param entries - All mood entries
 * @param config - Wellness configuration
 * @returns Array of spending-mood correlations sorted by total spending descending
 */
export function calculateSpendingCorrelation(
  entries: readonly MoodEntry[],
  config: WellnessConfig = DEFAULT_WELLNESS_CONFIG,
): SpendingMoodCorrelation[] {
  if (!config.fullCorrelationEnabled) return [];
  if (entries.length === 0) return [];

  const totalSpending = entries.reduce((sum, e) => sum + e.amountCents, 0);

  const byMood = new Map<MoodTag, MoodEntry[]>();
  for (const entry of entries) {
    const existing = byMood.get(entry.mood) ?? [];
    existing.push(entry);
    byMood.set(entry.mood, existing);
  }

  const correlations: SpendingMoodCorrelation[] = [];

  for (const [mood, moodEntries] of byMood) {
    const moodTotal = moodEntries.reduce((sum, e) => sum + e.amountCents, 0);
    const count = moodEntries.length;

    correlations.push({
      mood,
      transactionCount: count,
      totalSpendingCents: moodTotal,
      averageSpendingCents: count > 0 ? bankersRound(moodTotal / count) : 0,
      spendingPercent: totalSpending > 0 ? Math.round((moodTotal / totalSpending) * 100) : 0,
    });
  }

  return correlations.sort((a, b) => b.totalSpendingCents - a.totalSpendingCents);
}

// ---------------------------------------------------------------------------
// Mood frequency tracking
// ---------------------------------------------------------------------------

/**
 * Calculate mood frequency distribution.
 *
 * @param entries - All mood entries
 * @returns Array of mood frequencies sorted by count descending
 */
export function calculateMoodFrequency(entries: readonly MoodEntry[]): MoodFrequency[] {
  if (entries.length === 0) return [];

  const counts = new Map<MoodTag, number>();
  for (const entry of entries) {
    counts.set(entry.mood, (counts.get(entry.mood) ?? 0) + 1);
  }

  const total = entries.length;
  const frequencies: MoodFrequency[] = [];

  for (const [mood, count] of counts) {
    frequencies.push({
      mood,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    });
  }

  return frequencies.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Spending-by-mood summary
// ---------------------------------------------------------------------------

/**
 * Summarize total spending by mood tag.
 *
 * @param entries - All mood entries
 * @returns Map of mood tag to total spending in cents
 */
export function spendingByMood(entries: readonly MoodEntry[]): ReadonlyMap<MoodTag, number> {
  const result = new Map<MoodTag, number>();
  for (const entry of entries) {
    result.set(entry.mood, (result.get(entry.mood) ?? 0) + entry.amountCents);
  }
  return result;
}

/**
 * Calculate average spending per transaction for a given mood.
 *
 * @param entries - All mood entries
 * @param mood - Mood tag to calculate average for
 * @returns Average spending in cents (banker's rounded), or 0 if no entries
 */
export function averageSpendingForMood(entries: readonly MoodEntry[], mood: MoodTag): number {
  const moodEntries = entries.filter((e) => e.mood === mood);
  if (moodEntries.length === 0) return 0;
  const total = moodEntries.reduce((sum, e) => sum + e.amountCents, 0);
  return bankersRound(total / moodEntries.length);
}

// ---------------------------------------------------------------------------
// Mood trend over time
// ---------------------------------------------------------------------------

/**
 * Calculate mood trends grouped by period (e.g., weekly or monthly).
 *
 * @param entries - All mood entries
 * @param periodFn - Function to extract period label from a date string
 * @returns Array of trend points sorted by period
 */
export function calculateMoodTrend(
  entries: readonly MoodEntry[],
  periodFn: (date: string) => string,
): MoodTrendPoint[] {
  if (entries.length === 0) return [];

  const periodMap = new Map<string, MoodEntry[]>();
  for (const entry of entries) {
    const period = periodFn(entry.date);
    const existing = periodMap.get(period) ?? [];
    existing.push(entry);
    periodMap.set(period, existing);
  }

  const points: MoodTrendPoint[] = [];
  for (const [period, periodEntries] of periodMap) {
    points.push({
      period,
      frequencies: calculateMoodFrequency(periodEntries),
      totalSpendingCents: periodEntries.reduce((sum, e) => sum + e.amountCents, 0),
    });
  }

  return points.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Extract the month period label from a date string (e.g., "2024-01").
 *
 * @param date - ISO date string
 * @returns Month period label
 */
export function monthPeriod(date: string): string {
  return date.slice(0, 7);
}

/**
 * Extract the ISO week period label from a date string (e.g., "2024-W01").
 *
 * @param date - ISO date string
 * @returns Week period label
 */
export function weekPeriod(date: string): string {
  const d = new Date(date);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
