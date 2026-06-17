// SPDX-License-Identifier: BUSL-1.1

export const EMOTION_TAGS = [
  'stressed',
  'anxious',
  'happy',
  'sad',
  'bored',
  'excited',
  'frustrated',
  'content',
  'overwhelmed',
  'celebratory',
] as const;

export type EmotionTag = (typeof EMOTION_TAGS)[number];
export type MoodLevel = 1 | 2 | 3 | 4 | 5;
export type CorrelationStrength = 'weak' | 'moderate' | 'strong';
export type CorrelationDirection = 'positive' | 'negative' | 'flat';
export type PatternConfidence = 'low' | 'medium' | 'high';

export interface MoodSpendingCategory {
  readonly category: string;
  readonly amountCents: number;
  readonly transactionCount: number;
}

export interface MoodJournalSpendingSummary {
  readonly totalCents: number;
  readonly transactionCount: number;
  readonly categories: readonly MoodSpendingCategory[];
}

export interface MoodSpendingRecord {
  readonly date: string;
  readonly amountCents: number;
  readonly category: string;
}

export interface MoodJournalEntryInput {
  readonly timestamp?: string;
  readonly moodLevel: MoodLevel;
  readonly emotions: readonly EmotionTag[];
  readonly note?: string;
}

export interface MoodJournalEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly date: string;
  readonly moodLevel: MoodLevel;
  readonly emotions: readonly EmotionTag[];
  readonly note: string;
  readonly spending: MoodJournalSpendingSummary;
}

export interface MoodSpendCorrelationSummary {
  readonly coefficient: number;
  readonly direction: CorrelationDirection;
  readonly strength: CorrelationStrength;
  readonly sampleSize: number;
  readonly averageMoodLevel: number;
  readonly averageSpendCents: number;
}

export interface EmotionSpendCorrelation {
  readonly emotion: EmotionTag;
  readonly entryCount: number;
  readonly averageMoodLevel: number;
  readonly averageSpendCents: number;
  readonly deltaFromBaselineCents: number;
  readonly topCategories: readonly MoodSpendingCategory[];
}

export interface CategoryMoodCorrelation {
  readonly category: string;
  readonly entryCount: number;
  readonly averageMoodLevel: number;
  readonly totalSpendCents: number;
  readonly averageSpendCents: number;
}

export interface MoodCorrelationResults {
  readonly overall: MoodSpendCorrelationSummary;
  readonly byEmotion: readonly EmotionSpendCorrelation[];
  readonly byCategory: readonly CategoryMoodCorrelation[];
}

export interface EmotionalSpendingPattern {
  readonly id: string;
  readonly title: string;
  readonly emotionalState: string;
  readonly spendingBehavior: string;
  readonly confidence: PatternConfidence;
  readonly supportingEntries: number;
  readonly averageSpendCents: number;
  readonly summary: string;
  readonly recommendation: string;
  readonly matchedEmotions: readonly EmotionTag[];
  readonly matchedCategories: readonly string[];
}
