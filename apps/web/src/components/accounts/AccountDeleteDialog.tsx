// SPDX-License-Identifier: BUSL-1.1

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { Checkbox } from '../common/Checkbox';

import '../forms/forms.css';
import './account-delete-dialog.css';

/** Props for {@link AccountDeleteDialog}. */
export interface AccountDeleteDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** The name of the account being deleted. */
  accountName: string;
  /** Number of transactions linked to this account. */
  transactionCount: number;
  /** Callback when the user confirms deletion. */
  onConfirm: (deleteTransactions: boolean) => void;
  /** Callback when the user cancels. */
  onCancel: () => void;
  /** Whether the delete action is in progress. */
  isLoading?: boolean;
}

/**
 * Multi-section account deletion dialog with transaction count warning,
 * optional cascade delete, and type-to-confirm for destructive actions.
 */
export function AccountDeleteDialog({
  isOpen,
  accountName,
  transactionCount,
  onConfirm,
  onCancel,
  isLoading = false,
}: AccountDeleteDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const warningId = useId();
  const cascadeWarningId = useId();

  const [deleteTransactions, setDeleteTransactions] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: cancelButtonRef,
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setDeleteTransactions(false);
      setConfirmationText('');
    }
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const confirmationValid =
    !deleteTransactions ||
    confirmationText.trim().toLowerCase() === accountName.trim().toLowerCase();

  const handleConfirm = useCallback(() => {
    if (isLoading || !confirmationValid) return;
    onConfirm(deleteTransactions);
  }, [isLoading, confirmationValid, onConfirm, deleteTransactions]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleCheckboxChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDeleteTransactions(event.target.checked);
    if (!event.target.checked) {
      setConfirmationText('');
    }
  }, []);

  const handleConfirmationInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setConfirmationText(event.target.value);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="form-dialog account-delete-dialog" role="presentation">
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />

      <div
        ref={panelRef}
        className="form-dialog__panel account-delete-dialog__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={warningId}
        onKeyDown={handleKeyDown}
      >
        {/* Title */}
        <h2 id={titleId} className="form-dialog__title">
          Delete Account
        </h2>

        {/* Section 1: Transaction count warning */}
        <div className="account-delete-dialog__section">
          <p id={warningId} className="account-delete-dialog__warning">
            {transactionCount > 0
              ? `This account has ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}.`
              : 'This account has no transactions.'}
          </p>
        </div>

        {/* Section 2: Default behavior explanation */}
        {transactionCount > 0 && (
          <div className="account-delete-dialog__section">
            <p className="account-delete-dialog__info">
              Transactions will be kept but unlinked from this account.
            </p>
          </div>
        )}

        {/* Section 3: Optional cascade delete */}
        {transactionCount > 0 && (
          <div className="account-delete-dialog__section">
            <Checkbox
              className="account-delete-dialog__checkbox-label"
              label={`Also delete all ${transactionCount} transaction${
                transactionCount === 1 ? '' : 's'
              }`}
              checked={deleteTransactions}
              onChange={handleCheckboxChange}
              aria-describedby={cascadeWarningId}
            />
            <p
              id={cascadeWarningId}
              className="account-delete-dialog__cascade-warning"
              role="alert"
              aria-live="polite"
            >
              {deleteTransactions && <strong>⚠️ Permanent. This cannot be undone.</strong>}
            </p>
          </div>
        )}

        {/* Section 4: Type account name to confirm */}
        {deleteTransactions && (
          <div className="account-delete-dialog__section">
            <label className="account-delete-dialog__confirm-label" htmlFor="delete-confirm-input">
              Type <strong>&ldquo;{accountName}&rdquo;</strong> to confirm:
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              className="form-input account-delete-dialog__confirm-input"
              value={confirmationText}
              onChange={handleConfirmationInput}
              aria-invalid={confirmationText.length > 0 && !confirmationValid}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* Actions */}
        <div className="form-actions account-delete-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="form-button form-button--secondary"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="form-button confirm-dialog__confirm confirm-dialog__confirm--danger"
            onClick={handleConfirm}
            disabled={isLoading || !confirmationValid}
            aria-busy={isLoading}
            aria-disabled={!confirmationValid}
          >
            {isLoading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountDeleteDialog;
