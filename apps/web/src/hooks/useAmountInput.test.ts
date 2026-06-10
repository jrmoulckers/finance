// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { formatCentsDisplay, parseAmountInput, useAmountInput } from './useAmountInput';

function createKeyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe('useAmountInput', () => {
  it('formats cents with currency grouping', () => {
    expect(formatCentsDisplay(1234567)).toBe('$12,345.67');
  });

  it('parses text input into cents', () => {
    expect(parseAmountInput('$12.34')).toBe(1234);
  });

  it('parses negative text input into cents', () => {
    expect(parseAmountInput('-$12.34')).toBe(-1234);
    expect(parseAmountInput('−12.34')).toBe(-1234);
  });

  it('builds incremental amounts right to left', () => {
    const { result } = renderHook(() => useAmountInput({ mode: 'incremental' }));

    act(() => {
      result.current.handleKeyDown(createKeyEvent('1'));
      result.current.handleKeyDown(createKeyEvent('2'));
      result.current.handleKeyDown(createKeyEvent('3'));
      result.current.handleKeyDown(createKeyEvent('4'));
    });

    expect(result.current.cents).toBe(1234);
    expect(result.current.inputValue).toBe('$12.34');
    expect(result.current.displayValue).toBe('$12.34');
    expect(result.current.isEmpty).toBe(false);
  });

  it('backspaces incremental digits until empty', () => {
    const { result } = renderHook(() =>
      useAmountInput({ mode: 'incremental', initialCents: 1234 }),
    );

    act(() => {
      result.current.handleKeyDown(createKeyEvent('Backspace'));
      result.current.handleKeyDown(createKeyEvent('Backspace'));
      result.current.handleKeyDown(createKeyEvent('Backspace'));
      result.current.handleKeyDown(createKeyEvent('Backspace'));
    });

    expect(result.current.cents).toBe(0);
    expect(result.current.inputValue).toBe('');
    expect(result.current.displayValue).toBe('$0.00');
    expect(result.current.isEmpty).toBe(true);
  });

  it('ignores non-digit keys in incremental mode', () => {
    const { result } = renderHook(() => useAmountInput({ mode: 'incremental' }));
    const event = createKeyEvent('a');

    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.cents).toBe(0);
    expect(result.current.displayValue).toBe('$0.00');
  });

  it('caps incremental values at the configured maximum', () => {
    const { result } = renderHook(() => useAmountInput({ mode: 'incremental', maxCents: 999_999 }));

    act(() => {
      '9999999'.split('').forEach((digit) => {
        result.current.handleKeyDown(createKeyEvent(digit));
      });
    });

    expect(result.current.cents).toBe(999_999);
    expect(result.current.displayValue).toBe('$9,999.99');
  });

  it('supports direct text changes for pasted or typed values', () => {
    const { result } = renderHook(() => useAmountInput());

    act(() => {
      result.current.handleChange({
        target: { value: '45.67' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.cents).toBe(4567);
    expect(result.current.inputValue).toBe('$45.67');
    expect(result.current.displayValue).toBe('$45.67');
  });

  it('toggles negative incremental amounts and formats them with the sign', () => {
    const { result } = renderHook(() =>
      useAmountInput({ mode: 'incremental', allowNegative: true }),
    );

    act(() => {
      result.current.handleKeyDown(createKeyEvent('-'));
      result.current.handleKeyDown(createKeyEvent('1'));
      result.current.handleKeyDown(createKeyEvent('2'));
      result.current.handleKeyDown(createKeyEvent('3'));
      result.current.handleKeyDown(createKeyEvent('4'));
    });

    expect(result.current.sign).toBe('negative');
    expect(result.current.cents).toBe(-1234);
    expect(result.current.inputValue).toBe('-$12.34');
    expect(result.current.displayValue).toBe('-$12.34');
  });

  it('treats direct entry without an explicit sign as positive', () => {
    const { result } = renderHook(() => useAmountInput({ allowNegative: true }));

    act(() => {
      result.current.setSign('negative');
      result.current.handleChange({
        target: { value: '45.67' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.sign).toBe('positive');
    expect(result.current.cents).toBe(4567);
    expect(result.current.displayValue).toBe('$45.67');
  });

  it('forces positive values when negatives are not allowed', () => {
    const { result } = renderHook(() => useAmountInput({ allowNegative: false }));

    act(() => {
      result.current.handleChange({
        target: { value: '-45.67' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.sign).toBe('positive');
    expect(result.current.cents).toBe(4567);
    expect(result.current.displayValue).toBe('$45.67');
  });
});
