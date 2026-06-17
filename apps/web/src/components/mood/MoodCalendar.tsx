// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';

import type { MoodJournalEntry, MoodLevel } from '../../lib/mood';
import { formatDate } from '../../utils/formatDate';

const DAYS_TO_SHOW = 35;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MOOD_EMOJI: Record<MoodLevel, string> = {
  1: '😞',
  2: '🙁',
  3: '😐',
  4: '🙂',
  5: '😁',
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface MoodCalendarProps {
  entries: readonly MoodJournalEntry[];
}

export const MoodCalendar: React.FC<MoodCalendarProps> = ({ entries }) => {
  const entryByDate = useMemo(() => {
    const grouped = new Map<string, MoodJournalEntry[]>();
    for (const entry of entries) {
      const existing = grouped.get(entry.date) ?? [];
      existing.push(entry);
      grouped.set(entry.date, existing);
    }

    return new Map(
      Array.from(grouped, ([date, values]) => {
        const moodLevel = Math.round(
          values.reduce((sum, value) => sum + value.moodLevel, 0) / values.length,
        ) as MoodLevel;
        const latest = [...values].sort((left, right) =>
          right.timestamp.localeCompare(left.timestamp),
        )[0];
        return [
          date,
          {
            ...latest,
            moodLevel,
          },
        ];
      }),
    );
  }, [entries]);

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS_TO_SHOW }, (_value, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (DAYS_TO_SHOW - index - 1));
      const key = formatLocalDate(day);
      return {
        key,
        weekday: WEEKDAY_LABELS[day.getDay()],
        entry: entryByDate.get(key) ?? null,
        isToday: index === DAYS_TO_SHOW - 1,
      };
    });
  }, [entryByDate]);

  return (
    <section className="mood-calendar" aria-label="Mood calendar heatmap">
      <div className="mood-calendar__header">
        <div>
          <h4 className="mood-calendar__title">Mood over time</h4>
          <p className="mood-calendar__subtitle">A five-week view of your daily check-ins.</p>
        </div>
        <div className="mood-calendar__legend" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((level) => (
            <span
              key={level}
              className={`mood-calendar__legend-chip mood-calendar__legend-chip--${level}`}
            />
          ))}
        </div>
      </div>
      <div className="mood-calendar__grid" role="grid" aria-label="Mood heatmap grid">
        {days.map((day) => (
          <div key={day.key} className="mood-calendar__day">
            <span className="mood-calendar__weekday" aria-hidden="true">
              {day.weekday}
            </span>
            <div
              role="gridcell"
              className={`mood-calendar__cell${day.entry ? ` mood-calendar__cell--${day.entry.moodLevel}` : ' mood-calendar__cell--empty'}${day.isToday ? ' mood-calendar__cell--today' : ''}`}
              aria-label={
                day.entry
                  ? `${formatDate(day.key)} mood ${day.entry.moodLevel} out of 5, spending ${day.entry.spending.totalCents / 100} dollars.`
                  : `${formatDate(day.key)} no mood check-in`
              }
              title={
                day.entry
                  ? `${formatDate(day.key)} • Mood ${day.entry.moodLevel}/5 • ${day.entry.emotions.join(', ')}`
                  : `${formatDate(day.key)} • No check-in`
              }
            >
              {day.entry ? MOOD_EMOJI[day.entry.moodLevel] : '·'}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MoodCalendar;
