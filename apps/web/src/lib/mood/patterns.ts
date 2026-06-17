// SPDX-License-Identifier: BUSL-1.1

import type {
  EmotionalSpendingPattern,
  EmotionTag,
  MoodJournalEntry,
  PatternConfidence,
} from './types';

interface PatternRule {
  readonly id: string;
  readonly title: string;
  readonly emotions: readonly EmotionTag[];
  readonly categoryKeywords: readonly string[];
  readonly emotionalState: string;
  readonly spendingBehavior: string;
  readonly recommendation: string;
  readonly minimumSpendMultiplier: number;
}

const PATTERN_RULES: readonly PatternRule[] = [
  {
    id: 'stress-shopping',
    title: 'Stress → shopping spikes',
    emotions: ['stressed', 'anxious', 'frustrated', 'overwhelmed'],
    categoryKeywords: ['shopping', 'retail', 'clothing', 'beauty', 'electronics', 'gift'],
    emotionalState: 'stress or overwhelm',
    spendingBehavior: 'shopping for relief',
    recommendation:
      'Try a short pause before buying when stress is high and add the item to a wish list first.',
    minimumSpendMultiplier: 1.2,
  },
  {
    id: 'sad-dining',
    title: 'Sad → dining comfort spend',
    emotions: ['sad', 'bored'],
    categoryKeywords: ['dining', 'restaurant', 'food', 'takeout', 'coffee', 'cafe'],
    emotionalState: 'sadness or boredom',
    spendingBehavior: 'comfort dining',
    recommendation:
      'Plan a low-cost comfort ritual ahead of time so meals out are a choice instead of a reflex.',
    minimumSpendMultiplier: 1.1,
  },
  {
    id: 'happy-impulsive',
    title: 'Happy → impulsive treats',
    emotions: ['happy', 'excited', 'celebratory'],
    categoryKeywords: ['shopping', 'entertainment', 'travel', 'hobby', 'gift'],
    emotionalState: 'excitement or celebration',
    spendingBehavior: 'impulse treats',
    recommendation:
      'Set a celebration budget so good moods still have room for fun without spilling over later.',
    minimumSpendMultiplier: 1.15,
  },
];

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasMatchingEmotion(entry: MoodJournalEntry, emotions: readonly EmotionTag[]): boolean {
  return emotions.some((emotion) => entry.emotions.includes(emotion));
}

function categoryMatches(entry: MoodJournalEntry, keywords: readonly string[]): string[] {
  return entry.spending.categories
    .filter((category) =>
      keywords.some((keyword) => category.category.toLowerCase().includes(keyword.toLowerCase())),
    )
    .map((category) => category.category);
}

function describeConfidence(
  supportingEntries: number,
  matchRate: number,
  spendMultiplier: number,
): PatternConfidence {
  if (supportingEntries >= 3 && matchRate >= 0.6 && spendMultiplier >= 1.25) {
    return 'high';
  }

  if (supportingEntries >= 2 && matchRate >= 0.5 && spendMultiplier >= 1.1) {
    return 'medium';
  }

  return 'low';
}

export function detectEmotionalSpendingPatterns(
  entries: readonly MoodJournalEntry[],
): EmotionalSpendingPattern[] {
  if (entries.length < 2) {
    return [];
  }

  const baselineAverage = average(entries.map((entry) => entry.spending.totalCents));
  const patterns: EmotionalSpendingPattern[] = [];

  for (const rule of PATTERN_RULES) {
    const emotionalEntries = entries.filter((entry) => hasMatchingEmotion(entry, rule.emotions));
    if (emotionalEntries.length === 0) {
      continue;
    }

    const matchingEntries = emotionalEntries.filter(
      (entry) => categoryMatches(entry, rule.categoryKeywords).length > 0,
    );

    if (matchingEntries.length === 0) {
      continue;
    }

    const averageSpendCents = average(matchingEntries.map((entry) => entry.spending.totalCents));
    const spendMultiplier = baselineAverage > 0 ? averageSpendCents / baselineAverage : 0;
    const matchRate = matchingEntries.length / emotionalEntries.length;

    if (spendMultiplier < rule.minimumSpendMultiplier && matchRate < 0.5) {
      continue;
    }

    const matchedCategories = Array.from(
      new Set(matchingEntries.flatMap((entry) => categoryMatches(entry, rule.categoryKeywords))),
    );

    patterns.push({
      id: rule.id,
      title: rule.title,
      emotionalState: rule.emotionalState,
      spendingBehavior: rule.spendingBehavior,
      confidence: describeConfidence(matchingEntries.length, matchRate, spendMultiplier),
      supportingEntries: matchingEntries.length,
      averageSpendCents: Math.round(averageSpendCents),
      summary: `${Math.round(matchRate * 100)}% of check-ins with ${rule.emotionalState} also included ${rule.spendingBehavior}.`,
      recommendation: rule.recommendation,
      matchedEmotions: rule.emotions,
      matchedCategories,
    });
  }

  return patterns.sort((left, right) => {
    const confidenceWeight: Record<PatternConfidence, number> = { high: 3, medium: 2, low: 1 };
    return (
      confidenceWeight[right.confidence] - confidenceWeight[left.confidence] ||
      right.averageSpendCents - left.averageSpendCents
    );
  });
}
