// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible goal creation and editing form.
 *
 * Renders a modal dialog with fields for creating or editing a savings goal:
 * name (required), target amount (required), current amount (defaults to zero),
 * target date (optional), and description (optional).
 *
 * Validates input client-side with accessible error messages using
 * `aria-invalid` and `aria-describedby`. The household ID is resolved from the
 * local database so callers only need to handle the repository input contract.
 *
 * Keyboard support: Tab navigation, Enter submits, Escape cancels.
 * Focus is trapped within the dialog and the first field is autofocused.
 *
 * @module components/forms/GoalForm
 * @see {@link CreateGoalInput} from db/repositories/goals
 * References: issues #444, #487
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
import { useDatabase } from '../../db/DatabaseProvider';
import type { CreateGoalInput } from '../../db/repositories/goals';
import { queryOne, type Row } from '../../db/sqlite-wasm';
import type { Goal, GoalStatus, SyncId } from '../../kmp/bridge';

import './forms.css';

const DEFAULT_GOAL_STATUS: GoalStatus = 'ACTIVE';

/** Props for {@link GoalForm}. */
export interface GoalFormProps {
  /** Whether the form dialog is open. */
  isOpen: boolean;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /** Callback invoked with validated form data when the user submits. */
  onSubmit: (data: CreateGoalInput) => Promise<void>;
  /** Existing goal data used to prefill the form when editing. */
  initialData?: Goal;
}

interface FormErrors {
  name?: string;
  targetAmount?: string;
  currentAmount?: string;
  targetDate?: string;
}

