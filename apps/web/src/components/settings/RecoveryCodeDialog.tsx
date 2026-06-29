// SPDX-License-Identifier: BUSL-1.1

/**
 * RecoveryCodeDialog — shows a freshly generated recovery code exactly once
 * (#2806). The code is a second wrapping factor: it can unlock the same data
 * key if the passphrase is forgotten, so it must be stored somewhere safe.
 *
 * Accessibility: focus moves to the dialog on open, focus is trapped, the code
 * is exposed to assistive tech, and the "Done" action stays disabled until the
 * user confirms they saved the code (not colour-dependent).
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import './encryption-unlock.css';

export interface RecoveryCodeDialogProps {
  readonly code: string;
  readonly onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const RecoveryCodeDialog: React.FC<RecoveryCodeDialogProps> = ({ code, onClose }) => {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [confirmed, setConfirmed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }, [code]);

  return (
    <div className="encryption-dialog__overlay" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="encryption-dialog"
        onKeyDown={handleKeyDown}
      >
        <h3 id={titleId} className="encryption-dialog__title">
          Save your recovery code
        </h3>
        <p id={descriptionId} className="encryption-dialog__description">
          This is the only time we can show this code. Store it in a password manager or another
          safe place. Anyone with this code can unlock your encrypted data, and if you lose both
          your passphrase and this code, the data on this device cannot be recovered.
        </p>

        <pre className="encryption-recovery-code" aria-label="Recovery code" tabIndex={0}>
          {code}
        </pre>

        <div className="encryption-dialog__actions encryption-dialog__actions--start">
          <button
            type="button"
            className="encryption-button encryption-button--secondary"
            onClick={() => {
              void handleCopy();
            }}
          >
            Copy code
          </button>
        </div>

        <p id={statusId} className="encryption-field__hint" role="status" aria-live="polite">
          {copyState === 'copied'
            ? 'Recovery code copied to the clipboard.'
            : copyState === 'failed'
              ? 'Could not copy automatically. Select the code above and copy it manually.'
              : ''}
        </p>

        <label className="encryption-field__reveal">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I have saved my recovery code somewhere safe.
        </label>

        <div className="encryption-dialog__actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="encryption-button encryption-button--primary"
            onClick={onClose}
            disabled={!confirmed}
            aria-disabled={!confirmed}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecoveryCodeDialog;
