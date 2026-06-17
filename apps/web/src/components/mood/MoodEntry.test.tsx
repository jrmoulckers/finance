// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoodEntry } from './MoodEntry';

describe('MoodEntry', () => {
  it('submits a local mood check-in', () => {
    const onSave = vi.fn();

    render(<MoodEntry todaySpendingCents={4200} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /great/i }));
    fireEvent.click(screen.getByRole('button', { name: /happy/i }));
    fireEvent.change(screen.getByLabelText(/optional note/i), {
      target: { value: 'Celebrated with a spontaneous treat.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save check-in/i }));

    expect(onSave).toHaveBeenCalledWith({
      moodLevel: 5,
      emotions: ['happy'],
      note: 'Celebrated with a spontaneous treat.',
    });
  });
});
