// SPDX-License-Identifier: BUSL-1.1

/**
 * Quick-entry transaction form for rapid transaction creation.
 *
 * A streamlined, minimal-friction interface that reduces the full
 * TransactionForm to just the essential fields: amount, description,
 * and transaction type. All other fields (account, category, date) are
 * auto-populated from sensible defaults and auto-categorization.
 *
 * Design goals:
 *   - 2-tap entry: type amount → tap Add
 *   - Auto-selects the last-used account
 *   - Auto-suggests category from description
 *   - Keeps the panel open for rapid successive entries
 *   - Accessible with full keyboard support (Escape closes, Enter submits)
 *
 * References: issue #319
 * @module components/forms/QuickEntry
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import { useAmountInput } from '../../hooks/useAmountInput';
import type { Account, Category, TransactionType } from '../../kmp/bridge';
import type { CategorySuggestion } from '../../lib/categorization';
import { AmountInput } from './AmountInput';

import './forms.css';
import './quick-entry.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for remembering the last-used account. */
export const LAST_ACCOUNT_KEY = 'finance:quick-entry-last-account';

/** localStorage key for remembering the last-used transaction type. */
export const LAST_TYPE_KEY = 'finance:quick-entry-last-type';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuickEntryProps {
  /** Whether the quick-entry panel is open. */
  isOpen: boolean;
  /** Available accounts for auto-selection. */
  accounts: Account[];
  /** Available categories for auto-suggestion. */
  categories: Category[];
  /** Callback when a transaction is submitted. */
  onSubmit: (data: CreateTransactionInput) => void;
  /** Callback when the panel is closed. */
  onClose: () => void;
  /** Optional auto-categorization function. */
  suggestCategory?: (description: string, amountCents?: number) => CategorySuggestion | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLastAccount(): string {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? '';
  } catch {
    return '';
  }
}

function setLastAccount(accountId: string): void {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
  } catch {
    // Silently degrade
  }
}

function getLastType(): TransactionType {
  try {
    const stored = localStorage.getItem(LAST_TYPE_KEY);
    if (stored === 'INCOME' || stored === 'EXPENSE' || stored === 'TRANSFER') {
      return stored;
    }
  } catch {
    // fall through
  }
  return 'EXPENSE';
}

function setLastType(type: TransactionType): void {
  try {
    localStorage.setItem(LAST_TYPE_KEY, type);
  } catch {
    // Silently degrade
  }
}

