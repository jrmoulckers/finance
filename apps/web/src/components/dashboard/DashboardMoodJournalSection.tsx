// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTransactions } from '../../hooks';
import type { Category, Transaction } from '../../kmp/bridge';
import {
  MOOD_JOURNAL_CHANGED_EVENT,
  createMoodJournalEntry,
  deleteMoodJournalEntry,
  detectEmotionalSpendingPatterns,
  listMoodJournalEntries,
  summarizeSpendingForDate,
  updateMoodJournalEntry,
  type MoodJournalEntryInput,
  type MoodSpendingRecord,
} from '../../lib/mood';
import { ErrorBanner, LoadingSpinner } from '../common';
import {
  EmotionalPatterns,
  MoodCalendar,
  MoodEntry,
  MoodJournal,
  SpendingMoodChart,
} from '../mood';

export interface DashboardMoodJournalSectionProps {
  readonly categories: readonly Pick<Category, 'id' | 'name'>[];
  readonly currency: string;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildMoodSpendingRecords(
  transactions: readonly Transaction[],
  categoryNames: ReadonlyMap<string, string>,
): MoodSpendingRecord[] {
  return transactions.map((transaction) => ({
    date: transaction.date,
    amountCents: Math.abs(transaction.amount.amount),
    category:
      transaction.categoryId !== null
        ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
        : 'Uncategorized',
  }));
}

const moodTransactionFilters = { type: 'EXPENSE' as const };

const DashboardMoodJournalSection: FC<DashboardMoodJournalSectionProps> = ({
  categories,
  currency,
}) => {
  const [moodJournalVersion, setMoodJournalVersion] = useState(0);
  const [editingMoodEntryId, setEditingMoodEntryId] = useState<string | null>(null);
  const {
    transactions: moodTransactions,
    loading,
    error,
    refresh,
  } = useTransactions(moodTransactionFilters);

  useEffect(() => {
    const handleMoodJournalChange = () => {
      setMoodJournalVersion((current) => current + 1);
    };

    window.addEventListener('storage', handleMoodJournalChange);
    window.addEventListener(MOOD_JOURNAL_CHANGED_EVENT, handleMoodJournalChange);

    return () => {
      window.removeEventListener('storage', handleMoodJournalChange);
      window.removeEventListener(MOOD_JOURNAL_CHANGED_EVENT, handleMoodJournalChange);
    };
  }, []);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const moodSpendingRecords = useMemo(
    () => buildMoodSpendingRecords(moodTransactions, categoryNames),
    [moodTransactions, categoryNames],
  );
  const moodEntries = useMemo(
    () => listMoodJournalEntries(moodSpendingRecords),
    [moodJournalVersion, moodSpendingRecords],
  );
  const moodPatterns = useMemo(() => detectEmotionalSpendingPatterns(moodEntries), [moodEntries]);
  const todayDate = useMemo(() => formatLocalDate(new Date()), []);
  const todayEntry = useMemo(
    () => moodEntries.find((entry) => entry.date === todayDate) ?? null,
    [moodEntries, todayDate],
  );
  const editingMoodEntry = useMemo(
    () =>
      editingMoodEntryId !== null
        ? (moodEntries.find((entry) => entry.id === editingMoodEntryId) ?? null)
        : null,
    [editingMoodEntryId, moodEntries],
  );
  const activeMoodEntry = editingMoodEntry ?? (editingMoodEntryId === null ? todayEntry : null);
  const todaySpending = useMemo(
    () => summarizeSpendingForDate(moodSpendingRecords, todayDate),
    [moodSpendingRecords, todayDate],
  );

  const handleMoodEntrySave = useCallback(
    (input: MoodJournalEntryInput) => {
      const targetEntryId = editingMoodEntryId ?? todayEntry?.id ?? null;
      if (targetEntryId !== null) {
        updateMoodJournalEntry(targetEntryId, input, moodSpendingRecords);
      } else {
        createMoodJournalEntry(input, moodSpendingRecords);
      }
      setEditingMoodEntryId(null);
    },
    [editingMoodEntryId, moodSpendingRecords, todayEntry],
  );

  const handleMoodEntryDelete = useCallback(
    (entryId: string) => {
      if (!window.confirm('Delete this mood journal entry?')) {
        return;
      }

      deleteMoodJournalEntry(entryId);
      if (editingMoodEntryId === entryId) {
        setEditingMoodEntryId(null);
      }
    },
    [editingMoodEntryId],
  );

  return (
    <section className="page-section mood-section" aria-label="Mood and spending journal">
      <div className="page-section__header">
        <div>
          <h3 className="page-section__title">Emotional Spending Journal</h3>
          <p className="mood-section__intro">
            Local-first mood check-ins that connect your emotional state to same-day spending.
          </p>
        </div>
      </div>
      {loading ? (
        <LoadingSpinner label="Loading mood journal" />
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : (
        <div className="mood-section__grid">
          <div className="card">
            <MoodEntry
              initialEntry={activeMoodEntry}
              todaySpendingCents={todaySpending.totalCents}
              onSave={handleMoodEntrySave}
              onCancel={editingMoodEntryId !== null ? () => setEditingMoodEntryId(null) : undefined}
              isEditing={editingMoodEntryId !== null}
            />
          </div>
          <div className="card">
            <MoodCalendar entries={moodEntries} />
          </div>
          <div className="card mood-section__wide">
            <SpendingMoodChart entries={moodEntries} currency={currency} />
          </div>
          <div className="card">
            <EmotionalPatterns patterns={moodPatterns} />
          </div>
          <div className="card">
            <MoodJournal
              entries={moodEntries}
              activeEntryId={editingMoodEntryId}
              onEdit={setEditingMoodEntryId}
              onDelete={handleMoodEntryDelete}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardMoodJournalSection;
