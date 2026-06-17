// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { CurrencyDisplay } from '../common/CurrencyDisplay';
import type { MoodJournalEntry } from '../../lib/mood';
import { formatDate } from '../../utils/formatDate';

const MOOD_EMOJI = ['😞', '🙁', '😐', '🙂', '😁'] as const;

export interface MoodJournalProps {
  entries: readonly MoodJournalEntry[];
  activeEntryId?: string | null;
  onEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}

export const MoodJournal: React.FC<MoodJournalProps> = ({
  entries,
  activeEntryId = null,
  onEdit,
  onDelete,
}) => {
  return (
    <section className="mood-journal" aria-label="Mood journal feed">
      <div className="mood-journal__header">
        <div>
          <h4 className="mood-journal__title">Journal feed</h4>
          <p className="mood-journal__subtitle">
            A scrollable history of how mood and spending moved together.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mood-journal__empty">
          Your check-ins will appear here once you save the first one.
        </p>
      ) : (
        <ul className="mood-journal__list" role="list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`mood-journal__item${activeEntryId === entry.id ? ' mood-journal__item--active' : ''}`}
            >
              <div className="mood-journal__item-header">
                <div>
                  <p className="mood-journal__date">{formatDate(entry.date)}</p>
                  <p className="mood-journal__time">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="mood-journal__mood" aria-label={`Mood ${entry.moodLevel} out of 5`}>
                  <span aria-hidden="true">{MOOD_EMOJI[entry.moodLevel - 1]}</span>
                  <span>{entry.moodLevel}/5</span>
                </div>
              </div>

              <div className="mood-journal__tags">
                {entry.emotions.map((emotion) => (
                  <span key={`${entry.id}-${emotion}`} className="mood-journal__tag">
                    {emotion}
                  </span>
                ))}
              </div>

              {entry.note ? <p className="mood-journal__note">{entry.note}</p> : null}

              <dl className="mood-journal__stats">
                <div>
                  <dt>Spent that day</dt>
                  <dd>
                    <CurrencyDisplay
                      amount={entry.spending.totalCents}
                      context="daily spending in mood journal"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Transactions</dt>
                  <dd>{entry.spending.transactionCount}</dd>
                </div>
                <div>
                  <dt>Top category</dt>
                  <dd>{entry.spending.categories[0]?.category ?? 'None'}</dd>
                </div>
              </dl>

              <div className="mood-journal__actions">
                <button
                  type="button"
                  className="mood-journal__action"
                  onClick={() => onEdit(entry.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="mood-journal__action mood-journal__action--danger"
                  onClick={() => onDelete(entry.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default MoodJournal;
