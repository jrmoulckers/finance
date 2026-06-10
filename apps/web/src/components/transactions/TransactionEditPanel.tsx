// SPDX-License-Identifier: BUSL-1.1

/**
 * TransactionEditPanel ΓÇö Slide-over panel for editing transactions.
 *
 * Desktop: slide-over drawer from the right side.
 * Mobile: full-screen modal.
 * Includes focus trapping, backdrop click-to-close, and Escape key handling.
 *
 * @module components/transactions/TransactionEditPanel
 * References: issue #1479
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { DatePicker } from '../common/DatePicker';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import { useAmountInput } from '../../hooks/useAmountInput';
import type { Account, Category, Transaction } from '../../kmp/bridge';
import { AmountInput } from '../forms/AmountInput';
import './transaction-edit-panel.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionEditPanelProps {
  /** The transaction to edit. If null, the panel is hidden. */
  transaction: Transaction | null;
  /** Available accounts for the form. */
  accounts: Account[];
  /** Available categories for the form. */
  categories: Category[];
  /** Callback on save. */
  onSave: (id: string, data: CreateTransactionInput) => Promise<void>;
  /** Callback to close the panel. */
  onClose: () => void;
}

function normalizeTransactionAmount(amountCents: number, type: 'EXPENSE' | 'INCOME' | 'TRANSFER') {
  if (type === 'EXPENSE') {
    return amountCents > 0 ? -amountCents : amountCents;
  }

  if (type === 'INCOME') {
    return Math.abs(amountCents);
  }

  return amountCents;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TransactionEditPanel: React.FC<TransactionEditPanelProps> = ({
  transaction,
  accounts,
  categories,
  onSave,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = transaction !== null;

  useFocusTrap(panelRef, { active: isOpen });

  // Form state
  const [payee, setPayee] = useState('');
  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    mode: 'incremental',
    maxCents: 99_999_999,
    allowNegative: type !== 'INCOME',
  });
  const [date, setDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Populate form when transaction changes
  useEffect(() => {
    if (transaction) {
      setPayee(transaction.payee ?? '');
      amountInput.setCents(transaction.amount.amount);
      setDate(transaction.date);
      setType(transaction.type);
      setCategoryId(transaction.categoryId ?? '');
      setAccountId(transaction.accountId);
      setNote(transaction.note ?? '');
      setSubmitError(null);
    }
  }, [transaction]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (type === 'EXPENSE') {
      amountInput.setSign('negative');
    }

    if (type === 'INCOME') {
      amountInput.setSign('positive');
    }
  }, [amountInput.setSign, isOpen, type]);

  // Escape key closes
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(() => {
    if (!submitting) {
      onClose();
    }
  }, [submitting, onClose]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!transaction) return;

      setSubmitting(true);
      setSubmitError(null);

      try {
        const normalizedAmountCents = normalizeTransactionAmount(amountInput.cents, type);
        if (normalizedAmountCents === 0) {
          setSubmitError('Amount must be greater than zero.');
          return;
        }

        const data: CreateTransactionInput = {
          householdId: transaction.householdId,
          accountId,
          categoryId: categoryId || null,
          type,
          amount: { amount: normalizedAmountCents },
          currency: transaction.currency,
          payee: payee || null,
          note: note || null,
          date,
          status: transaction.status,
        };

        await onSave(transaction.id, data);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to save transaction.');
      } finally {
        setSubmitting(false);
      }
    },
    [transaction, accountId, amountInput.cents, categoryId, type, payee, note, date, onSave],
  );

  if (!isOpen) return null;

  return (
    <div className="edit-panel-overlay" role="presentation">
      <div className="edit-panel-backdrop" onClick={handleBackdropClick} aria-hidden="true" />
      <div
        ref={panelRef}
        className="edit-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-panel-title"
      >
        <header className="edit-panel__header">
          <h2 id="edit-panel-title" className="edit-panel__title">
            Edit Transaction
          </h2>
          <button
            type="button"
            className="edit-panel__close"
            onClick={onClose}
            aria-label="Close edit panel"
            disabled={submitting}
          >
            <span aria-hidden="true">Γ£ò</span>
          </button>
        </header>

        <form className="edit-panel__body" onSubmit={handleSubmit}>
          {submitError && (
            <div className="form-banner-error" role="alert">
              {submitError}
            </div>
          )}

          <div className="form-fields">
            {/* Payee */}
            <div className="form-group">
              <label className="form-group__label" htmlFor="edit-panel-payee">
                Payee
              </label>
              <input
                id="edit-panel-payee"
                type="text"
                className="form-input"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Amount */}
            <div className="form-group">
              <label
                className="form-group__label form-group__label--required"
                htmlFor="edit-panel-amount"
              >
                Amount
              </label>
              <AmountInput
                id="edit-panel-amount"
                amountInput={amountInput}
                className="form-input"
                placeholder="$0.00"
                required
                aria-required="true"
                disabled={submitting}
                toggleLabel="Toggle sign"
              />
            </div>

            {/* Date */}
            <div className="form-group">
              <label
                className="form-group__label form-group__label--required"
                htmlFor="edit-panel-date"
              >
                Date
              </label>
              <DatePicker
                id="edit-panel-date"
                className="form-input"
                value={date}
                onChange={setDate}
                required
                aria-required="true"
                disabled={submitting}
              />
            </div>

            {/* Type */}
            <fieldset className="form-radio-group">
              <legend className="form-radio-group__legend">Type</legend>
              <div className="form-radio-group__options">
                {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((t) => (
                  <label key={t} className="form-radio-option">
                    <input
                      type="radio"
                      name="edit-panel-type"
                      value={t}
                      checked={type === t}
                      onChange={() => setType(t)}
                      disabled={submitting}
                    />
                    <span className="form-radio-option__label">
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Category */}
            <div className="form-group">
              <label className="form-group__label" htmlFor="edit-panel-category">
                Category
              </label>
              <select
                id="edit-panel-category"
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div className="form-group">
              <label
                className="form-group__label form-group__label--required"
                htmlFor="edit-panel-account"
              >
                Account
              </label>
              <select
                id="edit-panel-account"
                className="form-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                aria-required="true"
                disabled={submitting}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Note */}
            <div className="form-group">
              <label className="form-group__label" htmlFor="edit-panel-note">
                Note
              </label>
              <textarea
                id="edit-panel-note"
                className="form-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>
          </div>
        </form>

        <footer className="edit-panel__footer">
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="form-button form-button--primary"
            onClick={handleSubmit}
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'SavingΓÇª' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
};
