// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useId, useRef, type KeyboardEvent } from 'react';

import { announce, useFocusTrap } from '../../accessibility/aria';

import '../forms/forms.css';

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** Visible dialog title announced by assistive technology. */
  title: string;
  /** Descriptive message explaining the action being confirmed. */
  message: string;
  /** Label for the confirm action button. Defaults to “Delete”. */
  confirmLabel?: string;
  /** Label for the cancel action button. Defaults to “Cancel”. */
  cancelLabel?: string;
  /** Visual emphasis for the confirm action. Defaults to `danger`. */
  variant?: 'danger' | 'warning' | 'info';
  /** Callback invoked when the user confirms the action. */
  onConfirm: () => void;
  /** Callback invoked when the user cancels, presses Escape, or clicks the backdrop. */
  onCancel: () => void;
  /** Whether the confirm action is currently in progress. */
  isLoading?: boolean;
}

/**
 * Render an accessible alert dialog that asks the user to confirm an action.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: cancelButtonRef,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isLoading) {
      announce(`${confirmLabel} in progress.`, 'assertive');
    }
  }, [confirmLabel, isLoading, isOpen]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    if (isLoading) {
      return;
    }

    onConfirm();
  }, [isLoading, onConfirm]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="form-dialog confirm-dialog" role="presentation">
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />

      <div
        ref={panelRef}
        className="form-dialog__panel confirm-dialog__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={handleKeyDown}
      >
        <div className="confirm-dialog__content">
          <h2 id={titleId} className="form-dialog__title confirm-dialog__title">
            {title}
          </h2>
          <p id={messageId} className="confirm-dialog__message">
            {message}
          </p>
        </div>

        <div className="form-actions confirm-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="form-button form-button--secondary"
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`form-button confirm-dialog__confirm confirm-dialog__confirm--${variant}`}
            onClick={handleConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading && <span className="confirm-dialog__spinner" aria-hidden="true" />}
            <span>{isLoading ? `${confirmLabel}…` : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
