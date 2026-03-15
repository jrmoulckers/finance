// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible transaction creation form.
 *
 * Renders a modal dialog with fields for creating a new financial transaction:
 * amount (required, > 0), description (required, maps to `payee`), type
 * (radio group, default EXPENSE), category (optional select), account
 * (required select), date (default today), and notes (optional textarea).
 *
 * Validates input client-side with accessible error messages using
 * `aria-invalid` and `aria-describedby`. The `householdId` is derived from
 * the selected account, so no separate household prop is needed.
 *
 * Keyboard support: Tab navigation, Enter submits via the form element,
 * Escape cancels. Focus is trapped within the dialog and the first field
 * is autofocused when the dialog opens.
 *
 * @module components/forms/TransactionForm
 * @see {@link CreateTransactionInput} from db/repositories/transactions
 * References: issue #445
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import type { Account, Category, TransactionType } from '../../kmp/bridge';

import './forms.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Transaction type options for the radio group. */
const TRANSACTION_TYPES: readonly { value: TransactionType; label: string }[] = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link TransactionForm}. */
export interface TransactionFormProps {
  /** Callback invoked with validated form data when the user submits. */
  onSubmit: (data: CreateTransactionInput) => Promise<void>;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /** Available accounts to choose from. */
  accounts: Account[];
  /** Available categories to choose from. */
  categories: Category[];
  /** Whether the form dialog is open. */
  isOpen: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return today's date as an ISO local-date string (YYYY-MM-DD). */
function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  amount?: string;
  description?: string;
  accountId?: string;
}

function validate(
  amountStr: string,
  description: string,
  accountId: string,
): FormErrors {
  const errors: FormErrors = {};

  const parsed = parseFloat(amountStr);
  if (!amountStr.trim() || Number.isNaN(parsed) || parsed <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  }

  if (!description.trim()) {
    errors.description = 'Description is required.';
  }

  if (!accountId) {
    errors.accountId = 'Please select an account.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible modal form for creating a new financial transaction.
 *
 * Provides fields for amount, description, transaction type, category,
 * account, date, and notes. Validates input and surfaces errors with
 * ARIA attributes. Traps focus within the dialog while open.
 */
export function TransactionForm({
  onSubmit,
  onCancel,
  accounts,
  categories,
  isOpen,
}: TransactionFormProps) {
  // -- refs ----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // -- state ---------------------------------------------------------------
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -- focus trap -----------------------------------------------------------
  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  // -- autofocus first field ------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  // -- reset on open -------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDescription('');
      setTransactionType('EXPENSE');
      setCategoryId('');
      setAccountId('');
      setDate(todayISO());
      setNotes('');
      setErrors({});
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [isOpen]);

  // -- handlers ------------------------------------------------------------

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      const fieldErrors = validate(amount, description, accountId);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      // Derive householdId from the selected account.
      const selectedAccount = accounts.find((a) => a.id === accountId);
      if (!selectedAccount) {
        setSubmitError('Selected account not found.');
        return;
      }

      const amountCents = Math.round(parseFloat(amount) * 100);

      const input: CreateTransactionInput = {
        householdId: selectedAccount.householdId,
        accountId,
        type: transactionType,
        amount: { amount: amountCents },
        currency: selectedAccount.currency,
        payee: description.trim(),
        date,
        categoryId: categoryId || null,
        note: notes.trim() || null,
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        // Reset form on success
        setAmount('');
        setDescription('');
        setTransactionType('EXPENSE');
        setCategoryId('');
        setAccountId('');
        setDate(todayISO());
        setNotes('');
        setErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Failed to create transaction.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [amount, description, accountId, accounts, transactionType, date, categoryId, notes, onSubmit],
  );

  // -- render --------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const hasAmountError = Boolean(errors.amount);
  const hasDescriptionError = Boolean(errors.description);
  const hasAccountError = Boolean(errors.accountId);

  return (
    <div
      className="form-dialog"
      role="presentation"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="form-dialog__backdrop"
        aria-hidden="true"
        onClick={handleCancel}
      />

      {/* Dialog panel */}
      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
      >
        <h2 id="transaction-form-title" className="form-dialog__title">
          Create Transaction
        </h2>

        {/* Form-level error */}
        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            {/* Amount */}
            <div className="form-group">
              <label
                htmlFor="txn-amount"
                className="form-group__label form-group__label--required"
              >
                Amount
              </label>
              <input
                ref={firstInputRef}
                id="txn-amount"
                className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={hasAmountError}
                aria-describedby={hasAmountError ? 'txn-amount-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasAmountError && (
                <span id="txn-amount-error" className="form-error" role="alert">
                  {errors.amount}
                </span>
              )}
            </div>

            {/* Description (payee) */}
            <div className="form-group">
              <label
                htmlFor="txn-description"
                className="form-group__label form-group__label--required"
              >
                Description
              </label>
              <input
                id="txn-description"
                className={`form-input${hasDescriptionError ? ' form-input--error' : ''}`}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={hasDescriptionError}
                aria-describedby={
                  hasDescriptionError ? 'txn-description-error' : undefined
                }
                aria-required="true"
                autoComplete="off"
              />
              {hasDescriptionError && (
                <span id="txn-description-error" className="form-error" role="alert">
                  {errors.description}
                </span>
              )}
            </div>

            {/* Type – radio group */}
            <fieldset className="form-radio-group">
              <legend className="form-radio-group__legend">Type</legend>
              <div className="form-radio-group__options" role="radiogroup">
                {TRANSACTION_TYPES.map((t) => (
                  <label key={t.value} className="form-radio-option">
                    <input
                      type="radio"
                      name="txn-type"
                      value={t.value}
                      checked={transactionType === t.value}
                      onChange={() => setTransactionType(t.value)}
                    />
                    <span className="form-radio-option__label">{t.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Category */}
            <div className="form-group">
              <label htmlFor="txn-category" className="form-group__label">
                Category
              </label>
              <select
                id="txn-category"
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div className="form-group">
              <label
                htmlFor="txn-account"
                className="form-group__label form-group__label--required"
              >
                Account
              </label>
              <select
                id="txn-account"
                className={`form-select${hasAccountError ? ' form-select--error' : ''}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-invalid={hasAccountError}
                aria-describedby={hasAccountError ? 'txn-account-error' : undefined}
                aria-required="true"
              >
                <option value="">Select an account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {hasAccountError && (
                <span id="txn-account-error" className="form-error" role="alert">
                  {errors.accountId}
                </span>
              )}
            </div>

            {/* Date */}
            <div className="form-group">
              <label htmlFor="txn-date" className="form-group__label">
                Date
              </label>
              <input
                id="txn-date"
                className="form-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label htmlFor="txn-notes" className="form-group__label">
                Notes
              </label>
              <textarea
                id="txn-notes"
                className="form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="form-actions">
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="form-button form-button--primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Creating…' : 'Create Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
