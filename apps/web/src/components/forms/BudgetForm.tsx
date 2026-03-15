// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible budget creation form.
 *
 * Renders a modal dialog with fields for creating a new budget:
 * category (required select), amount (required, dollars → cents),
 * period (select, default Monthly), and start date (default first of current
 * month).
 *
 * Validates input client-side with accessible error messages using
 * `aria-invalid` and `aria-describedby`. The `householdId` and budget `name`
 * are derived from the selected category, so no separate household prop is
 * needed. Amount is stored as integer cents — never as a float.
 *
 * Keyboard support: Tab navigation, Enter submits via the form element,
 * Escape cancels. Focus is trapped within the dialog and the first field
 * is autofocused when the dialog opens.
 *
 * @module components/forms/BudgetForm
 * @see {@link CreateBudgetInput} from db/repositories/budgets
 * References: issue #461
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
import type { CreateBudgetInput } from '../../db/repositories/budgets';
import type { BudgetPeriod, Category } from '../../kmp/bridge';

import './forms.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Period options for the budget period select, ordered by display preference. */
const BUDGET_PERIODS: readonly { value: BudgetPeriod; label: string }[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link BudgetForm}. */
export interface BudgetFormProps {
  /** Whether the form dialog is open. */
  isOpen: boolean;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /**
   * Callback invoked with validated form data when the user submits.
   * The `amount` field is already in integer cents.
   */
  onSubmit: (data: CreateBudgetInput) => Promise<void>;
  /** Available categories to assign the budget to. */
  categories: Category[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the first day of the current month as an ISO local-date string (YYYY-MM-01). */
function firstOfCurrentMonthISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  categoryId?: string;
  amount?: string;
}

function validate(categoryId: string, amountStr: string): FormErrors {
  const errors: FormErrors = {};

  if (!categoryId) {
    errors.categoryId = 'Please select a category.';
  }

  const parsed = parseFloat(amountStr);
  if (!amountStr.trim() || Number.isNaN(parsed) || parsed <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible modal form for creating a new budget.
 *
 * Provides fields for category, amount (dollars, converted to integer cents
 * before submission), period, and start date. Validates input and surfaces
 * errors with ARIA attributes. Traps focus within the dialog while open.
 */
export function BudgetForm({ isOpen, onCancel, onSubmit, categories }: BudgetFormProps) {
  // -- refs ----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);

  // -- state ---------------------------------------------------------------
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('MONTHLY');
  const [startDate, setStartDate] = useState(firstOfCurrentMonthISO);
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
      setCategoryId('');
      setAmount('');
      setPeriod('MONTHLY');
      setStartDate(firstOfCurrentMonthISO());
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

      const fieldErrors = validate(categoryId, amount);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      // Derive householdId and name from the selected category.
      const selectedCategory = categories.find((c) => c.id === categoryId);
      if (!selectedCategory) {
        setSubmitError('Selected category not found.');
        return;
      }

      // Convert dollars to integer cents — never store floats as money.
      const amountCents = Math.round(parseFloat(amount) * 100);

      const input: CreateBudgetInput = {
        householdId: selectedCategory.householdId,
        categoryId,
        name: selectedCategory.name,
        amount: { amount: amountCents },
        period,
        startDate,
        endDate: null,
        isRollover: false,
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        // Reset form on success
        setCategoryId('');
        setAmount('');
        setPeriod('MONTHLY');
        setStartDate(firstOfCurrentMonthISO());
        setErrors({});
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to create budget.');
      } finally {
        setSubmitting(false);
      }
    },
    [categoryId, amount, period, startDate, categories, onSubmit],
  );

  // -- render --------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const hasCategoryError = Boolean(errors.categoryId);
  const hasAmountError = Boolean(errors.amount);

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
        aria-labelledby="budget-form-title"
      >
        <h2 id="budget-form-title" className="form-dialog__title">
          Create Budget
        </h2>

        {/* Form-level error */}
        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            {/* Category */}
            <div className="form-group">
              <label
                htmlFor="budget-category"
                className="form-group__label form-group__label--required"
              >
                Category
              </label>
              <select
                ref={firstInputRef}
                id="budget-category"
                className={`form-select${hasCategoryError ? ' form-select--error' : ''}`}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-invalid={hasCategoryError}
                aria-describedby={hasCategoryError ? 'budget-category-error' : undefined}
                aria-required="true"
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {hasCategoryError && (
                <span id="budget-category-error" className="form-error" role="alert">
                  {errors.categoryId}
                </span>
              )}
            </div>

            {/* Amount (dollars — converted to cents on submit) */}
            <div className="form-group">
              <label
                htmlFor="budget-amount"
                className="form-group__label form-group__label--required"
              >
                Amount
              </label>
              <input
                id="budget-amount"
                className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={hasAmountError}
                aria-describedby={hasAmountError ? 'budget-amount-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasAmountError && (
                <span id="budget-amount-error" className="form-error" role="alert">
                  {errors.amount}
                </span>
              )}
            </div>

            {/* Period */}
            <div className="form-group">
              <label htmlFor="budget-period" className="form-group__label">
                Period
              </label>
              <select
                id="budget-period"
                className="form-select"
                value={period}
                onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
              >
                {BUDGET_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div className="form-group">
              <label htmlFor="budget-start-date" className="form-group__label">
                Start Date
              </label>
              <input
                id="budget-start-date"
                className="form-input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
              {submitting ? 'Creating…' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
