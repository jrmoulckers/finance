// SPDX-License-Identifier: BUSL-1.1

/**
 * PassphraseDialog — accessible modal for setting, changing, or entering the
 * encryption passphrase (#2806).
 *
 * Accessibility (WCAG 2.2 AA):
 *   - `role="dialog"` + `aria-modal`, labelled & described.
 *   - Focus moves to the first field on open and is trapped within the dialog.
 *   - Focus returns to the trigger element on close.
 *   - Errors are announced via an assertive live region (`role="alert"`).
 *   - Validation hints are tied to inputs with `aria-describedby`; the submit
 *     button reflects `aria-disabled`. No information is conveyed by colour
 *     alone (icons + text are used together).
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import { MIN_PASSPHRASE_LENGTH } from '../../db/data-key-wrapping';
import { Checkbox } from '../common/Checkbox';

import './encryption-unlock.css';

export type PassphraseDialogMode = 'set' | 'change' | 'unlock';

export interface PassphraseDialogSubmitValues {
  /** Existing passphrase — present for `change` and `unlock`. */
  readonly current?: string;
  /** The passphrase to set (`set`/`change`) or verify (`unlock`). */
  readonly passphrase: string;
}

export interface PassphraseDialogProps {
  readonly mode: PassphraseDialogMode;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly onSubmit: (values: PassphraseDialogSubmitValues) => Promise<void>;
  readonly onClose: () => void;
}

function nonWhitespaceLength(value: string): number {
  return value.replace(/\s+/g, '').length;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export const PassphraseDialog: React.FC<PassphraseDialogProps> = ({
  mode,
  title,
  description,
  submitLabel,
  onSubmit,
  onClose,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const hintId = useId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [current, setCurrent] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requiresNew = mode === 'set' || mode === 'change';
  const requiresCurrent = mode === 'change' || mode === 'unlock';

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  const close = useCallback(() => {
    if (submitting) {
      return;
    }
    onClose();
  }, [onClose, submitting]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
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
    },
    [close],
  );

  const validate = useCallback((): string | null => {
    if (mode === 'change' && current.length === 0) {
      return 'Enter your current passphrase.';
    }
    if (requiresNew) {
      if (nonWhitespaceLength(passphrase) < MIN_PASSPHRASE_LENGTH) {
        return `Use at least ${MIN_PASSPHRASE_LENGTH} characters for a strong passphrase.`;
      }
      if (passphrase !== confirm) {
        return 'The two passphrases do not match.';
      }
    } else if (passphrase.length === 0) {
      return 'Enter your passphrase.';
    }
    return null;
  }, [confirm, current, mode, passphrase, requiresNew]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        await onSubmit({
          passphrase,
          ...(mode === 'change' ? { current } : {}),
        });
        onClose();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'Something went wrong. Please try again.',
        );
        setSubmitting(false);
      }
    },
    [current, mode, onClose, onSubmit, passphrase, validate],
  );

  const inputType = reveal ? 'text' : 'password';

  return (
    <div className="encryption-dialog__overlay" role="presentation" onMouseDown={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="encryption-dialog"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="encryption-dialog__form" noValidate>
          <h3 id={titleId} className="encryption-dialog__title">
            {title}
          </h3>
          <p id={descriptionId} className="encryption-dialog__description">
            {description}
          </p>

          {requiresCurrent && (
            <div className="encryption-field">
              <label className="encryption-field__label" htmlFor={`${titleId}-current`}>
                {mode === 'unlock' ? 'Passphrase' : 'Current passphrase'}
              </label>
              <input
                ref={firstFieldRef}
                id={`${titleId}-current`}
                className="encryption-field__input"
                type={inputType}
                value={mode === 'unlock' ? passphrase : current}
                onChange={(event) =>
                  mode === 'unlock'
                    ? setPassphrase(event.target.value)
                    : setCurrent(event.target.value)
                }
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={submitting}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
          )}

          {requiresNew && (
            <>
              <div className="encryption-field">
                <label className="encryption-field__label" htmlFor={`${titleId}-new`}>
                  New passphrase
                </label>
                <input
                  ref={requiresCurrent ? undefined : firstFieldRef}
                  id={`${titleId}-new`}
                  className="encryption-field__input"
                  type={inputType}
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={submitting}
                  aria-describedby={hintId}
                />
              </div>
              <div className="encryption-field">
                <label className="encryption-field__label" htmlFor={`${titleId}-confirm`}>
                  Confirm passphrase
                </label>
                <input
                  id={`${titleId}-confirm`}
                  className="encryption-field__input"
                  type={inputType}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={submitting}
                  aria-describedby={error ? errorId : undefined}
                />
              </div>
              <p id={hintId} className="encryption-field__hint">
                Use at least {MIN_PASSPHRASE_LENGTH} characters. If you forget it and have no
                recovery code, the encrypted data on this device cannot be recovered.
              </p>
            </>
          )}

          <Checkbox
            className="encryption-field__reveal"
            label="Show passphrase"
            checked={reveal}
            onChange={(event) => setReveal(event.target.checked)}
            disabled={submitting}
          />

          {error && (
            <p id={errorId} className="encryption-dialog__error" role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠ </span>
              {error}
            </p>
          )}

          <div className="encryption-dialog__actions">
            <button
              type="button"
              className="encryption-button encryption-button--secondary"
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="encryption-button encryption-button--primary"
              disabled={submitting}
              aria-disabled={submitting}
            >
              {submitting ? 'Working…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PassphraseDialog;
