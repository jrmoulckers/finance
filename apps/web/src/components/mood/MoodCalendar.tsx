// SPDX-License-Identifier: BUSL-1.1

import React, { useId, useMemo } from 'react';

import type { EmotionTag, MoodJournalEntry, MoodLevel } from '../../lib/mood';
import { formatDate } from '../../utils/formatDate';
import {
  EMOTION_VISUALS,
  UNSPECIFIED_REASON_CLASS,
  UNSPECIFIED_REASON_LABEL,
  emotionVisual,
  primaryReason,
} from './emotionVisuals';

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
      const entry = entryByDate.get(key) ?? null;
      const reasonTag = entry ? primaryReason(entry) : null;
      const reasonVisual = reasonTag ? emotionVisual(reasonTag) : null;
      return {
        key,
        weekday: WEEKDAY_LABELS[day.getDay()],
        entry,
        reasonTag,
        reasonLabel: reasonVisual?.label ?? (entry ? UNSPECIFIED_REASON_LABEL : null),
        reasonClass: reasonVisual?.className ?? (entry ? UNSPECIFIED_REASON_CLASS : null),
        isToday: index === DAYS_TO_SHOW - 1,
      };
    });
  }, [entryByDate]);

  const presentReasons = useMemo(() => {
    const seen = new Set<EmotionTag>();
    for (const day of days) {
      if (day.reasonTag) {
        seen.add(day.reasonTag);
      }
    }

    return EMOTION_VISUALS.filter((visual) => seen.has(visual.tag));
  }, [days]);

  const keyLabelId = useId();

  return (
    <section className="mood-calendar" aria-label="Mood calendar heatmap">
      <div className="mood-calendar__header">
        <div>
          <h4 className="mood-calendar__title">Mood over time</h4>
          <p className="mood-calendar__subtitle">
            A five-week view of your daily check-ins. Each square is colored by what was behind that
            day&apos;s mood.
          </p>
        </div>
      </div>
      <div className="mood-calendar__grid" role="grid" aria-label="Mood heatmap grid">
        {days.map((day) => {
          const cellClassName = [
            'mood-calendar__cell',
            day.entry ? day.reasonClass : 'mood-calendar__cell--empty',
            day.isToday ? 'mood-calendar__cell--today' : null,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={day.key} className="mood-calendar__day">
              <span className="mood-calendar__weekday" aria-hidden="true">
                {day.weekday}
              </span>
              <div
                role="gridcell"
                className={cellClassName}
                aria-label={
                  day.entry
                    ? `${formatDate(day.key)}: ${day.reasonLabel} reason, mood ${day.entry.moodLevel} out of 5, spending ${day.entry.spending.totalCents / 100} dollars.`
                    : `${formatDate(day.key)}: no mood check-in.`
                }
                title={
                  day.entry
                    ? `${formatDate(day.key)} • Mood ${day.entry.moodLevel}/5 • ${day.entry.emotions.length > 0 ? day.entry.emotions.join(', ') : UNSPECIFIED_REASON_LABEL}`
                    : `${formatDate(day.key)} • No check-in`
                }
              >
                {day.entry ? (
                  <>
                    <span className="mood-calendar__cell-emoji" aria-hidden="true">
                      {MOOD_EMOJI[day.entry.moodLevel]}
                    </span>
                    <span className="mood-calendar__cell-reason">{day.reasonLabel}</span>
                  </>
                ) : (
                  <span className="mood-calendar__cell-empty-mark" aria-hidden="true">
                    ·
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {presentReasons.length > 0 ? (
        <div className="mood-calendar__key">
          <p className="mood-calendar__key-label" id={keyLabelId}>
            What each color means
          </p>
          <ul className="mood-calendar__legend" aria-labelledby={keyLabelId}>
            {presentReasons.map((visual) => (
              <li key={visual.tag} className="mood-calendar__legend-item">
                <span
                  className={`mood-calendar__legend-swatch ${visual.className}`}
                  aria-hidden="true"
                />
                {visual.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default MoodCalendar;
