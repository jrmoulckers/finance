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
import type { GoalContributionInput } from '../../db/repositories/goals';
import { useAmountInput } from '../../hooks/useAmountInput';
import type { Goal } from '../../kmp/bridge';
import { ConfirmDialog, CurrencyDisplay } from '../common';
import { AmountInput } from '../forms/AmountInput';
import '../forms/forms.css';

export interface GoalContributionDialogProps {
  isOpen: boolean;
  goal: Goal | null;
  onSubmit: (input: GoalContributionInput) => Promise<void> | void;
  onCancel: () => void;
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

  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: goal?.currency.decimalPlaces ?? 2,
    allowNegative: false,
  });
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'contribute' | 'withdraw'>('contribute');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingInput, setPendingInput] = useState<GoalContributionInput | null>(null);

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    amountInput.reset(0);
    setNote('');
    setMode('contribute');
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
        amountInput.reset(0);
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

    const magnitude = amountInput.cents;
    if (magnitude <= 0) {
      setAmountError(
        mode === 'withdraw'
          ? 'Enter a positive amount to withdraw.'
          : 'Enter a positive contribution amount.',
      );
      return null;
    }

    if (mode === 'withdraw' && magnitude > goal.currentAmount.amount) {
      setAmountError('You can only withdraw up to the amount saved for this goal.');
      return null;
    }

    setAmountError(null);
    return {
      goalId: goal.id,
      amount: { amount: mode === 'withdraw' ? -magnitude : magnitude },
      note: note.trim() || null,
    };
  }, [amountInput.cents, goal, mode, note]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const input = buildContributionInput();
      if (!goal || input === null) {
        return;
      }

      if (
        input.amount.amount > 0 &&
        goal.currentAmount.amount + input.amount.amount > goal.targetAmount.amount
      ) {
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
  const signedPreview = mode === 'withdraw' ? -amountInput.cents : amountInput.cents;
  const projectedAmount =
    amountInput.cents <= 0
      ? goal.currentAmount.amount
      : Math.max(0, goal.currentAmount.amount + signedPreview);

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
            {mode === 'withdraw' ? 'Withdraw from' : 'Contribute to'} {goal.name}
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
              <p className="card__title">
                {mode === 'withdraw' ? 'After withdrawal' : 'After contribution'}
              </p>
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
              <fieldset className="form-radio-group form-fieldset">
                <legend className="form-radio-group__legend">Adjustment type</legend>
                <div className="form-radio-group__options">
                  <label className="form-radio-option">
                    <input
                      type="radio"
                      name="goal-adjustment-mode"
                      value="contribute"
                      checked={mode === 'contribute'}
                      onChange={() => {
                        setMode('contribute');
                        setAmountError(null);
                      }}
                    />
                    <span className="form-radio-option__label">Contribute</span>
                  </label>
                  <label className="form-radio-option">
                    <input
                      type="radio"
                      name="goal-adjustment-mode"
                      value="withdraw"
                      checked={mode === 'withdraw'}
                      onChange={() => {
                        setMode('withdraw');
                        setAmountError(null);
                      }}
                    />
                    <span className="form-radio-option__label">Withdraw</span>
                  </label>
                </div>
              </fieldset>

              <div className="form-group">
                <label
                  htmlFor="goal-contribution-amount"
                  className="form-group__label form-group__label--required"
                >
                  Amount
                </label>
                <AmountInput
                  ref={amountInputRef}
                  id="goal-contribution-amount"
                  amountInput={amountInput}
                  className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                  placeholder={amountInput.placeholderValue}
                  displayLabel="Contribution amount"
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
                  placeholder="Optional note about this adjustment"
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
                {submitting
                  ? mode === 'withdraw'
                    ? 'Withdrawing...'
                    : 'Contributing...'
                  : mode === 'withdraw'
                    ? 'Withdraw'
                    : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingInput !== null}
        title="Contribution exceeds goal"
        message="This would exceed your goal. Still contribute?"
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
