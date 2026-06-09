// SPDX-License-Identifier: BUSL-1.1

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type { Goal } from '../../kmp/bridge';
import type { GoalContributionInput } from '../../db/repositories/goals';
import { useMoneyDisplay } from '../../lib/display-settings';
import { ConfirmDialog, CurrencyDisplay } from '../common';
import '../forms/forms.css';

export interface GoalContributionDialogProps {
  isOpen: boolean;
  goal: Goal | null;
  onSubmit: (input: GoalContributionInput) => Promise<void> | void;
  onCancel: () => void;
}

function parseContributionAmount(value: string, decimalPlaces = 2): number | null {
  const normalized = value
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * Math.pow(10, decimalPlaces));
}

function formatInputAmount(
  amountInMinorUnits: number,
  currency: string,
  decimalPlaces: number,
  currencyDisplay: Intl.NumberFormatOptions['currencyDisplay'],
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay,
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(amountInMinorUnits / Math.pow(10, decimalPlaces));
}

export function GoalContributionDialog({
  isOpen,
  goal,
  onSubmit,
  onCancel,
}: GoalContributionDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const amountErrorId = useId();
  const titleId = useId();
  const displaySettings = useMoneyDisplay();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingInput, setPendingInput] = useState<GoalContributionInput | null>(null);

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAmount('');
    setNote('');
    setAmountError(null);
    setSubmitError(null);
    setSubmitting(false);
    setPendingInput(null);

    const id = requestAnimationFrame(() => {
      amountInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(id);
  }, [goal?.id, isOpen]);

  const handleCancel = useCallback(() => {
    if (submitting) {
      return;
    }

    onCancel();
  }, [onCancel, submitting]);

  const submitContribution = useCallback(
    async (input: GoalContributionInput) => {
      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        setAmount('');
        setNote('');
        setPendingInput(null);
        onCancel();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to contribute to goal.');
      } finally {
        setSubmitting(false);
      }
    },
    [onCancel, onSubmit],
  );

  const buildContributionInput = useCallback((): GoalContributionInput | null => {
    if (!goal) {
      return null;
    }

    const amountInMinorUnits = parseContributionAmount(amount, goal.currency.decimalPlaces);
    if (amountInMinorUnits === null) {
      setAmountError('Enter a positive contribution amount.');
      return null;
    }

    setAmountError(null);
    return {
      goalId: goal.id,
      amount: { amount: amountInMinorUnits },
      note: note.trim() || null,
    };
  }, [amount, goal, note]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const input = buildContributionInput();
      if (!goal || input === null) {
        return;
      }

      if (goal.currentAmount.amount + input.amount.amount > goal.targetAmount.amount) {
        setPendingInput(input);
        return;
      }

      await submitContribution(input);
    },
    [buildContributionInput, goal, submitContribution],
  );

  const handleConfirmOverGoal = useCallback(async () => {
    if (pendingInput === null) {
      return;
    }

    await submitContribution(pendingInput);
  }, [pendingInput, submitContribution]);

  const handleCancelOverGoal = useCallback(() => {
    setPendingInput(null);
  }, []);

  const handleAmountBlur = useCallback(() => {
    if (!goal) {
      return;
    }

    const amountInMinorUnits = parseContributionAmount(amount, goal.currency.decimalPlaces);
    if (amountInMinorUnits === null) {
      return;
    }

    setAmount(
      formatInputAmount(
        amountInMinorUnits,
        goal.currency.code,
        goal.currency.decimalPlaces,
        displaySettings.currencyDisplay,
      ),
    );
  }, [amount, displaySettings.currencyDisplay, goal]);

  const handleAmountFocus = useCallback(() => {
    if (!goal) {
      return;
    }

    const amountInMinorUnits = parseContributionAmount(amount, goal.currency.decimalPlaces);
    if (amountInMinorUnits === null) {
      return;
    }

    setAmount(
      (amountInMinorUnits / Math.pow(10, goal.currency.decimalPlaces)).toFixed(
        goal.currency.decimalPlaces,
      ),
    );
  }, [amount, goal]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCancel],
  );

  if (!isOpen || goal === null) {
    return null;
  }

  const hasAmountError = amountError !== null;
  const projectedAmount = (() => {
    const parsed = parseContributionAmount(amount, goal.currency.decimalPlaces);
    return parsed === null ? goal.currentAmount.amount : goal.currentAmount.amount + parsed;
  })();

  return (
    <>
      <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
        <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleCancel} />
        <div
          ref={panelRef}
          className="form-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <h2 id={titleId} className="form-dialog__title">
            Contribute to {goal.name}
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--spacing-3)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            <div>
              <p className="card__title">Current</p>
              <p className="card__value">
                <CurrencyDisplay amount={goal.currentAmount.amount} currency={goal.currency.code} />
              </p>
            </div>
            <div>
              <p className="card__title">After contribution</p>
              <p className="card__value">
                <CurrencyDisplay amount={projectedAmount} currency={goal.currency.code} />
              </p>
            </div>
          </div>

          {submitError && (
            <div className="form-banner-error" role="alert">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-fields">
              <div className="form-group">
                <label
                  htmlFor="goal-contribution-amount"
                  className="form-group__label form-group__label--required"
                >
                  Amount
                </label>
                <input
                  ref={amountInputRef}
                  id="goal-contribution-amount"
                  className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  onBlur={handleAmountBlur}
                  onFocus={handleAmountFocus}
                  placeholder={formatInputAmount(
                    0,
                    goal.currency.code,
                    goal.currency.decimalPlaces,
                    displaySettings.currencyDisplay,
                  )}
                  aria-invalid={hasAmountError}
                  aria-describedby={hasAmountError ? amountErrorId : undefined}
                  aria-required="true"
                  autoComplete="off"
                />
                {hasAmountError && (
                  <span id={amountErrorId} className="form-error" role="alert">
                    {amountError}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="goal-contribution-note" className="form-group__label">
                  Note
                </label>
                <textarea
                  id="goal-contribution-note"
                  className="form-textarea"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Optional note about this contribution"
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
                {submitting ? 'Contributing…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingInput !== null}
        title="Contribution exceeds goal"
        message="This would exceed your goal — still contribute?"
        confirmLabel="Still Contribute"
        cancelLabel="Go Back"
        variant="warning"
        onConfirm={handleConfirmOverGoal}
        onCancel={handleCancelOverGoal}
        isLoading={submitting}
      />
    </>
  );
}

export default GoalContributionDialog;
