// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';

import { CurrencyDisplay } from '../common/CurrencyDisplay';
import {
  EMOTION_TAGS,
  type EmotionTag,
  type MoodJournalEntry,
  type MoodJournalEntryInput,
  type MoodLevel,
} from '../../lib/mood';
import { formatDate } from '../../utils/formatDate';

const MOOD_LEVEL_OPTIONS: ReadonlyArray<{ value: MoodLevel; emoji: string; label: string }> = [
  { value: 1, emoji: '😞', label: 'Very low' },
  { value: 2, emoji: '🙁', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Neutral' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😁', label: 'Great' },
];

export interface MoodEntryProps {
  initialEntry?: MoodJournalEntry | null;
  todaySpendingCents: number;
  onSave: (input: MoodJournalEntryInput) => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

export const MoodEntry: React.FC<MoodEntryProps> = ({
  initialEntry = null,
  todaySpendingCents,
  onSave,
  onCancel,
  isEditing = false,
}) => {
  const [moodLevel, setMoodLevel] = useState<MoodLevel>(initialEntry?.moodLevel ?? 3);
  const [selectedEmotions, setSelectedEmotions] = useState<readonly EmotionTag[]>(
    initialEntry?.emotions ?? [],
  );
  const [note, setNote] = useState(initialEntry?.note ?? '');

  useEffect(() => {
    setMoodLevel(initialEntry?.moodLevel ?? 3);
    setSelectedEmotions(initialEntry?.emotions ?? []);
    setNote(initialEntry?.note ?? '');
  }, [initialEntry]);

  const helperCopy = useMemo(() => {
    if (isEditing && initialEntry) {
      return `Editing check-in from ${formatDate(initialEntry.date)}.`;
    }

    if (initialEntry) {
      return 'You already checked in today. Update it any time.';
    }

    return 'Track how you feel before or after spending to spot emotional patterns.';
  }, [initialEntry, isEditing]);

  const toggleEmotion = (emotion: EmotionTag) => {
    setSelectedEmotions((current) =>
      current.includes(emotion)
        ? current.filter((value) => value !== emotion)
        : [...current, emotion],
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      moodLevel,
      emotions: selectedEmotions,
      note,
    });
  };

  return (
    <form className="mood-entry" onSubmit={handleSubmit}>
      <div className="mood-entry__header">
        <div>
          <h4 className="mood-entry__title">Quick mood check-in</h4>
          <p className="mood-entry__subtitle">{helperCopy}</p>
        </div>
        <div className="mood-entry__spending">
          <span className="mood-entry__spending-label">Today&apos;s spending</span>
          <CurrencyDisplay amount={todaySpendingCents} context="today's spending" />
        </div>
      </div>

      <fieldset className="mood-entry__fieldset">
        <legend className="mood-entry__legend">How are you feeling?</legend>
        <div className="mood-entry__scale" role="radiogroup" aria-label="Mood level">
          {MOOD_LEVEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`mood-entry__scale-button${moodLevel === option.value ? ' mood-entry__scale-button--active' : ''}`}
              aria-pressed={moodLevel === option.value}
              onClick={() => setMoodLevel(option.value)}
            >
              <span className="mood-entry__scale-emoji" aria-hidden="true">
                {option.emoji}
              </span>
              <span className="mood-entry__scale-label">{option.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mood-entry__fieldset">
        <legend className="mood-entry__legend">What&apos;s behind it?</legend>
        <div className="mood-entry__tags">
          {EMOTION_TAGS.map((emotion) => {
            const active = selectedEmotions.includes(emotion);
            return (
              <button
                key={emotion}
                type="button"
                className={`mood-entry__tag${active ? ' mood-entry__tag--active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleEmotion(emotion)}
              >
                {emotion}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mood-entry__note-label" htmlFor="mood-note">
        Optional note
      </label>
      <textarea
        id="mood-note"
        className="mood-entry__note"
        rows={4}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What happened today? Did any purchase feel emotional or impulsive?"
      />

      <div className="mood-entry__actions">
        <button
          type="submit"
          className="mood-entry__primary"
          disabled={selectedEmotions.length === 0}
        >
          {isEditing ? 'Save changes' : initialEntry ? "Update today's check-in" : 'Save check-in'}
        </button>
        {isEditing && onCancel ? (
          <button type="button" className="mood-entry__secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
};

export default MoodEntry;
