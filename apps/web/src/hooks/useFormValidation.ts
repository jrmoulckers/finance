// SPDX-License-Identifier: BUSL-1.1

/**
 * useFormValidation — Reusable form validation hook.
 *
 * Provides per-field validation with support for required fields, numeric ranges,
 * date ranges, string lengths, custom validators, and async validation
 * (e.g., duplicate checking). Returns per-field error messages and overall
 * validity state.
 *
 * @example
 * ```tsx
 * const { errors, validate, validateField, resetErrors } = useFormValidation({
 *   name: [required('Name is required'), maxLength(100)],
 *   amount: [required('Amount is required'), numericRange(0.01, 1_000_000)],
 * });
 * ```
 *
 * References: issue #1335
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A synchronous validator returns an error string or null if valid. */
export type SyncValidator<T = string> = (value: T) => string | null;

/** An async validator returns a promise that resolves to an error string or null. */
export type AsyncValidator<T = string> = (value: T) => Promise<string | null>;

/** A validator can be synchronous or asynchronous. */
export type Validator<T = string> = SyncValidator<T> | AsyncValidator<T>;

/** Map of field names to arrays of validators. */
export type ValidationRules<F extends string = string> = Partial<Record<F, Validator[]>>;

/** Map of field names to error messages (null = valid). */
export type FieldErrors<F extends string = string> = Partial<Record<F, string | null>>;

/** Result shape returned by {@link useFormValidation}. */
export interface UseFormValidationResult<F extends string = string> {
  /** Per-field error messages. A field is valid if its value is null or absent. */
  errors: FieldErrors<F>;

  /** Whether all fields are currently error-free. */
  isValid: boolean;

  /** Validate all fields in the provided values object. Returns true if all pass. */
  validate: (values: Record<F, unknown>) => Promise<boolean>;

  /** Validate a single field. Returns the error string or null. */
  validateField: (field: F, value: unknown) => Promise<string | null>;

  /** Set a specific field error manually (e.g., from server response). */
  setFieldError: (field: F, error: string | null) => void;

  /** Clear all errors. */
  resetErrors: () => void;
}

// ---------------------------------------------------------------------------
// Built-in validators
// ---------------------------------------------------------------------------

/** Validates that a value is non-empty. */
export function required(message = 'This field is required'): SyncValidator {
  return (value: string) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return message;
    }
    return null;
  };
}

/** Validates that a numeric value falls within [min, max]. */
export function numericRange(min: number, max: number, message?: string): SyncValidator {
  return (value: string) => {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return message ?? 'Must be a valid number';
    }
    if (num < min || num > max) {
      return message ?? `Must be between ${min} and ${max}`;
    }
    return null;
  };
}

/** Validates that a string does not exceed the given length. */
export function maxLength(max: number, message?: string): SyncValidator {
  return (value: string) => {
    if (String(value).length > max) {
      return message ?? `Must be at most ${max} characters`;
    }
    return null;
  };
}

/** Validates that a string meets a minimum length. */
export function minLength(min: number, message?: string): SyncValidator {
  return (value: string) => {
    if (String(value).length < min) {
      return message ?? `Must be at least ${min} characters`;
    }
    return null;
  };
}

/** Validates that a date string falls within an optional range. */
export function dateRange(minDate?: string, maxDate?: string, message?: string): SyncValidator {
  return (value: string) => {
    if (!value) return null; // Let `required` handle emptiness
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return message ?? 'Must be a valid date';
    }
    if (minDate && d < new Date(minDate)) {
      return message ?? `Date must be on or after ${minDate}`;
    }
    if (maxDate && d > new Date(maxDate)) {
      return message ?? `Date must be on or before ${maxDate}`;
    }
    return null;
  };
}

/** Validates using a regular expression pattern. */
export function pattern(regex: RegExp, message: string): SyncValidator {
  return (value: string) => {
    if (!regex.test(String(value))) {
      return message;
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * React hook for declarative form validation.
 *
 * @param rules - A map of field names to arrays of validator functions.
 */
export function useFormValidation<F extends string = string>(
  rules: ValidationRules<F>,
): UseFormValidationResult<F> {
  const [errors, setErrors] = useState<FieldErrors<F>>({});

  const isValid = Object.values(errors).every((e) => e === null || e === undefined);

  const validateField = useCallback(
    async (field: F, value: unknown): Promise<string | null> => {
      const fieldRules = rules[field];
      if (!fieldRules) return null;

      for (const rule of fieldRules) {
        const result = rule(String(value ?? ''));
        const error = result instanceof Promise ? await result : result;
        if (error) {
          setErrors((prev) => ({ ...prev, [field]: error }));
          return error;
        }
      }

      setErrors((prev) => ({ ...prev, [field]: null }));
      return null;
    },
    [rules],
  );

  const validate = useCallback(
    async (values: Record<F, unknown>): Promise<boolean> => {
      const newErrors: FieldErrors<F> = {};
      let valid = true;

      const fields = Object.keys(rules) as F[];
      for (const field of fields) {
        const fieldRules = rules[field];
        if (!fieldRules) continue;

        for (const rule of fieldRules) {
          const result = rule(String(values[field] ?? ''));
          const error = result instanceof Promise ? await result : result;
          if (error) {
            newErrors[field] = error;
            valid = false;
            break; // Stop at first error per field
          }
        }
        if (!newErrors[field]) {
          newErrors[field] = null;
        }
      }

      setErrors(newErrors);
      return valid;
    },
    [rules],
  );

  const setFieldError = useCallback((field: F, error: string | null) => {
    setErrors((prev) => ({ ...prev, [field]: error }));
  }, []);

  const resetErrors = useCallback(() => {
    setErrors({});
  }, []);

  return { errors, isValid, validate, validateField, setFieldError, resetErrors };
}
