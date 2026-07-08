// SPDX-License-Identifier: BUSL-1.1

/**
 * Checkbox — Shared, accessible checkbox control for the web app.
 *
 * Renders a native `<input type="checkbox">` wrapped in a `<label>` so the
 * label text and control are associated without needing a matching `htmlFor`.
 * The native input is styled with `appearance: none` and a CSS-drawn checkmark
 * so size, colors, and the focus ring are identical everywhere it is used.
 *
 * Features:
 * - checked / unchecked / indeterminate / disabled states
 * - clean, correctly-sized `:focus-visible` ring (WCAG 2.2 AA, 2.4.11/2.4.7)
 * - optional hint and error text associated via `aria-describedby`
 * - keyboard operable via native semantics
 *
 * @module components/common/Checkbox
 * References: issue #3545
 */

import React, { useEffect, useId, useRef } from 'react';

import './checkbox.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'ref'
> {
  /** Visible label content rendered next to the control. */
  label?: React.ReactNode;

  /**
   * Indeterminate ("mixed") visual state. Maps to the native
   * `input.indeterminate` DOM property and `aria-checked="mixed"`.
   */
  indeterminate?: boolean;

  /** Optional hint text rendered below the label. */
  hint?: React.ReactNode;

  /** Validation error message. When set, marks the control invalid. */
  error?: string | null;

  /** Additional CSS class for the wrapping label. */
  className?: string;

  /** Position of the label relative to the control. Defaults to `end`. */
  labelPosition?: 'start' | 'end';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible, design-system checkbox.
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="Auto-pay enabled"
 *   checked={isAutoPay}
 *   onChange={(e) => setIsAutoPay(e.target.checked)}
 * />
 * ```
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    indeterminate = false,
    hint,
    error,
    className = '',
    labelPosition = 'end',
    id,
    disabled,
    'aria-describedby': ariaDescribedByProp,
    ...inputProps
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement>(null);
  const reactId = useId();
  const inputId = id ?? `checkbox-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const hasError = Boolean(error);

  // Merge the forwarded ref with the local ref used for the indeterminate DOM prop.
  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  // `indeterminate` is a DOM property, not an attribute — sync it manually.
  useEffect(() => {
    if (localRef.current) {
      localRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const describedBy = [ariaDescribedByProp, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <label
      className={`checkbox ${labelPosition === 'start' ? 'checkbox--label-start' : ''} ${
        disabled ? 'checkbox--disabled' : ''
      } ${hasError ? 'checkbox--error' : ''} ${className}`
        .replace(/\s+/g, ' ')
        .trim()}
    >
      <input
        {...inputProps}
        ref={setRef}
        id={inputId}
        type="checkbox"
        className="checkbox__input"
        disabled={disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
      />
      {(label || hint || error) && (
        <span className="checkbox__content">
          {label != null && <span className="checkbox__label">{label}</span>}
          {hint && (
            <span id={hintId} className="checkbox__hint">
              {hint}
            </span>
          )}
          {hasError && (
            <span id={errorId} className="checkbox__error" role="alert">
              {error}
            </span>
          )}
        </span>
      )}
    </label>
  );
});

export default Checkbox;
