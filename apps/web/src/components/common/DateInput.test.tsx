// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DATE_INPUT_FOCUS_SETTLE_MS, DateInput } from './DateInput';

describe('DateInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('dismisses the picker after focus moves outside the input', () => {
    render(
      <>
        <DateInput aria-label="Date" defaultValue="2024-03-15" />
        <button type="button">Next field</button>
      </>,
    );

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    const nextField = screen.getByRole('button', { name: 'Next field' });
    const blurSpy = vi.fn();

    Object.defineProperty(input, 'blur', {
      value: blurSpy,
      configurable: true,
    });

    act(() => {
      input.focus();
      fireEvent.blur(input, { relatedTarget: nextField });
      nextField.focus();
      vi.advanceTimersByTime(DATE_INPUT_FOCUS_SETTLE_MS);
    });

    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss while focus settles back on the input', () => {
    render(<DateInput aria-label="Date" defaultValue="2024-03-15" />);

    const input = screen.getByLabelText('Date') as HTMLInputElement;
    const blurSpy = vi.fn();

    Object.defineProperty(input, 'blur', {
      value: blurSpy,
      configurable: true,
    });

    act(() => {
      input.focus();
      fireEvent.blur(input, { relatedTarget: input });
      input.focus();
      vi.advanceTimersByTime(DATE_INPUT_FOCUS_SETTLE_MS);
    });

    expect(blurSpy).not.toHaveBeenCalled();
  });
});
