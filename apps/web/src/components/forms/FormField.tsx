// SPDX-License-Identifier: BUSL-1.1

/**
 * FormField — Accessible form field wrapper component.
 *
 * Wraps a form control with a label, optional hint text, and error display.
 * Uses aria-describedby for error association, aria-required for required
 * fields, and proper label-input binding via htmlFor.
 *
 * @module components/forms/FormField
 * References: issue #1335
 */

import React from 'react';

import './form-field.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormFieldProps {
  /** The visible label text for the form control. */
  label: string;

  /** The id of the controlled input element (used for htmlFor). */
  htmlFor: string;

  /** Whether this field is required. Adds visual indicator and aria-required. */
  required?: boolean;

  /** Validation error message. When set, shows error and marks input invalid. */
  error?: string | null;

  /** Optional hint text displayed below the label. */
  hint?: string;

  /** Additional CSS class for the wrapper. */
  className?: string;

  /** The form control(s) to render inside this field. */
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible form field wrapper.
 *
 * Renders a label, optional hint, the child control, and any validation error.
 * Associates errors via aria-describedby for screen reader announcement.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  className = '',
  children,
}) => {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const hasError = Boolean(error);

  // Build aria-describedby from available descriptions
  const describedBy =
    [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`form-field ${hasError ? 'form-field--error' : ''} ${className}`.trim()}>
      <label
        htmlFor={htmlFor}
        className={`form-field__label ${required ? 'form-field__label--required' : ''}`.trim()}
      >
        {label}
      </label>

      {hint && (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      )}

      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;

        // Clone the child to inject accessibility attributes
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          'aria-required': required || undefined,
          'aria-invalid': hasError || undefined,
          'aria-describedby': describedBy,
        });
      })}

      {hasError && (
        <p id={errorId} className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
