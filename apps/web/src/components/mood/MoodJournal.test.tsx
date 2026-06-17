// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoodJournal } from './MoodJournal';
import type { MoodJournalEntry } from '../../lib/mood';

const entries: MoodJournalEntry[] = [
  {
    id: 'entry-1',
    timestamp: '2025-03-05T12:00:00Z',
    date: '2025-03-05',
    moodLevel: 2,
    emotions: ['stressed'],
    note: 'Needed a small pick-me-up after work.',
    spending: {
      totalCents: 5600,
      transactionCount: 2,
      categories: [{ category: 'Shopping', amountCents: 5600, transactionCount: 2 }],
    },
  },
];

describe('MoodJournal', () => {
  it('renders entries and exposes edit/delete actions', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<MoodJournal entries={entries} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.getByText('Needed a small pick-me-up after work.')).toBeInTheDocument();
    expect(screen.getByText('Shopping')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onEdit).toHaveBeenCalledWith('entry-1');
    expect(onDelete).toHaveBeenCalledWith('entry-1');
  });
});
