// SPDX-License-Identifier: BUSL-1.1

import type { Transaction } from '../../kmp/bridge';
import { normalizeMoodTag, type MoodTag as EmojiMoodTag } from '../mood-tags';
import { clamp, roundToOne } from '../insights/helpers';
import type {
  EmotionalSpendingPattern,
  MoodCorrelationSummary,
  MoodSpendingPoint,
  MoodState,
  StressLevel,
} from './types';

export interface MoodCorrelationInput {
  readonly transactions: readonly Transaction[];
  readonly maxPoints?: number;
}

interface TaggedExpense {
  readonly date: string;
  readonly amount: number;
  readonly moodTag: EmojiMoodTag;
  readonly moodState: MoodState;
  readonly moodLabel: string;
  readonly moodScore: number;
}

const MOOD_META: Record<EmojiMoodTag, { state: MoodState; label: string; score: number }> = {
  '😊': { state: 'calm', label: 'Calm', score: 15 },
  '😐': { state: 'neutral', label: 'Neutral', score: 40 },
  '😟': { state: 'anxious', label: 'Anxious', score: 75 },
  '😡': { state: 'stressed', label: 'Stressed', score: 90 },
  '🤩': { state: 'celebratory', label: 'Celebratory', score: 55 },
  '😴': { state: 'fatigued', label: 'Fatigued', score: 65 },
};

function pearsonCorrelation(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length < 2) {
    return 0;
  }

  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;

  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  if (leftVariance === 0 || rightVariance === 0) {
    return 0;
  }

  return numerator / Math.sqrt(leftVariance * rightVariance);
}

function getStressLevel(intensity: number): StressLevel {
  if (intensity >= 0.85) {
    return 'severe';
  }
  if (intensity >= 0.65) {
    return 'high';
  }
  if (intensity >= 0.4) {
    return 'moderate';
  }
  return 'low';
}

