// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible recurring rule creation and editing form.
 *
 * Renders a modal dialog with fields for creating or editing a recurring
 * transaction rule: description (required), amount (required), type
 * (Expense/Income toggle), frequency (select), account (required select),
 * category (optional select), start date (required), end date (optional).
 *
 * Includes a preview section showing the next 3 upcoming dates for the rule.
 *
 * Keyboard support: Tab navigation, Enter submits, Escape cancels.
 * Focus is trapped within the dialog and the first field is autofocused.
 *
 * @module components/forms/RecurringRuleForm
 * @see {@link CreateRecurringRuleInput} from db/repositories/recurring-rules
 * References: todo s7-recurring
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type {
  CreateRecurringRuleInput,
  RecurringFrequency,
  RecurringRule,
  RecurringTransactionType,
} from '../../db/repositories/recurring-rules';
import { getUpcomingTransactions } from '../../db/repositories/recurring-rules';
import type { Account, Category } from '../../kmp/bridge';

import './forms.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: readonly { value: RecurringTransactionType; label: string }[] = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
] as const;

const FREQUENCY_OPTIONS: readonly { value: RecurringFrequency; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link RecurringRuleForm}. */
export interface RecurringRuleFormProps {
  /** Whether the form dialog is open. */
  isOpen: boolean;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /** Callback invoked with validated form data when the user submits. */
  onSubmit: (data: CreateRecurringRuleInput) => void;
  /** Available accounts to choose from. */
  accounts: Account[];
  /** Available categories to choose from. */
  categories: Category[];
  /** Existing rule data used to prefill the form when editing. */
  initialData?: RecurringRule;
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

/** Format a cent amount as a decimal string. */
function centsToDecimal(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  description?: string;
  amount?: string;
  accountId?: string;
  startDate?: string;
}

function validate(
  description: string,
  amountStr: string,
  accountId: string,
  startDate: string,
): FormErrors {
  const errors: FormErrors = {};

  if (!description.trim()) {
    errors.description = 'Description is required.';
  }

  const parsed = parseFloat(amountStr);
  if (Number.isNaN(parsed) || parsed <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  }

  if (!accountId) {
    errors.accountId = 'Please select an account.';
  }

  if (!startDate) {
    errors.startDate = 'Start date is required.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible modal form for creating or editing a recurring transaction rule.
 *
 * Provides fields for description, amount, type, frequency, account,
 * category, start date, and end date. Includes a preview of upcoming
 * occurrences. Validates input and surfaces errors with ARIA attributes.
 * Traps focus within the dialog while open.
 */
export function RecurringRuleForm({
  isOpen,
  onCancel,
  onSubmit,
  accounts,
  categories,
  initialData,
}: RecurringRuleFormProps) {
  // -- refs ----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // -- state ---------------------------------------------------------------
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionType, setTransactionType] = useState<RecurringTransactionType>('EXPENSE');
  const [frequency, setFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const isEditing = initialData !== undefined;

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

  // -- initialize on open --------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    setDescription(initialData?.description ?? '');
    setAmount(initialData ? centsToDecimal(initialData.amount.amount) : '');
    setTransactionType(initialData?.type ?? 'EXPENSE');
    setFrequency(initialData?.frequency ?? 'MONTHLY');
    setAccountId(initialData?.accountId ?? '');
    setCategoryId(initialData?.categoryId ?? '');
    setStartDate(initialData?.startDate ?? todayISO());
    setEndDate(initialData?.endDate ?? '');
    setErrors({});
  }, [initialData, isOpen]);

  // -- preview upcoming dates ----------------------------------------------
  const previewOccurrences = useMemo(() => {
    if (!startDate || !amount || parseFloat(amount) <= 0) return [];

    // Build a temporary rule-like object for preview
    const previewRule: RecurringRule = {
      id: 'preview',
      householdId: '',
      accountId: accountId || '',
      categoryId: categoryId || null,
      description: description || 'Upcoming',
      amount: { amount: Math.round(parseFloat(amount) * 100) },
      type: transactionType,
      frequency,
      startDate,
      endDate: endDate || null,
      lastGeneratedDate: null,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };

    return getUpcomingTransactions(previewRule, 3);
  }, [amount, description, frequency, startDate, endDate, transactionType, accountId, categoryId]);

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
    (e: FormEvent) => {
      e.preventDefault();

      const fieldErrors = validate(description, amount, accountId, startDate);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) return;

      const selectedAccount = accounts.find((a) => a.id === accountId);
      if (!selectedAccount) return;

      const amountCents = Math.round(parseFloat(amount) * 100);

      const input: CreateRecurringRuleInput = {
        householdId: selectedAccount.householdId,
        accountId,
        categoryId: categoryId || null,
        description: description.trim(),
        amount: { amount: amountCents },
        type: transactionType,
        frequency,
        startDate,
        endDate: endDate || null,
      };

      onSubmit(input);
    },
    [
      description,
      amount,
      accountId,
      accounts,
      categoryId,
      transactionType,
      frequency,
      startDate,
      endDate,
      onSubmit,
    ],
  );

  // -- render --------------------------------------------------------------

  if (!isOpen) return null;

  const hasDescriptionError = Boolean(errors.description);
  const hasAmountError = Boolean(errors.amount);
  const hasAccountError = Boolean(errors.accountId);
  const hasStartDateError = Boolean(errors.startDate);

  const dialogTitle = isEditing ? 'Edit Recurring Rule' : 'New Recurring Rule';
  const submitLabel = isEditing ? 'Update Rule' : 'Create Rule';

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />

      {/* Dialog panel */}
      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-form-title"
      >
        <h2 id="recurring-form-title" className="form-dialog__title">
          {dialogTitle}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            {/* Description */}
            <div className="form-group">
              <label
                htmlFor="recurring-description"
                className="form-group__label form-group__label--required"
              >
                Description
              </label>
              <input
                ref={firstInputRef}
                id="recurring-description"
                className={`form-input${hasDescriptionError ? ' form-input--error' : ''}`}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Monthly rent"
                aria-invalid={hasDescriptionError}
                aria-describedby={hasDescriptionError ? 'recurring-description-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasDescriptionError && (
                <span id="recurring-description-error" className="form-error" role="alert">
                  {errors.description}
                </span>
              )}
            </div>

            {/* Amount */}
            <div className="form-group">
              <label
                htmlFor="recurring-amount"
                className="form-group__label form-group__label--required"
              >
                Amount
              </label>
              <input
                id="recurring-amount"
                className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={hasAmountError}
                aria-describedby={hasAmountError ? 'recurring-amount-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasAmountError && (
                <span id="recurring-amount-error" className="form-error" role="alert">
                  {errors.amount}
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
                      name="recurring-type"
                      value={t.value}
                      checked={transactionType === t.value}
                      onChange={() => setTransactionType(t.value)}
                    />
                    <span className="form-radio-option__label">{t.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Frequency */}
            <div className="form-group">
              <label htmlFor="recurring-frequency" className="form-group__label">
                Frequency
              </label>
              <select
                id="recurring-frequency"
                className="form-select"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div className="form-group">
              <label
                htmlFor="recurring-account"
                className="form-group__label form-group__label--required"
              >
                Account
              </label>
              <select
                id="recurring-account"
                className={`form-select${hasAccountError ? ' form-select--error' : ''}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-invalid={hasAccountError}
                aria-describedby={hasAccountError ? 'recurring-account-error' : undefined}
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
                <span id="recurring-account-error" className="form-error" role="alert">
                  {errors.accountId}
                </span>
              )}
            </div>

            {/* Category */}
            <div className="form-group">
              <label htmlFor="recurring-category" className="form-group__label">
                Category
              </label>
              <select
                id="recurring-category"
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

            {/* Start Date */}
            <div className="form-group">
              <label
                htmlFor="recurring-start-date"
                className="form-group__label form-group__label--required"
              >
                Start Date
              </label>
              <input
                id="recurring-start-date"
                className={`form-input${hasStartDateError ? ' form-input--error' : ''}`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-invalid={hasStartDateError}
                aria-describedby={hasStartDateError ? 'recurring-start-date-error' : undefined}
                aria-required="true"
              />
              {hasStartDateError && (
                <span id="recurring-start-date-error" className="form-error" role="alert">
                  {errors.startDate}
                </span>
              )}
            </div>

            {/* End Date */}
            <div className="form-group">
              <label htmlFor="recurring-end-date" className="form-group__label">
                End Date
              </label>
              <input
                id="recurring-end-date"
                className="form-input"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
            </div>
          </div>

          {/* Preview section */}
          {previewOccurrences.length > 0 && (
            <section className="recurring-preview" aria-label="Upcoming occurrences preview">
              <h3 className="recurring-preview__title">Next Occurrences</h3>
              <ul className="recurring-preview__list">
                {previewOccurrences.map((occ, i) => (
                  <li key={i} className="recurring-preview__item">
                    <span className="recurring-preview__date">
                      {new Date(`${occ.date}T00:00:00`).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="recurring-preview__amount">
                      ${(occ.amount.amount / 100).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Actions */}
          <div className="form-actions">
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button type="submit" className="form-button form-button--primary">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
