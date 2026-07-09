// SPDX-License-Identifier: BUSL-1.1

import React, { forwardRef, useCallback, useId, useState } from 'react';

import './password-input.css';

type NativeInputProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'type'>;

export interface PasswordInputProps extends NativeInputProps {
  /**
   * When true, watches for the Caps Lock modifier while the field is focused
   * and shows a non-blocking, politely-announced warning (#3648).
   */
  showCapsLockWarning?: boolean;
  /** Accessible labels for the reveal toggle in each state. */
  showLabel?: string;
  hideLabel?: string;
  /** Extra class names applied to the wrapper element. */
  wrapperClassName?: string;
}

const EyeIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const EyeOffIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a17.3 17.3 0 0 1-2.16 3.19M6.6 6.6C3.9 8.2 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1.04"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Password field with a show/hide reveal toggle and an optional Caps Lock
 * warning. Shared across the auth surfaces (Login, Signup, Reset) so the
 * password UX stays consistent (#3638, #3648).
 *
 * Forwards its ref to the underlying `<input>` so callers can manage focus and
 * validation exactly as they would with a native element.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  {
    showCapsLockWarning = false,
    showLabel = 'Show password',
    hideLabel = 'Hide password',
    wrapperClassName,
    className,
    onKeyDown,
    onKeyUp,
    onBlur,
    ...rest
  },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const generatedCapsId = useId();
  const capsId = `${generatedCapsId}-caps`;

  const syncCapsLock = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showCapsLockWarning) {
        return;
      }
      if (typeof event.getModifierState === 'function') {
        setCapsLockOn(event.getModifierState('CapsLock'));
      }
    },
    [showCapsLockWarning],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      syncCapsLock(event);
      onKeyDown?.(event);
    },
    [onKeyDown, syncCapsLock],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      syncCapsLock(event);
      onKeyUp?.(event);
    },
    [onKeyUp, syncCapsLock],
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setCapsLockOn(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const describedBy = [rest['aria-describedby'], showCapsLockWarning ? capsId : null]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <span className={['password-input', wrapperClassName].filter(Boolean).join(' ')}>
      <span className="password-input__row">
        <input
          {...rest}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={['password-input__field', className].filter(Boolean).join(' ')}
          aria-describedby={describedBy || undefined}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={handleBlur}
        />
        <button
          type="button"
          className="password-input__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          disabled={rest.disabled}
          tabIndex={0}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
      {showCapsLockWarning && (
        <span id={capsId} className="password-input__caps" role="status" aria-live="polite">
          {capsLockOn ? 'Caps Lock is on.' : ''}
        </span>
      )}
    </span>
  );
});

export default PasswordInput;
