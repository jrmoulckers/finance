// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MoodCalendar } from './MoodCalendar';
import type { MoodJournalEntry } from '../../lib/mood';

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildEntry(
  overrides: Partial<MoodJournalEntry> & Pick<MoodJournalEntry, 'date'>,
): MoodJournalEntry {
  return {
    id: `entry-${overrides.date}`,
    timestamp: `${overrides.date}T12:00:00Z`,
    moodLevel: 4,
    emotions: ['happy'],
    note: '',
    spending: { totalCents: 0, transactionCount: 0, categories: [] },
    ...overrides,
  };
}

describe('MoodCalendar', () => {
  it('colors a day cell by its reason and documents it in a labeled key', () => {
    const today = localDate(new Date());
    const entry = buildEntry({ date: today, emotions: ['happy'], moodLevel: 5 });

    const { container } = render(<MoodCalendar entries={[entry]} />);

    const cell = screen.getByRole('gridcell', { name: /Happy reason/ });
    expect(cell).toHaveClass('mood-reason--happy');
    expect(cell).toHaveAccessibleName(/mood 5 out of 5/);

    const key = screen.getByRole('list', { name: /what each color means/i });
    expect(within(key).getByText('Happy')).toBeInTheDocument();

    // The old ambiguous, unlabeled swatch key must be gone.
    expect(container.querySelector('.mood-calendar__legend-chip')).toBeNull();
  });

  it('uses the first selected emotion as the reason color', () => {
    const today = localDate(new Date());
    const entry = buildEntry({ date: today, emotions: ['sad', 'stressed'] });

    render(<MoodCalendar entries={[entry]} />);

    const cell = screen.getByRole('gridcell', { name: /Sad reason/ });
    expect(cell).toHaveClass('mood-reason--sad');
  });

  it('omits the color key when there are no check-ins', () => {
    render(<MoodCalendar entries={[]} />);

    expect(screen.queryByRole('list', { name: /what each color means/i })).not.toBeInTheDocument();
  });
});
