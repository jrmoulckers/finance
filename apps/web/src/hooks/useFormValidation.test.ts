// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useFormValidation,
  required,
  numericRange,
  maxLength,
  minLength,
  dateRange,
  pattern,
} from './useFormValidation';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Built-in validators
// ---------------------------------------------------------------------------

describe('built-in validators', () => {
  describe('required', () => {
    const validate = required();

    it('returns error for empty string', () => {
      expect(validate('')).toBe('This field is required');
    });

    it('returns error for whitespace-only string', () => {
      expect(validate('   ')).toBe('This field is required');
    });

    it('returns null for non-empty string', () => {
      expect(validate('hello')).toBeNull();
    });

    it('supports custom message', () => {
      const v = required('Name is required');
      expect(v('')).toBe('Name is required');
    });
  });

  describe('numericRange', () => {
    const validate = numericRange(1, 100);

    it('returns null for valid number', () => {
      expect(validate('50')).toBeNull();
    });

    it('returns error for NaN', () => {
      expect(validate('abc')).toBe('Must be a valid number');
    });

    it('returns error for out-of-range value', () => {
      expect(validate('0')).toBe('Must be between 1 and 100');
      expect(validate('101')).toBe('Must be between 1 and 100');
    });

    it('accepts boundary values', () => {
      expect(validate('1')).toBeNull();
      expect(validate('100')).toBeNull();
    });
  });

  describe('maxLength', () => {
    const validate = maxLength(5);

    it('returns null for short string', () => {
      expect(validate('abc')).toBeNull();
    });

    it('returns error for long string', () => {
      expect(validate('abcdef')).toBe('Must be at most 5 characters');
    });
  });

  describe('minLength', () => {
    const validate = minLength(3);

    it('returns null for long enough string', () => {
      expect(validate('abc')).toBeNull();
    });

    it('returns error for short string', () => {
      expect(validate('ab')).toBe('Must be at least 3 characters');
    });
  });

  describe('dateRange', () => {
    it('returns null for empty value (let required handle it)', () => {
      const validate = dateRange('2024-01-01', '2024-12-31');
      expect(validate('')).toBeNull();
    });

    it('returns error for invalid date', () => {
      const validate = dateRange();
      expect(validate('not-a-date')).toBe('Must be a valid date');
    });

    it('returns error for date before min', () => {
      const validate = dateRange('2024-06-01');
      expect(validate('2024-05-01')).toBe('Date must be on or after 2024-06-01');
    });

    it('returns error for date after max', () => {
      const validate = dateRange(undefined, '2024-12-31');
      expect(validate('2025-01-01')).toBe('Date must be on or before 2024-12-31');
    });

    it('returns null for date in range', () => {
      const validate = dateRange('2024-01-01', '2024-12-31');
      expect(validate('2024-06-15')).toBeNull();
    });
  });

  describe('pattern', () => {
    const validate = pattern(/^\d{3}$/, 'Must be exactly 3 digits');

    it('returns null for matching pattern', () => {
      expect(validate('123')).toBeNull();
    });

    it('returns error for non-matching pattern', () => {
      expect(validate('12')).toBe('Must be exactly 3 digits');
    });
  });
});

// ---------------------------------------------------------------------------
// useFormValidation hook
// ---------------------------------------------------------------------------

describe('useFormValidation', () => {
  it('starts with no errors and isValid true', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: [required()],
      }),
    );

    expect(result.current.errors).toEqual({});
    expect(result.current.isValid).toBe(true);
  });

  it('validate returns false and sets errors for invalid fields', async () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: [required('Name is required')],
        amount: [required(), numericRange(1, 1000)],
      }),
    );

    let valid: boolean;
    await act(async () => {
      valid = await result.current.validate({
        name: '',
        amount: '',
      });
    });

    expect(valid!).toBe(false);
    expect(result.current.errors.name).toBe('Name is required');
    expect(result.current.errors.amount).toBe('This field is required');
    expect(result.current.isValid).toBe(false);
  });

  it('validate returns true and clears errors for valid fields', async () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: [required()],
      }),
    );

    await act(async () => {
      await result.current.validate({ name: 'Test' });
    });

    expect(result.current.isValid).toBe(true);
    expect(result.current.errors.name).toBeNull();
  });

  it('validateField sets error for a single field', async () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: [required('Required')],
      }),
    );

    let error: string | null;
    await act(async () => {
      error = await result.current.validateField('name', '');
    });

    expect(error!).toBe('Required');
    expect(result.current.errors.name).toBe('Required');
  });

  it('setFieldError manually sets a field error', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        email: [required()],
      }),
    );

    act(() => {
      result.current.setFieldError('email', 'Already taken');
    });

    expect(result.current.errors.email).toBe('Already taken');
    expect(result.current.isValid).toBe(false);
  });

  it('resetErrors clears all errors', async () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: [required()],
      }),
    );

    await act(async () => {
      await result.current.validate({ name: '' });
    });

    expect(result.current.isValid).toBe(false);

    act(() => {
      result.current.resetErrors();
    });

    expect(result.current.errors).toEqual({});
    expect(result.current.isValid).toBe(true);
  });

  it('supports async validators', async () => {
    const asyncCheck = vi.fn().mockResolvedValue('Username taken');

    const { result } = renderHook(() =>
      useFormValidation({
        username: [required(), asyncCheck],
      }),
    );

    await act(async () => {
      await result.current.validate({ username: 'admin' });
    });

    expect(asyncCheck).toHaveBeenCalledWith('admin');
    expect(result.current.errors.username).toBe('Username taken');
  });

  it('stops at first error per field during validate', async () => {
    const { result } = renderHook(() =>
      useFormValidation({
        amount: [required('Required'), numericRange(1, 100)],
      }),
    );

    await act(async () => {
      await result.current.validate({ amount: '' });
    });

    // Should show 'Required' not the numeric range error
    expect(result.current.errors.amount).toBe('Required');
  });
});
