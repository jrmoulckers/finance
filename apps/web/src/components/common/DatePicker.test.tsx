// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatePicker } from './DatePicker';

type DatePickerTestProps = Omit<ComponentProps<typeof DatePicker>, 'value' | 'onChange'> & {
  initialValue?: string;
  onValueChange?: (value: string) => void;
};

function renderDatePicker({
  initialValue = '',
  onValueChange,
  ...props
}: DatePickerTestProps = {}) {
  const handleValueChange = onValueChange ?? vi.fn();

  function TestHarness() {
    const [value, setValue] = useState(initialValue);

    return (
      <DatePicker
        id="test-date"
        aria-label="Transaction date"
        value={value}
        onChange={(nextValue) => {
          setValue(nextValue);
          handleValueChange(nextValue);
        }}
        {...props}
      />
    );
  }

  render(<TestHarness />);

  return {
    input: screen.getByRole('textbox', { name: 'Transaction date' }),
    onValueChange: handleValueChange,
  };
}

describe('DatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders a formatted controlled value and accepts ISO input values', () => {
    const { input, onValueChange } = renderDatePicker({ initialValue: '2025-01-15' });

    expect(input).toHaveValue('01/15/2025');

    fireEvent.change(input, { target: { value: '2025-01-20' } });

    expect(onValueChange).toHaveBeenLastCalledWith('2025-01-20');
    expect(input).toHaveValue('01/20/2025');
  });

  it('reports invalid calendar dates distinctly from malformed input', () => {
    const { input, onValueChange } = renderDatePicker();

    // Well-formed MM/DD/YYYY shape, but not a real calendar date.
    fireEvent.change(input, { target: { value: '12/33/2000' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not a valid calendar date — check the month and day.',
    );
    expect(onValueChange).not.toHaveBeenCalled();

    // Genuinely malformed shape gets the format message instead.
    fireEvent.change(input, { target: { value: '6/18/25' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a date in MM/DD/YYYY format.');
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '06/18/2025' } });

    expect(onValueChange).toHaveBeenLastCalledWith('2025-06-18');
    expect(input).toHaveValue('06/18/2025');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation, Enter selection, and Escape closing', () => {
    const { input, onValueChange } = renderDatePicker({ initialValue: '2025-01-15' });

    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent('15');

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });

    expect(onValueChange).toHaveBeenLastCalledWith('2025-01-16');
    expect(input).toHaveValue('01/16/2025');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('exposes the calendar as an ARIA grid with rows, cells, and selection', () => {
    const { input } = renderDatePicker({ initialValue: '2025-01-15' });

    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const grid = screen.getByRole('grid');
    expect(grid).toBeInTheDocument();
    // Calendar weeks are exposed as rows of gridcells.
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(27);

    // The selected day's cell is marked aria-selected.
    const selectedDay = grid.querySelector('.date-picker__day--selected');
    expect(selectedDay).not.toBeNull();
    const selectedCell = selectedDay!.closest('[role="gridcell"]');
    expect(selectedCell).toHaveAttribute('aria-selected', 'true');
  });

  it('supports Today and Clear actions', () => {
    const { input, onValueChange } = renderDatePicker();

    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(onValueChange).toHaveBeenLastCalledWith('2025-06-15');
    expect(input).toHaveValue('06/15/2025');

    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));

    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(input).toHaveValue('');
  });

  it('preserves min constraints and rejects earlier dates', () => {
    const { input, onValueChange } = renderDatePicker({ min: '2025-06-16' });

    expect(input).toHaveAttribute('min', '2025-06-16');

    fireEvent.change(input, { target: { value: '06/15/2025' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert')).toHaveTextContent('Date must be on or after 06/16/2025.');
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '06/16/2025' } });

    expect(onValueChange).toHaveBeenLastCalledWith('2025-06-16');
    expect(input).toHaveValue('06/16/2025');
  });
});
