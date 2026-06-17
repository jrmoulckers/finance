// SPDX-License-Identifier: BUSL-1.1

export {
  MOOD_JOURNAL_CHANGED_EVENT,
  MOOD_JOURNAL_STORAGE_KEY,
  clearMoodJournalEntries,
  createMoodJournalEntry,
  deleteMoodJournalEntry,
  listMoodJournalEntries,
  summarizeSpendingForDate,
  updateMoodJournalEntry,
} from './journal';
export { calculateMoodCorrelations } from './correlation';
export { detectEmotionalSpendingPatterns } from './patterns';
export { EMOTION_TAGS } from './types';
export type {
  CategoryMoodCorrelation,
  EmotionalSpendingPattern,
  EmotionSpendCorrelation,
  EmotionTag,
  MoodCorrelationResults,
  MoodJournalEntry,
  MoodJournalEntryInput,
  MoodJournalSpendingSummary,
  MoodLevel,
  MoodSpendingCategory,
  MoodSpendingRecord,
  MoodSpendCorrelationSummary,
  PatternConfidence,
} from './types';
