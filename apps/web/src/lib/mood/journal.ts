// SPDX-License-Identifier: BUSL-1.1

import type {
  EmotionTag,
  MoodJournalEntry,
  MoodJournalEntryInput,
  MoodJournalSpendingSummary,
  MoodLevel,
  MoodSpendingCategory,
  MoodSpendingRecord,
} from './types';
import { EMOTION_TAGS } from './types';

const MOOD_LEVELS: readonly MoodLevel[] = [1, 2, 3, 4, 5];
const STORAGE_KEY = 'finance-mood-journal-entries';

export const MOOD_JOURNAL_CHANGED_EVENT = 'finance:mood-journal-changed';
export const MOOD_JOURNAL_STORAGE_KEY = STORAGE_KEY;

interface StoredMoodJournalEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly moodLevel: MoodLevel;
  readonly emotions: readonly EmotionTag[];
  readonly note: string;
}

function isMoodLevel(value: unknown): value is MoodLevel {
  return MOOD_LEVELS.includes(value as MoodLevel);
}

function isEmotionTag(value: unknown): value is EmotionTag {
  return EMOTION_TAGS.includes(value as EmotionTag);
}

function normalizeTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function toLocalDate(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEmotions(emotions: readonly EmotionTag[]): EmotionTag[] {
  return Array.from(new Set(emotions.filter(isEmotionTag)));
}

function normalizeStoredEntry(value: unknown): StoredMoodJournalEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Partial<StoredMoodJournalEntry>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  if (!isMoodLevel(candidate.moodLevel)) {
    return null;
  }

  if (!Array.isArray(candidate.emotions)) {
    return null;
  }

  return {
    id: candidate.id,
    timestamp: normalizeTimestamp(candidate.timestamp),
    moodLevel: candidate.moodLevel,
    emotions: normalizeEmotions(candidate.emotions),
    note: typeof candidate.note === 'string' ? candidate.note.trim() : '',
  };
}

function readStoredEntries(): StoredMoodJournalEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeStoredEntry(entry))
      .filter((entry): entry is StoredMoodJournalEntry => entry !== null)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  } catch {
    return [];
  }
}

function persistStoredEntries(entries: readonly StoredMoodJournalEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(MOOD_JOURNAL_CHANGED_EVENT));
}

function createMoodJournalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `mood-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeCategories(records: readonly MoodSpendingRecord[]): MoodSpendingCategory[] {
  const categories = new Map<string, { amountCents: number; transactionCount: number }>();

  for (const record of records) {
    const key = record.category.trim() || 'Uncategorized';
    const existing = categories.get(key) ?? { amountCents: 0, transactionCount: 0 };
    existing.amountCents += Math.abs(record.amountCents);
    existing.transactionCount += 1;
    categories.set(key, existing);
  }

  return Array.from(categories, ([category, value]) => ({
    category,
    amountCents: value.amountCents,
    transactionCount: value.transactionCount,
  })).sort((left, right) => right.amountCents - left.amountCents);
}

export function summarizeSpendingForDate(
  spendingRecords: readonly MoodSpendingRecord[],
  date: string,
): MoodJournalSpendingSummary {
  const records = spendingRecords.filter((record) => record.date === date);
  const totalCents = records.reduce((sum, record) => sum + Math.abs(record.amountCents), 0);

  return {
    totalCents,
    transactionCount: records.length,
    categories: summarizeCategories(records),
  };
}

function hydrateEntry(
  entry: StoredMoodJournalEntry,
  spendingRecords: readonly MoodSpendingRecord[],
): MoodJournalEntry {
  const timestamp = normalizeTimestamp(entry.timestamp);
  const date = toLocalDate(timestamp);

  return {
    id: entry.id,
    timestamp,
    date,
    moodLevel: entry.moodLevel,
    emotions: normalizeEmotions(entry.emotions),
    note: entry.note.trim(),
    spending: summarizeSpendingForDate(spendingRecords, date),
  };
}

export function listMoodJournalEntries(
  spendingRecords: readonly MoodSpendingRecord[] = [],
): MoodJournalEntry[] {
  return readStoredEntries().map((entry) => hydrateEntry(entry, spendingRecords));
}

export function createMoodJournalEntry(
  input: MoodJournalEntryInput,
  spendingRecords: readonly MoodSpendingRecord[] = [],
): MoodJournalEntry {
  const storedEntries = readStoredEntries();
  const entry: StoredMoodJournalEntry = {
    id: createMoodJournalId(),
    timestamp: normalizeTimestamp(input.timestamp),
    moodLevel: input.moodLevel,
    emotions: normalizeEmotions(input.emotions),
    note: input.note?.trim() ?? '',
  };

  persistStoredEntries([entry, ...storedEntries]);
  return hydrateEntry(entry, spendingRecords);
}

export function updateMoodJournalEntry(
  entryId: string,
  updates: MoodJournalEntryInput,
  spendingRecords: readonly MoodSpendingRecord[] = [],
): MoodJournalEntry | null {
  const storedEntries = readStoredEntries();
  const existingEntry = storedEntries.find((entry) => entry.id === entryId);
  if (!existingEntry) {
    return null;
  }

  const updatedEntry: StoredMoodJournalEntry = {
    ...existingEntry,
    timestamp: updates.timestamp ? normalizeTimestamp(updates.timestamp) : existingEntry.timestamp,
    moodLevel: updates.moodLevel,
    emotions: normalizeEmotions(updates.emotions),
    note: updates.note?.trim() ?? '',
  };

  persistStoredEntries(
    storedEntries
      .map((entry) => (entry.id === entryId ? updatedEntry : entry))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
  );

  return hydrateEntry(updatedEntry, spendingRecords);
}

export function deleteMoodJournalEntry(entryId: string): boolean {
  const storedEntries = readStoredEntries();
  const filteredEntries = storedEntries.filter((entry) => entry.id !== entryId);

  if (filteredEntries.length === storedEntries.length) {
    return false;
  }

  persistStoredEntries(filteredEntries);
  return true;
}

export function clearMoodJournalEntries(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(MOOD_JOURNAL_CHANGED_EVENT));
}