function normalizeTransactionAmount(amountCents: number, type: TransactionType): number {
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

export const QuickEntry: FC<QuickEntryProps> = ({
  isOpen,
  accounts,
  categories: _categories,
  onSubmit,
  onClose,
  suggestCategory,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [transactionType, setTransactionType] = useState<TransactionType>(getLastType);
  const amountInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    mode: 'incremental',
    maxCents: 99_999_999,
    allowNegative: transactionType !== 'INCOME',
  });
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  // Auto-focus amount field when opening
  useEffect(() => {
    if (isOpen) {
      // Pick the last-used account or the first available
      const lastAcc = getLastAccount();
      const validAccount = accounts.find((a) => a.id === lastAcc) ?? accounts[0];
      setAccountId(validAccount?.id ?? '');
      setTransactionType(getLastType());
      setSuccessCount(0);
      setError(null);

      const id = requestAnimationFrame(() => {
        amountInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen, accounts]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (transactionType === 'EXPENSE') {
      amountInput.setSign('negative');
    }

    if (transactionType === 'INCOME') {
      amountInput.setSign('positive');
    }
  }, [amountInput.setSign, isOpen, transactionType]);

  // Auto-suggest category
  useEffect(() => {
    if (!isOpen || !description.trim() || !suggestCategory) {
      setSuggestion(null);
      return;
    }
    const amountCents = Math.abs(amountInput.cents) > 0 ? Math.abs(amountInput.cents) : undefined;
    setSuggestion(suggestCategory(description, amountCents));
  }, [amountInput.cents, description, isOpen, suggestCategory]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const resetForm = useCallback(() => {
    amountInput.reset(0);
    amountInput.setSign(transactionType === 'EXPENSE' ? 'negative' : 'positive');
    setDescription('');
    setError(null);
    setSuggestion(null);
    // Keep type and account for rapid re-entry
    requestAnimationFrame(() => {
      amountInputRef.current?.focus();
    });
  }, [amountInput.reset, amountInput.setSign, transactionType]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      const normalizedAmountCents = normalizeTransactionAmount(amountInput.cents, transactionType);
      if (normalizedAmountCents === 0) {
        setError('Enter a valid amount.');
        return;
      }

      const trimmedDescription = description.trim();
      if (!trimmedDescription) {
        setError('Enter a description.');
        return;
      }

      const selectedAccount = accounts.find((a) => a.id === accountId);
      if (!selectedAccount) {
        setError('Select an account.');
        return;
      }

      const amountCents = normalizedAmountCents;
      const categoryId = suggestion?.categoryId ?? null;

      const input: CreateTransactionInput = {
        householdId: selectedAccount.householdId,
        accountId: selectedAccount.id,
        type: transactionType,
        amount: { amount: amountCents },
        currency: selectedAccount.currency,
        payee: trimmedDescription,
        date: todayISO(),
        categoryId,
        note: null,
      };

      setLastAccount(accountId);
      setLastType(transactionType);

      onSubmit(input);
      setSuccessCount((c) => c + 1);
      resetForm();
    },
    [
      accountId,
      accounts,
      amountInput.cents,
      description,
      transactionType,
      suggestion,
      onSubmit,
      resetForm,
    ],
  );

  if (!isOpen) return null;

  const hasError = Boolean(error);

  return (
    <div className="quick-entry" role="presentation" onKeyDown={handleKeyDown}>
      <div className="quick-entry__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="quick-entry__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-entry-title"
      >
        <div className="quick-entry__header">
          <h2 id="quick-entry-title" className="quick-entry__title">
            Quick Add
          </h2>
          {successCount > 0 && (
            <span className="quick-entry__counter" role="status" aria-live="polite">
              {successCount} added
            </span>
          )}
          <button
            type="button"
            className="quick-entry__close"
            onClick={onClose}
            aria-label="Close quick entry"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="form-banner-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Type toggle */}
          <div className="quick-entry__type-toggle" role="radiogroup" aria-label="Transaction type">
            <button
              type="button"
              className={`quick-entry__type-btn${transactionType === 'EXPENSE' ? ' quick-entry__type-btn--active' : ''}`}
              role="radio"
              aria-checked={transactionType === 'EXPENSE'}
              onClick={() => setTransactionType('EXPENSE')}
            >
              Expense
            </button>
            <button
              type="button"
              className={`quick-entry__type-btn${transactionType === 'INCOME' ? ' quick-entry__type-btn--active' : ''}`}
              role="radio"
              aria-checked={transactionType === 'INCOME'}
              onClick={() => setTransactionType('INCOME')}
            >
              Income
            </button>
          </div>

          {/* Amount */}
          <div className="quick-entry__amount-row">
            <AmountInput
              ref={amountInputRef}
              amountInput={amountInput}
              className={`form-input quick-entry__amount-input${hasError ? ' form-input--error' : ''}`}
              placeholder="$0.00"
              aria-label="Amount"
              aria-invalid={hasError}
              aria-required="true"
              autoComplete="off"
              toggleLabel="Toggle quick entry amount sign"
            />
          </div>

          {/* Description */}
          <input
            className="form-input quick-entry__description"
            type="text"
            placeholder="What was it for?"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            aria-label="Description"
            aria-required="true"
            autoComplete="off"
          />

          {/* Category suggestion badge */}
          {suggestion && (
            <div className="quick-entry__suggestion" role="status">
              <span className="quick-entry__suggestion-text">
                {suggestion.categoryName} ({Math.round(suggestion.confidence * 100)}%)
              </span>
            </div>
          )}

          {/* Account selector (compact) */}
          {accounts.length > 1 && (
            <select
              className="form-select quick-entry__account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          <button type="submit" className="form-button form-button--primary quick-entry__submit">
            Add {transactionType === 'INCOME' ? 'Income' : 'Expense'}
          </button>
        </form>
      </div>
    </div>
  );
};
