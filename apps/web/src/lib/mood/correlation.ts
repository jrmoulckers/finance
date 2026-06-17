// SPDX-License-Identifier: BUSL-1.1

import type {
  CategoryMoodCorrelation,
  EmotionSpendCorrelation,
  MoodCorrelationResults,
  MoodJournalEntry,
  MoodSpendingCategory,
  MoodSpendCorrelationSummary,
} from './types';
import { EMOTION_TAGS } from './types';

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculatePearsonCorrelation(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length < 2) {
    return 0;
  }

  const leftAverage = average(left);
  const rightAverage = average(right);

  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftAverage;
    const rightDelta = right[index] - rightAverage;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function describeDirection(coefficient: number): MoodSpendCorrelationSummary['direction'] {
  if (Math.abs(coefficient) < 0.1) {
    return 'flat';
  }

  return coefficient > 0 ? 'positive' : 'negative';
}

function describeStrength(coefficient: number): MoodSpendCorrelationSummary['strength'] {
  const absolute = Math.abs(coefficient);
  if (absolute >= 0.5) {
    return 'strong';
  }

  if (absolute >= 0.25) {
    return 'moderate';
  }

  return 'weak';
}

function summarizeTopCategories(entries: readonly MoodJournalEntry[]): MoodSpendingCategory[] {
  const categories = new Map<string, { amountCents: number; transactionCount: number }>();

  for (const entry of entries) {
    for (const category of entry.spending.categories) {
      const existing = categories.get(category.category) ?? { amountCents: 0, transactionCount: 0 };
      existing.amountCents += category.amountCents;
      existing.transactionCount += category.transactionCount;
      categories.set(category.category, existing);
    }
  }

  return Array.from(categories, ([category, value]) => ({
    category,
    amountCents: value.amountCents,
    transactionCount: value.transactionCount,
  }))
    .sort((left, right) => right.amountCents - left.amountCents)
    .slice(0, 3);
}

function buildEmotionCorrelations(entries: readonly MoodJournalEntry[]): EmotionSpendCorrelation[] {
  const baselineAverage = average(entries.map((entry) => entry.spending.totalCents));
  const correlations: EmotionSpendCorrelation[] = [];

  for (const emotion of EMOTION_TAGS) {
    const matchingEntries = entries.filter((entry) => entry.emotions.includes(emotion));
    if (matchingEntries.length === 0) {
      continue;
    }

    const averageMoodLevel = average(matchingEntries.map((entry) => entry.moodLevel));
    const averageSpendCents = average(matchingEntries.map((entry) => entry.spending.totalCents));

    correlations.push({
      emotion,
      entryCount: matchingEntries.length,
      averageMoodLevel: round(averageMoodLevel),
      averageSpendCents: Math.round(averageSpendCents),
      deltaFromBaselineCents: Math.round(averageSpendCents - baselineAverage),
      topCategories: summarizeTopCategories(matchingEntries),
    });
  }

  return correlations.sort(
    (left, right) =>
      Math.abs(right.deltaFromBaselineCents) - Math.abs(left.deltaFromBaselineCents) ||
      right.averageSpendCents - left.averageSpendCents,
  );
}

function buildCategoryCorrelations(
  entries: readonly MoodJournalEntry[],
): CategoryMoodCorrelation[] {
  const categories = new Map<
    string,
    { totalSpendCents: number; moodTotal: number; entryCount: number }
  >();

  for (const entry of entries) {
    for (const category of entry.spending.categories) {
      const existing = categories.get(category.category) ?? {
        totalSpendCents: 0,
        moodTotal: 0,
        entryCount: 0,
      };
      existing.totalSpendCents += category.amountCents;
      existing.moodTotal += entry.moodLevel;
      existing.entryCount += 1;
      categories.set(category.category, existing);
    }
  }

  return Array.from(categories, ([category, value]) => ({
    category,
    entryCount: value.entryCount,
    averageMoodLevel: round(value.moodTotal / value.entryCount),
    totalSpendCents: value.totalSpendCents,
    averageSpendCents: Math.round(value.totalSpendCents / value.entryCount),
  }))
    .filter((correlation) => correlation.entryCount > 0)
    .sort((left, right) => right.totalSpendCents - left.totalSpendCents);
}

export function calculateMoodCorrelations(
  entries: readonly MoodJournalEntry[],
): MoodCorrelationResults {
  const moodLevels = entries.map((entry) => entry.moodLevel);
  const spending = entries.map((entry) => entry.spending.totalCents);
  const coefficient = round(calculatePearsonCorrelation(moodLevels, spending), 3);

  return {
    overall: {
      coefficient,
      direction: describeDirection(coefficient),
      strength: describeStrength(coefficient),
      sampleSize: entries.length,
      averageMoodLevel: round(average(moodLevels)),
      averageSpendCents: Math.round(average(spending)),
    },
    byEmotion: buildEmotionCorrelations(entries),
    byCategory: buildCategoryCorrelations(entries),
  };
}
