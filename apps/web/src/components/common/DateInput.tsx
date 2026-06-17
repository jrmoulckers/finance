// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef, type FocusEvent, type InputHTMLAttributes } from 'react';

export const DATE_INPUT_FOCUS_SETTLE_MS = 100;

export type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Native date input that dismisses the browser picker after focus leaves it.
 */
export function DateInput({ onBlur, onFocus, ...props }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onBlur?.(event);
      clearCloseTimer();

      const nextFocusedElement = event.relatedTarget as Node | null;
      closeTimerRef.current = window.setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;

        const focusStayedInside = nextFocusedElement !== null && input.contains(nextFocusedElement);

        if (!focusStayedInside && document.activeElement !== input) {
          input.blur();
        }

        closeTimerRef.current = null;
      }, DATE_INPUT_FOCUS_SETTLE_MS);
    },
    [clearCloseTimer, onBlur],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      clearCloseTimer();
      onFocus?.(event);
    },
    [clearCloseTimer, onFocus],
  );

  return <input {...props} ref={inputRef} type="date" onBlur={handleBlur} onFocus={handleFocus} />;
}
