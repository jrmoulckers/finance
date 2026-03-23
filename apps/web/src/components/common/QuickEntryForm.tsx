// SPDX-License-Identifier: BUSL-1.1

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { announce, useFocusTrap } from '../../accessibility/aria';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import type { TransactionType } from '../../kmp/bridge';
import { centsFromDollars, Currencies } from '../../kmp/bridge';

import '../forms/forms.css';
import '../../styles/quick-entry.css';

/** Props for {@link QuickEntryForm}. */
export interface QuickEntryFormProps {
  /** Whether the form panel is visible. */
  isOpen: boolean;
  /** Callback to close the form without submitting. */
  onClose: () => void;
  /** Callback invoked with the transaction data on successful submission. */
  onSubmit: (data: CreateTransactionInput) => void;
}

/** Format today's date as an ISO-8601 local date string. */
function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Compact inline form for rapid transaction entry.
 *
 * Appears as a slide-up panel (mobile) or popover card (desktop) when
 * opened from the {@link QuickEntryFab}. Includes minimal fields for
 * amount, description, type toggle, and hidden date/account defaults.
 *
 * **Accessibility:**
 * - `role="dialog"` with `aria-label` for screen readers
 * - Focus trap keeps Tab cycling within the form
 * - Success feedback via `aria-live="polite"` region
 * - Escape closes the form
 */
export function QuickEntryForm({ isOpen, onClose, onSubmit }: QuickEntryFormProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [date, setDate] = useState(todayISO);
  const [showDate, setShowDate] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: amountRef,
  });

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Reset form state when opened
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDescription('');
      setType('EXPENSE');
      setDate(todayISO());
      setShowDate(false);
    }
  }, [isOpen]);

  const resetForm = useCallback(() => {
    setAmount('');
    setDescription('');
    setType('EXPENSE');
    setDate(todayISO());
    setShowDate(false);
  }, []);

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();

      const parsedAmount = parseFloat(amount);
      if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) return;
      if (!description.trim()) return;

      const input: CreateTransactionInput = {
        householdId: 'default',
        accountId: 'default',
        type,
        amount: centsFromDollars(parsedAmount),
        currency: Currencies.USD,
        payee: description.trim(),
        date,
      };

      onSubmit(input);

      // Show success toast
      setShowSuccess(true);
      announce('Transaction added successfully.');

      // Reset for next entry
      resetForm();

      // Focus amount input for next entry
      requestAnimationFrame(() => {
        amountRef.current?.focus();
      });
    },
    [amount, description, type, date, onSubmit, resetForm],
  );

  // Hide success toast after delay
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const toggleType = useCallback((newType: TransactionType) => {
    setType(newType);
  }, []);

  if (!isOpen) return null;

  const amountInputId = `${titleId}-amount`;
  const descriptionInputId = `${titleId}-description`;
  const dateInputId = `${titleId}-date`;

  return (
    <>
      <div className="quick-entry-overlay" role="presentation">
        <div className="quick-entry-overlay__backdrop" aria-hidden="true" onClick={onClose} />

        <div
          ref={panelRef}
          className="quick-entry-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Quick add transaction"
          onKeyDown={handleKeyDown}
        >
          <div className="quick-entry-panel__header">
            <h2 id={titleId} className="quick-entry-panel__title">
              Quick add
            </h2>
            <button
              type="button"
              className="quick-entry-panel__close"
              aria-label="Close"
              onClick={onClose}
            >
              <span aria-hidden="true">&#x2715;</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="quick-entry-fields">
              <div className="form-group">
                <label
                  className="form-group__label form-group__label--required"
                  htmlFor={amountInputId}
                >
                  Amount
                </label>
                <input
                  ref={amountRef}
                  id={amountInputId}
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div className="form-group">
                <label
                  className="form-group__label form-group__label--required"
                  htmlFor={descriptionInputId}
                >
                  Description
                </label>
                <input
                  id={descriptionInputId}
                  className="form-input"
                  type="text"
                  placeholder="e.g. Coffee, Groceries"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div className="form-group form-group--full">
                <span className="form-group__label" id={`${titleId}-type-label`}>
                  Type
                </span>
                <div
                  className="quick-entry-type-toggle"
                  role="group"
                  aria-labelledby={`${titleId}-type-label`}
                >
                  <button
                    type="button"
                    className={`quick-entry-type-toggle__btn${type === 'EXPENSE' ? ' quick-entry-type-toggle__btn--active' : ''}`}
                    aria-pressed={type === 'EXPENSE'}
                    onClick={() => toggleType('EXPENSE')}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    className={`quick-entry-type-toggle__btn${type === 'INCOME' ? ' quick-entry-type-toggle__btn--active' : ''}`}
                    aria-pressed={type === 'INCOME'}
                    onClick={() => toggleType('INCOME')}
                  >
                    Income
                  </button>
                </div>
              </div>

              {showDate ? (
                <div className="form-group form-group--full">
                  <label className="form-group__label" htmlFor={dateInputId}>
                    Date
                  </label>
                  <input
                    id={dateInputId}
                    className="form-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="form-group form-group--full">
                  <button
                    type="button"
                    className="form-button form-button--secondary"
                    onClick={() => setShowDate(true)}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '0.25rem 0.5rem',
                      fontSize: 'var(--type-scale-caption-font-size)',
                    }}
                  >
                    Change date
                  </button>
                </div>
              )}
            </div>

            <div className="quick-entry-actions">
              <button type="submit" className="form-button form-button--primary">
                Add transaction
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Success toast — aria-live region */}
      {showSuccess && (
        <div className="quick-entry-toast" role="status" aria-live="polite">
          <span className="quick-entry-toast__icon" aria-hidden="true">
            &#x2713;
          </span>
          Transaction added
        </div>
      )}
    </>
  );
}

export default QuickEntryForm;
