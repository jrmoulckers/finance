// SPDX-License-Identifier: BUSL-1.1

/**
 * PasswordInput — accessible password field with a show/hide toggle and a
 * Caps Lock warning. See critique #3770 (items 1 & 2).
 *
 * The component only owns the input + toggle wrapper and an optional Caps Lock
 * notice; the surrounding label, hint and error markup stay with the caller so
 * it drops into both the `auth-field` (signup/reset) and `form-group` (login)
 * layouts. Pass the input's `className` as usual — the toggle is positioned
 * over the field and the field is padded via the shared `.password-input`
 * styles.
 *
 * Accessibility:
 *  - Toggle is a real `<button type="button">` with `aria-pressed` and an
 *    `aria-label` that flips between "Show password" / "Hide password".
 *  - Caps Lock state is announced through a polite live region and linked to
 *    the input via `aria-describedby` while active.
 */

import React, { forwardRef, useCallback, useId, useState } from 'react';

export interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  /** Extra class names for the positioned wrapper around the input + toggle. */
  wrapperClassName?: string;
  /** Accessible label for the toggle when the password is hidden. */
  showPasswordLabel?: string;
  /** Accessible label for the toggle when the password is visible. */
  hidePasswordLabel?: string;
  /** Message shown when Caps Lock is detected. */
  capsLockWarning?: string;
}

function detectCapsLock(event: React.KeyboardEvent<HTMLInputElement>): boolean | null {
  if (typeof event.getModifierState !== 'function') {
    return null;
  }
  return event.getModifierState('CapsLock');
}

/**
 * Password field with an accessible reveal toggle and Caps Lock detection.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      wrapperClassName,
      showPasswordLabel = 'Show password',
      hidePasswordLabel = 'Hide password',
      capsLockWarning = 'Caps Lock is on',
      className,
      onKeyUp,
      onKeyDown,
      onBlur,
      'aria-describedby': ariaDescribedBy,
      ...inputProps
    },
    ref,
  ) => {
    const [visible, setVisible] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);

    const generatedId = useId();
    const capsWarningId = `${inputProps.id ?? generatedId}-caps-warning`;

    const syncCapsLock = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
      const state = detectCapsLock(event);
      if (state !== null) {
        setCapsLockOn(state);
      }
    }, []);

    const handleKeyUp = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        syncCapsLock(event);
        onKeyUp?.(event);
      },
      [onKeyUp, syncCapsLock],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        syncCapsLock(event);
        onKeyDown?.(event);
      },
      [onKeyDown, syncCapsLock],
    );

    const handleBlur = useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        // Clear the warning when focus leaves so it doesn't linger on an
        // unfocused field.
        setCapsLockOn(false);
        onBlur?.(event);
      },
      [onBlur],
    );

    const describedBy =
      [ariaDescribedBy, capsLockOn ? capsWarningId : null].filter(Boolean).join(' ') || undefined;

    return (
      <>
        <div className={['password-input', wrapperClassName].filter(Boolean).join(' ')}>
          <input
            {...inputProps}
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={className}
            onKeyUp={handleKeyUp}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className="password-input__toggle"
            onClick={() => setVisible((current) => !current)}
            aria-pressed={visible}
            aria-label={visible ? hidePasswordLabel : showPasswordLabel}
            disabled={inputProps.disabled}
            tabIndex={0}
          >
            <PasswordVisibilityIcon visible={visible} />
          </button>
        </div>
        {capsLockOn && (
          <p
            id={capsWarningId}
            className="password-input__caps-warning"
            role="status"
            aria-live="polite"
          >
            <svg
              className="password-input__caps-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 3 4 11h4v4h8v-4h4L12 3Zm-4 16h8v2H8v-2Z" fill="currentColor" />
            </svg>
            <span>{capsLockWarning}</span>
          </p>
        )}
      </>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';

interface PasswordVisibilityIconProps {
  visible: boolean;
}

/** Eye / eye-off glyph reflecting the current visibility state. */
const PasswordVisibilityIcon: React.FC<PasswordVisibilityIconProps> = ({ visible }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    {visible ? (
      <>
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.58 10.58a2 2 0 0 0 2.83 2.83M9.36 5.18A9.46 9.46 0 0 1 12 5c5 0 9 4.5 9 7 0 .93-.55 2.12-1.5 3.24M6.11 6.11C3.77 7.57 2 10.03 2 12c0 2.5 4 7 10 7 1.4 0 2.7-.25 3.86-.68"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ) : (
      <>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </>
    )}
  </svg>
);

export default PasswordInput;