/** Return today's date as an ISO local-date string (YYYY-MM-DD). */
function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Return tomorrow's date as an ISO local-date string (YYYY-MM-DD). */
function tomorrowISO(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format a stored currency amount for a decimal text input. */
function formatAmountForInput(amountInMinorUnits: number, decimalPlaces = 2): string {
  const divisor = Math.pow(10, decimalPlaces);
  return (amountInMinorUnits / divisor).toFixed(decimalPlaces);
}

/** Return an optional goal description when the runtime object includes one. */
function getGoalDescription(goal?: Goal): string {
  const goalWithDescription = goal as (Goal & { description?: string | null }) | undefined;
  return goalWithDescription?.description ?? '';
}

function validate(
  name: string,
  targetAmountStr: string,
  currentAmountStr: string,
  targetDate: string,
  requireFutureTargetDate: boolean,
): FormErrors {
  const errors: FormErrors = {};

  if (!name.trim()) {
    errors.name = 'Goal name is required.';
  }

  const parsedTargetAmount = parseFloat(targetAmountStr);
  if (!targetAmountStr.trim() || Number.isNaN(parsedTargetAmount) || parsedTargetAmount <= 0) {
    errors.targetAmount = 'Target amount must be greater than zero.';
  }

  if (currentAmountStr.trim() !== '') {
    const parsedCurrentAmount = parseFloat(currentAmountStr);
    if (Number.isNaN(parsedCurrentAmount) || parsedCurrentAmount < 0) {
      errors.currentAmount = 'Current amount must be zero or greater.';
    }
  }

  if (requireFutureTargetDate && targetDate && targetDate <= todayISO()) {
    errors.targetDate = 'Target date must be in the future.';
  }

  return errors;
}

/**
 * Query the first household ID from the local SQLite database.
 *
 * @returns The household SyncId or `null` if none exists.
 */
function getFirstHouseholdId(db: ReturnType<typeof useDatabase>): SyncId | null {
  const row = queryOne<Row>(
    db,
    'SELECT id FROM household WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  );
  if (row && typeof row.id === 'string') {
    return row.id;
  }
  return null;
}

/**
 * Accessible modal form for creating or editing a financial goal.
 *
 * Provides fields for name, target amount, current amount, target date, and
 * description. Validates input and surfaces errors with ARIA attributes.
 * Traps focus within the dialog while open.
 */
export function GoalForm({ isOpen, onCancel, onSubmit, initialData }: GoalFormProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const isEditing = initialData !== undefined;

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0.00');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const db = useDatabase();

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const decimalPlaces = initialData?.currency.decimalPlaces ?? 2;

    setName(initialData?.name ?? '');
    setTargetAmount(
      initialData ? formatAmountForInput(initialData.targetAmount.amount, decimalPlaces) : '',
    );
    setCurrentAmount(
      initialData ? formatAmountForInput(initialData.currentAmount.amount, decimalPlaces) : '0.00',
    );
    setTargetDate(initialData?.targetDate ?? '');
    setDescription(getGoalDescription(initialData));
    setErrors({});
    setSubmitting(false);
    setSubmitError(null);
  }, [initialData, isOpen]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const fieldErrors = validate(name, targetAmount, currentAmount, targetDate, !isEditing);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      const householdId = initialData?.householdId ?? getFirstHouseholdId(db);
      if (!householdId) {
        setSubmitError('No household found. Please create a household before saving goals.');
        return;
      }

      const input: CreateGoalInput = {
        householdId,
        name: name.trim(),
        targetAmount: { amount: Math.round(parseFloat(targetAmount) * 100) },
        currentAmount: { amount: Math.round(parseFloat(currentAmount || '0') * 100) },
        targetDate: targetDate || null,
        status: initialData?.status ?? DEFAULT_GOAL_STATUS,
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        setErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : isEditing
              ? 'Failed to update goal.'
              : 'Failed to create goal.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [currentAmount, db, initialData, isEditing, name, onSubmit, targetAmount, targetDate],
  );

  if (!isOpen) {
    return null;
  }

  const hasNameError = Boolean(errors.name);
  const hasTargetAmountError = Boolean(errors.targetAmount);
  const hasCurrentAmountError = Boolean(errors.currentAmount);
  const hasTargetDateError = Boolean(errors.targetDate);
  const minimumTargetDate = isEditing ? undefined : tomorrowISO();
  const dialogTitle = isEditing ? 'Edit Goal' : 'Create Goal';
  const submitLabel = isEditing ? 'Update Goal' : 'Create Goal';
  const submittingLabel = isEditing ? 'Updating…' : 'Creating…';

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />

      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-form-title"
      >
        <h2 id="goal-form-title" className="form-dialog__title">
          {dialogTitle}
        </h2>

        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            <div className="form-group">
              <label htmlFor="goal-name" className="form-group__label form-group__label--required">
                Name
              </label>
              <input
                ref={firstInputRef}
                id="goal-name"
                className={`form-input${hasNameError ? ' form-input--error' : ''}`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Emergency Fund"
                aria-invalid={hasNameError}
                aria-describedby={hasNameError ? 'goal-name-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasNameError && (
                <span id="goal-name-error" className="form-error" role="alert">
                  {errors.name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label
                htmlFor="goal-target-amount"
                className="form-group__label form-group__label--required"
              >
                Target Amount
              </label>
              <input
                id="goal-target-amount"
                className={`form-input${hasTargetAmountError ? ' form-input--error' : ''}`}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={targetAmount}
                onChange={(event) => setTargetAmount(event.target.value)}
                placeholder="0.00"
                aria-invalid={hasTargetAmountError}
                aria-describedby={hasTargetAmountError ? 'goal-target-amount-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasTargetAmountError && (
                <span id="goal-target-amount-error" className="form-error" role="alert">
                  {errors.targetAmount}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="goal-current-amount" className="form-group__label">
                Current Amount
              </label>
              <input
                id="goal-current-amount"
                className={`form-input${hasCurrentAmountError ? ' form-input--error' : ''}`}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={currentAmount}
                onChange={(event) => setCurrentAmount(event.target.value)}
                placeholder="0.00"
                aria-invalid={hasCurrentAmountError}
                aria-describedby={hasCurrentAmountError ? 'goal-current-amount-error' : undefined}
                autoComplete="off"
              />
              {hasCurrentAmountError && (
                <span id="goal-current-amount-error" className="form-error" role="alert">
                  {errors.currentAmount}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="goal-target-date" className="form-group__label">
                Target Date
              </label>
              <input
                id="goal-target-date"
                className={`form-input${hasTargetDateError ? ' form-input--error' : ''}`}
                type="date"
                min={minimumTargetDate}
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                aria-invalid={hasTargetDateError}
                aria-describedby={hasTargetDateError ? 'goal-target-date-error' : undefined}
              />
              {hasTargetDateError && (
                <span id="goal-target-date-error" className="form-error" role="alert">
                  {errors.targetDate}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="goal-description" className="form-group__label">
                Description
              </label>
              <textarea
                id="goal-description"
                className="form-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional notes about this goal"
              />
            </div>
          </div>

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
              {submitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
