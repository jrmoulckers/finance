// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible account create/edit form.
 *
 * Renders a modal dialog with fields for creating or editing a financial account:
 * name (required), type, currency, and initial balance. Validates input
 * client-side with accessible error messages (aria-invalid / aria-describedby).
 *
 * The household ID is resolved by querying the first household from the local
 * SQLite database. If no household exists, the form surfaces an error banner
 * and blocks submission rather than sending invalid data.
 *
 * Keyboard support: Tab navigation, Enter submits, Escape cancels.
 * Focus is trapped within the dialog and the first field is autofocused.
 *
 * @module components/forms/AccountForm
 * @see {@link CreateAccountInput} from db/repositories/accounts
 * References: issue #445
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
import type { CreateAccountInput } from '../../db/repositories/accounts';
import type { Account, AccountType, SyncId } from '../../kmp/bridge';
import { queryOne, type Row } from '../../db/sqlite-wasm';
import { accountSchema } from '../../lib/validation';

import './forms.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Account type options displayed in the type select. */
const ACCOUNT_TYPES: readonly { value: AccountType; label: string }[] = [
  { value: 'CHECKING', label: 'Checking' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'LOAN', label: 'Loan' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** Common currency options. */
const CURRENCY_OPTIONS: readonly { code: string; label: string }[] = [
  { code: 'USD', label: 'USD – US Dollar' },
  { code: 'EUR', label: 'EUR – Euro' },
  { code: 'GBP', label: 'GBP – British Pound' },
  { code: 'CAD', label: 'CAD – Canadian Dollar' },
  { code: 'AUD', label: 'AUD – Australian Dollar' },
  { code: 'JPY', label: 'JPY – Japanese Yen' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link AccountForm}. */
export interface AccountFormProps {
  /** Callback invoked with validated form data when the user submits. */
  onSubmit: (data: CreateAccountInput) => Promise<void>;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /** Whether the form dialog is open. */
  isOpen: boolean;
  /** Existing account data used to populate the form when editing. */
  initialData?: Account;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  name?: string;
  balance?: string;
}

function validate(
  name: string,
  balanceStr: string,
  accountType: AccountType,
  currencyCode: string,
): FormErrors {
  const errors: FormErrors = {};
  const parsedBalance = parseFloat(balanceStr);
  const result = accountSchema.safeParse({
    name: name.trim(),
    type: accountType,
    currencyCode,
  });

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === 'name') {
        errors.name = 'Account name is required.';
      }
    }
  }

  if (balanceStr.trim() !== '' && Number.isNaN(parsedBalance)) {
    errors.balance = 'Initial balance must be a valid number.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Household resolver
// ---------------------------------------------------------------------------

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

function getInitialFormValues(initialData?: Account) {
  if (!initialData) {
    return {
      name: '',
      accountType: 'CHECKING' as AccountType,
      currency: 'USD',
      balance: '0.00',
    };
  }

  return {
    name: initialData.name,
    accountType: initialData.type,
    currency: initialData.currency.code,
    balance: (
      initialData.currentBalance.amount / Math.pow(10, initialData.currency.decimalPlaces)
    ).toFixed(initialData.currency.decimalPlaces),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible modal form for creating or editing a financial account.
 *
 * Provides fields for name, account type, currency, and initial balance.
 * Validates input and surfaces errors with ARIA attributes. Traps focus
 * within the dialog while open.
 */
export function AccountForm({ onSubmit, onCancel, isOpen, initialData }: AccountFormProps) {
  // -- refs ----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // -- state ---------------------------------------------------------------
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('CHECKING');
  const [currency, setCurrency] = useState('USD');
  const [balance, setBalance] = useState('0.00');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -- database ------------------------------------------------------------
  const db = useDatabase();

  // -- focus trap -----------------------------------------------------------
  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  // -- autofocus first field ------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the dialog to render before focusing.
      const id = requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  // -- reset on open -------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      const initialValues = getInitialFormValues(initialData);
      setName(initialValues.name);
      setAccountType(initialValues.accountType);
      setCurrency(initialValues.currency);
      setBalance(initialValues.balance);
      setErrors({});
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [initialData, isOpen]);

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

      const fieldErrors = validate(name, balance, accountType, currency);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      const householdId = initialData?.householdId ?? getFirstHouseholdId(db);
      if (!householdId) {
        setSubmitError('No household found. Please create a household before adding accounts.');
        return;
      }

      const currencyObj = CURRENCY_OPTIONS.find((c) => c.code === currency);
      const decimalPlaces = currency === 'JPY' ? 0 : 2;
      const balanceCents = Math.round(parseFloat(balance || '0') * Math.pow(10, decimalPlaces));

      const input: CreateAccountInput = {
        householdId,
        name: name.trim(),
        type: accountType,
        currency: {
          code: currencyObj?.code ?? currency,
          decimalPlaces,
        },
        currentBalance: { amount: balanceCents },
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        const initialValues = getInitialFormValues();
        setName(initialValues.name);
        setAccountType(initialValues.accountType);
        setCurrency(initialValues.currency);
        setBalance(initialValues.balance);
        setErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : initialData
              ? 'Failed to update account.'
              : 'Failed to create account.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [name, balance, accountType, currency, db, initialData, onSubmit],
  );

  // -- render --------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const hasNameError = Boolean(errors.name);
  const hasBalanceError = Boolean(errors.balance);

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
        aria-labelledby="account-form-title"
      >
        <h2 id="account-form-title" className="form-dialog__title">
          {initialData ? 'Edit Account' : 'Create Account'}
        </h2>

        {/* Form-level error */}
        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            {/* Name */}
            <div className="form-group">
              <label
                htmlFor="account-name"
                className="form-group__label form-group__label--required"
              >
                Account Name
              </label>
              <input
                ref={firstInputRef}
                id="account-name"
                className={`form-input${hasNameError ? ' form-input--error' : ''}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={hasNameError}
                aria-describedby={hasNameError ? 'account-name-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasNameError && (
                <span id="account-name-error" className="form-error" role="alert">
                  {errors.name}
                </span>
              )}
            </div>

            {/* Type */}
            <div className="form-group">
              <label htmlFor="account-type" className="form-group__label">
                Account Type
              </label>
              <select
                id="account-type"
                className="form-select"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div className="form-group">
              <label htmlFor="account-currency" className="form-group__label">
                Currency
              </label>
              <select
                id="account-currency"
                className="form-select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Initial Balance */}
            <div className="form-group">
              <label htmlFor="account-balance" className="form-group__label">
                Initial Balance
              </label>
              <input
                id="account-balance"
                className={`form-input${hasBalanceError ? ' form-input--error' : ''}`}
                type="number"
                step="0.01"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                aria-invalid={hasBalanceError}
                aria-describedby={hasBalanceError ? 'account-balance-error' : undefined}
                autoComplete="off"
              />
              {hasBalanceError && (
                <span id="account-balance-error" className="form-error" role="alert">
                  {errors.balance}
                </span>
              )}
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
              {submitting
                ? initialData
                  ? 'Updating…'
                  : 'Creating…'
                : initialData
                  ? 'Update Account'
                  : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