function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function summarizeTaggedExpenses(transactions: readonly Transaction[]): TaggedExpense[] {
  return transactions
    .filter((transaction) => transaction.type === 'EXPENSE')
    .flatMap((transaction) => {
      const moodTag = normalizeMoodTag(transaction.moodTag);
      if (!moodTag) {
        return [];
      }

      const meta = MOOD_META[moodTag];
      return [
        {
          date: transaction.date,
          amount: Math.abs(transaction.amount.amount),
          moodTag,
          moodState: meta.state,
          moodLabel: meta.label,
          moodScore: meta.score,
        },
      ];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildChartPoints(
  taggedExpenses: readonly TaggedExpense[],
  baseline: number,
  maxPoints: number,
): MoodSpendingPoint[] {
  const grouped = new Map<string, TaggedExpense[]>();

  for (const entry of taggedExpenses) {
    const existing = grouped.get(entry.date) ?? [];
    existing.push(entry);
    grouped.set(entry.date, existing);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-maxPoints)
    .map(([date, entries]) => {
      const spending = entries.reduce((sum, entry) => sum + entry.amount, 0);
      const moodScore = entries.reduce((sum, entry) => sum + entry.moodScore, 0) / entries.length;
      const dominantMood =
        [...entries].sort((left, right) => right.moodScore - left.moodScore)[0] ?? entries[0];

      return {
        date,
        label: formatShortDate(date),
        spending,
        baseline,
        moodState: dominantMood.moodState,
        moodLabel: dominantMood.moodLabel,
        moodScore: roundToOne(moodScore),
        transactionCount: entries.length,
        isSpike: spending >= baseline * 1.35,
        isDrop: baseline > 0 && spending <= baseline * 0.65,
      };
    });
}

function detectPatterns(
  taggedExpenses: readonly TaggedExpense[],
  baseline: number,
): EmotionalSpendingPattern[] {
  const grouped = new Map<MoodState, TaggedExpense[]>();

  for (const entry of taggedExpenses) {
    const existing = grouped.get(entry.moodState) ?? [];
    existing.push(entry);
    grouped.set(entry.moodState, existing);
  }

  const patterns: EmotionalSpendingPattern[] = [];

  for (const [moodState, entries] of grouped) {
    if (entries.length < 2) {
      continue;
    }

    const averageSpending = entries.reduce((sum, entry) => sum + entry.amount, 0) / entries.length;
    const spendRatio = baseline > 0 ? averageSpending / baseline : 1;
    const stressShare = entries.length / taggedExpenses.length;

    if (spendRatio >= 1.25) {
      const intensity = clamp(Math.max(spendRatio - 1, stressShare), 0, 1);
      patterns.push({
        id: `${moodState}-spike`,
        moodState,
        direction: 'spike',
        title: `${entries[0]?.moodLabel ?? 'Tagged'} spending tends to spike`,
        description: `Transactions tagged ${entries[0]?.moodLabel.toLowerCase() ?? 'this way'} average ${Math.round((spendRatio - 1) * 100)}% above your typical expense size.`,
        intensity: getStressLevel(intensity),
        averageSpending: Math.round(averageSpending),
        occurrences: entries.length,
      });
      continue;
    }

    if (spendRatio <= 0.8) {
      const intensity = clamp(Math.max(1 - spendRatio, stressShare), 0, 1);
      patterns.push({
        id: `${moodState}-drop`,
        moodState,
        direction: 'drop',
        title: `${entries[0]?.moodLabel ?? 'Tagged'} days tend to stay lighter`,
        description: `Transactions tagged ${entries[0]?.moodLabel.toLowerCase() ?? 'this way'} average ${Math.round((1 - spendRatio) * 100)}% below your normal expense size.`,
        intensity: getStressLevel(intensity),
        averageSpending: Math.round(averageSpending),
        occurrences: entries.length,
      });
      continue;
    }

    if (
      ['anxious', 'stressed', 'fatigued', 'celebratory'].includes(moodState) &&
      stressShare >= 0.35
    ) {
      patterns.push({
        id: `${moodState}-habit`,
        moodState,
        direction: 'habit',
        title: `${entries[0]?.moodLabel ?? 'Tagged'} spending is becoming a habit`,
        description: `${entries[0]?.moodLabel ?? 'This'} mood appears on ${Math.round(stressShare * 100)}% of tagged expenses, so it may be shaping routine purchase decisions.`,
        intensity: getStressLevel(stressShare),
        averageSpending: Math.round(averageSpending),
        occurrences: entries.length,
      });
    }
  }

  return patterns.sort((left, right) => right.occurrences - left.occurrences).slice(0, 3);
}

export function analyzeMoodSpendingCorrelation(
  input: MoodCorrelationInput,
): MoodCorrelationSummary {
  const taggedExpenses = summarizeTaggedExpenses(input.transactions);
  const expenseAmounts = input.transactions
    .filter((transaction) => transaction.type === 'EXPENSE')
    .map((transaction) => Math.abs(transaction.amount.amount));
  const baseline = expenseAmounts.length > 0 ? calculateAverage(expenseAmounts) : 0;

  if (taggedExpenses.length === 0) {
    return {
      hasEnoughData: false,
      summary:
        'Add mood tags to a few expenses to see how feelings line up with spending decisions.',
      entriesTagged: 0,
      correlation: 0,
      dominantMoodState: null,
      averageTaggedSpending: 0,
      spikeCount: 0,
      dropCount: 0,
      chart: [],
      patterns: [],
    };
  }

  const moodScores = taggedExpenses.map((entry) => entry.moodScore);
  const spendAmounts = taggedExpenses.map((entry) => entry.amount);
  const correlation = roundToOne(pearsonCorrelation(moodScores, spendAmounts));
  const chart = buildChartPoints(taggedExpenses, baseline, input.maxPoints ?? 8);
  const dominantMoodState = getDominantMoodState(taggedExpenses);
  const patterns = detectPatterns(taggedExpenses, baseline);
  const spikeCount = chart.filter((point) => point.isSpike).length;
  const dropCount = chart.filter((point) => point.isDrop).length;
  const averageTaggedSpending = Math.round(calculateAverage(spendAmounts));
  const hasEnoughData = taggedExpenses.length >= 3;

  const summary = !hasEnoughData
    ? 'Tag a few more expenses to make the mood-to-spending trend more reliable.'
    : correlation >= 0.35
      ? 'Higher-stress moods are lining up with larger purchases.'
      : correlation <= -0.2
        ? 'Calmer moods are lining up with higher spending, suggesting planned purchases.'
        : 'Mood and spending look lightly connected right now, with no strong emotional spending signal.';

  return {
    hasEnoughData,
    summary,
    entriesTagged: taggedExpenses.length,
    correlation,
    dominantMoodState,
    averageTaggedSpending,
    spikeCount,
    dropCount,
    chart,
    patterns,
  };
}

function calculateAverage(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getDominantMoodState(taggedExpenses: readonly TaggedExpense[]): MoodState | null {
  const counts = new Map<MoodState, number>();

  for (const entry of taggedExpenses) {
    counts.set(entry.moodState, (counts.get(entry.moodState) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}
