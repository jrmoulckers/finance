// SPDX-License-Identifier: BUSL-1.1

import type { FormEvent } from 'react';

import type { Account, Category } from '../../kmp/bridge';
import type {
  ParsedVoiceTransaction,
  VoiceConfirmationDraft,
  VoiceIntent,
} from '../../lib/voice/types';

export interface VoiceConfirmationProps {
  readonly draft: VoiceConfirmationDraft;
  readonly parsedTransaction: ParsedVoiceTransaction;
  readonly accounts: Account[];
  readonly categories: Category[];
  readonly errorMessage?: string | null;
  readonly submitting?: boolean;
  readonly onChange: (patch: Partial<VoiceConfirmationDraft>) => void;
  readonly onConfirm: () => void;
  readonly onRetry: () => void;
  readonly onUseManualEntry?: () => void;
}

const INTENT_LABELS: Record<VoiceIntent, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  split: 'Split expense',
  unknown: 'Transaction',
};

export function VoiceConfirmation({
  draft,
  parsedTransaction,
  accounts,
  categories,
  errorMessage,
  submitting = false,
  onChange,
  onConfirm,
  onRetry,
  onUseManualEntry,
}: VoiceConfirmationProps) {
  const isTransfer = draft.type === 'TRANSFER';
  const confidence = Math.round(parsedTransaction.confidence * 100);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <section className="voice-confirmation" aria-labelledby="voice-confirmation-title">
      <div className="voice-confirmation__header">
        <div>
          <h3 id="voice-confirmation-title" className="voice-confirmation__title">
            Confirm voice entry
          </h3>
          <p className="voice-confirmation__subtitle">
            {INTENT_LABELS[parsedTransaction.intent]} · {confidence}% confidence
          </p>
        </div>
        <button type="button" className="voice-confirmation__retry" onClick={onRetry}>
          Try again
        </button>
      </div>

      {parsedTransaction.missingFields.length > 0 && (
        <p className="voice-confirmation__hint">
          Fill in the missing {parsedTransaction.missingFields.join(', ')} before saving.
        </p>
      )}

      {errorMessage && (
        <div className="form-banner-error" role="alert">
          {errorMessage}
        </div>
      )}

      <form className="voice-confirmation__form" onSubmit={handleSubmit}>
        <div className="voice-confirmation__grid">
          <label className="form-group">
            <span className="form-group__label form-group__label--required">Type</span>
            <select
              className="form-select"
              value={draft.type}
              onChange={(event) =>
                onChange({ type: event.target.value as VoiceConfirmationDraft['type'] })
              }
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-group__label form-group__label--required">Amount</span>
            <input
              className="form-input"
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => onChange({ amount: event.target.value })}
            />
          </label>

          <label className="form-group voice-confirmation__field--wide">
            <span className="form-group__label form-group__label--required">
              {isTransfer ? 'Description' : 'Payee'}
            </span>
            <input
              className="form-input"
              value={draft.payee}
              onChange={(event) => onChange({ payee: event.target.value })}
            />
          </label>

          <label className="form-group">
            <span className="form-group__label form-group__label--required">Account</span>
            <select
              className="form-select"
              value={draft.accountId}
              onChange={(event) => onChange({ accountId: event.target.value })}
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          {isTransfer ? (
            <label className="form-group">
              <span className="form-group__label form-group__label--required">Transfer to</span>
              <select
                className="form-select"
                value={draft.transferAccountId}
                onChange={(event) => onChange({ transferAccountId: event.target.value })}
              >
                <option value="">Select destination</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="form-group">
              <span className="form-group__label">Category</span>
              <select
                className="form-select"
                value={draft.categoryId}
                onChange={(event) => onChange({ categoryId: event.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="form-group">
            <span className="form-group__label form-group__label--required">Date</span>
            <input
              className="form-input"
              type="date"
              value={draft.date}
              onChange={(event) => onChange({ date: event.target.value })}
            />
          </label>

          {parsedTransaction.intent === 'split' && (
            <label className="form-group voice-confirmation__field--wide">
              <span className="form-group__label">Split with</span>
              <input
                className="form-input"
                value={draft.counterpartyName}
                onChange={(event) => onChange({ counterpartyName: event.target.value })}
              />
            </label>
          )}

          <label className="form-group voice-confirmation__field--wide">
            <span className="form-group__label">Note</span>
            <textarea
              className="form-textarea"
              value={draft.note}
              onChange={(event) => onChange({ note: event.target.value })}
            />
          </label>
        </div>

        <div className="voice-confirmation__actions">
          {onUseManualEntry && (
            <button
              type="button"
              className="voice-confirmation__secondary"
              onClick={onUseManualEntry}
            >
              Use manual form
            </button>
          )}
          <button type="submit" className="add-button" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save transaction'}
          </button>
        </div>
      </form>
    </section>
  );
}
