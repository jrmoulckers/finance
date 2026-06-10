// SPDX-License-Identifier: BUSL-1.1

/**
 * Quick Entry ΓÇö floating action button that expands to a compact transaction form.
 *
 * Provides a keyboard-first, accessible way to quickly log transactions.
 * The FAB shows a "+" icon; clicking or pressing "n" expands the form.
 * Fields: amount (auto-focused), description, category (dropdown), account.
 * Smart defaults: today's date, most-used category.
 *
 * @module components/transactions/QuickEntry
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { AmountDisplay } from '../common/AmountDisplay';
import { useAmountInput } from '../../hooks/useAmountInput';
import { useQuickEntry } from '../../hooks/useQuickEntry';
import { useReducedMotion } from '../../hooks/useReducedMotion';

import './quick-entry.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props for {@link QuickEntry}. */
export interface QuickEntryProps {
  /** Optional CSS class name. */
  className?: string;
}

interface FormErrors {
  amount?: string;
  accountId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a floating action button that expands into a compact transaction form.
 */
export const QuickEntry: React.FC<QuickEntryProps> = ({ className = '' }) => {
  const {
    isOpen,
    open,
    close,
    submitTransaction,
    error: submitError,
    accounts,
    categories,
    suggestCategory,
  } = useQuickEntry();

  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  // Form state
  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    mode: 'incremental',
    maxCents: 99_999_999,
  });
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Focus trap when panel is open
  useFocusTrap(panelRef, { active: isOpen });

  // Reset form and auto-focus amount field when panel opens
  useEffect(() => {
    if (isOpen) {
      amountInput.reset(0);
      setDescription('');
      setCategoryId('');
      setAccountId(accounts.length > 0 ? accounts[0].id : '');
      setErrors({});
      setSaving(false);

      // Auto-focus the amount field
      requestAnimationFrame(() => {
        amountRef.current?.focus();
      });
    }
  }, [isOpen, accounts]);

  // Auto-suggest category when description changes
  useEffect(() => {
    if (description.trim().length > 2) {
      const suggestion = suggestCategory(description, amountInput.cents || undefined);
      if (suggestion) {
        setCategoryId(suggestion.categoryId);
      }
    }
  }, [amountInput.cents, description, suggestCategory]);

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (amountInput.cents <= 0) {
      errs.amount = 'Amount must be a positive number';
    }
    if (!accountId) {
      errs.accountId = 'Please select an account';
    }
    return errs;
  }, [accountId, amountInput.cents]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const formErrors = validate();
      if (Object.keys(formErrors).length > 0) {
        setErrors(formErrors);
        return;
      }

      setSaving(true);

      const selectedAccount = accounts.find((a) => a.id === accountId);
      const householdId = selectedAccount?.householdId ?? '';

      submitTransaction({
        householdId,
        accountId,
        categoryId: categoryId || null,
        amount: { amount: amountInput.cents },
        type: 'EXPENSE',
        date: new Date().toISOString().slice(0, 10),
        note: description.trim() || null,
        isRecurring: false,
      });

      // Auto-close after successful save
      setTimeout(() => {
        setSaving(false);
        close();
      }, 300);
    },
    [
      validate,
      accounts,
      accountId,
      categoryId,
      amountInput.cents,
      description,
      submitTransaction,
      close,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    },
    [close],
  );

  const handleAmountKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (errors.amount && (event.key === 'Backspace' || /^\d$/.test(event.key))) {
        setErrors((current) => ({ ...current, amount: undefined }));
      }

      amountInput.handleKeyDown(event);
    },
    [amountInput, errors.amount],
  );

  const amountErrorId = `${titleId}-amount-error`;
  const amountHelpId = `${titleId}-amount-help`;
  const accountErrorId = `${titleId}-account-error`;

  return (
    <div className={`quick-entry ${className}`}>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="quick-entry-backdrop"
          onClick={close}
          aria-hidden="true"
          data-testid="quick-entry-backdrop"
        />
      )}

      {/* FAB */}
      <button
        type="button"
        className="quick-entry-fab"
        onClick={isOpen ? close : open}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close quick entry' : 'Add transaction'}
        data-testid="quick-entry-fab"
      >
        <span aria-hidden="true">+</span>
      </button>

      {/* Form Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`quick-entry-panel ${saving && !reducedMotion ? 'quick-entry-panel--saving' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={handleKeyDown}
          data-testid="quick-entry-panel"
        >
          <h2 id={titleId} className="quick-entry-panel__title">
            Quick Transaction
          </h2>

          <form onSubmit={handleSubmit} noValidate>
            {/* Amount */}
            <div className="quick-entry-field quick-entry-field--amount">
              <label htmlFor={`${titleId}-amount`}>Amount</label>
              <AmountDisplay
                value={amountInput.displayValue}
                empty={amountInput.isEmpty}
                placeholder={amountInput.placeholderValue}
                className="quick-entry-field__amount-display"
              />
              <p id={amountHelpId} className="quick-entry-field__hint">
                Type digits only. The decimal is placed automatically.
              </p>
              <input
                ref={amountRef}
                id={`${titleId}-amount`}
                type="text"
                inputMode="numeric"
                value={amountInput.inputValue}
                onKeyDown={handleAmountKeyDown}
                onChange={amountInput.handleChange}
                placeholder={amountInput.placeholderValue}
                aria-required="true"
                aria-invalid={!!errors.amount}
                aria-describedby={`${amountHelpId}${errors.amount ? ` ${amountErrorId}` : ''}`}
                data-testid="quick-entry-amount"
              />
              {errors.amount && (
                <span id={amountErrorId} className="quick-entry-field__error" role="alert">
                  {errors.amount}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="quick-entry-field">
              <label htmlFor={`${titleId}-description`}>Description</label>
              <input
                id={`${titleId}-description`}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Coffee, Groceries"
                data-testid="quick-entry-description"
              />
            </div>

            {/* Category */}
            <div className="quick-entry-field">
              <label htmlFor={`${titleId}-category`}>Category</label>
              <select
                id={`${titleId}-category`}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                data-testid="quick-entry-category"
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div className="quick-entry-field">
              <label htmlFor={`${titleId}-account`}>Account</label>
              <select
                id={`${titleId}-account`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.accountId}
                aria-describedby={errors.accountId ? accountErrorId : undefined}
                data-testid="quick-entry-account"
              >
                <option value="">Select account</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
              {errors.accountId && (
                <span id={accountErrorId} className="quick-entry-field__error" role="alert">
                  {errors.accountId}
                </span>
              )}
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="quick-entry-field__error" role="alert">
                {submitError}
              </div>
            )}

            {/* Actions */}
            <div className="quick-entry-actions">
              <button
                type="button"
                className="quick-entry-btn--cancel"
                onClick={close}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="quick-entry-btn--save"
                disabled={saving}
                aria-busy={saving}
                data-testid="quick-entry-save"
              >
                {saving ? 'SavingΓÇª' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
