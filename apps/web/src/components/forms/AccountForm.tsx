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
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { useDatabase } from '../../db/DatabaseProvider';
import type { CreateAccountInput } from '../../db/repositories/accounts';
import { useAmountInput } from '../../hooks/useAmountInput';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import { Button } from '../common/Button';
import type {
  Account,
  AccountPurpose,
  AccountType,
  HsaCoverageLevel,
  RetirementAccountType,
  RetirementTaxTreatment,
  SyncId,
} from '../../kmp/bridge';
import { getCurrencyMetadata, SUPPORTED_CURRENCY_METADATA } from '../../lib/currency-metadata';
import { queryOne, type Row } from '../../db/sqlite-wasm';
import { accountSchema } from '../../lib/validation';
import { getFormCopy } from '../../lib/i18n/forms-catalog';
import {
  HSA_COVERAGE_OPTIONS,
  RETIREMENT_ACCOUNT_TYPE_OPTIONS,
  RETIREMENT_TAX_TREATMENT_OPTIONS,
  getDefaultRetirementTaxTreatment,
} from '../../lib/tax/retirement-contribution-metadata';
import { AmountInput } from './AmountInput';
import { FormErrorSummary, type FormErrorSummaryItem } from './FormErrorSummary';

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

const ACCOUNT_PURPOSES: readonly { value: AccountPurpose; label: string }[] = [
  { value: 'personal', label: '🏠 Personal' },
  { value: 'business', label: '💼 Business' },
  { value: 'both', label: '🏠💼 Both' },
] as const;

/** Common currency options. */
const CURRENCY_OPTIONS = SUPPORTED_CURRENCY_METADATA;

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

function validate(name: string, accountType: AccountType, currencyCode: string): FormErrors {
  const errors: FormErrors = {};
  const result = accountSchema.safeParse({
    name: name.trim(),
    type: accountType,
    currencyCode,
  });

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === 'name') {
        errors.name = getFormCopy('accountNameRequired');
      }
    }
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
      balanceCents: 0,
      purpose: 'personal' as AccountPurpose,
      retirementAccountType: '' as RetirementAccountType | '',
      retirementTaxTreatment: 'PRE_TAX' as RetirementTaxTreatment,
      hsaCoverageLevel: 'SELF_ONLY' as HsaCoverageLevel,
    };
  }

  return {
    name: initialData.name,
    accountType: initialData.type,
    currency: initialData.currency.code,
    balanceCents: initialData.currentBalance.amount,
    purpose: initialData.purpose ?? 'personal',
    retirementAccountType: initialData.retirementAccountType ?? '',
    retirementTaxTreatment:
      initialData.retirementTaxTreatment ??
      (initialData.retirementAccountType
        ? getDefaultRetirementTaxTreatment(initialData.retirementAccountType)
        : 'PRE_TAX'),
    hsaCoverageLevel: initialData.hsaCoverageLevel ?? 'SELF_ONLY',
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
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // -- state ---------------------------------------------------------------
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('CHECKING');
  const [purpose, setPurpose] = useState<AccountPurpose>('personal');
  const [retirementAccountType, setRetirementAccountType] = useState<RetirementAccountType | ''>(
    '',
  );
  const [retirementTaxTreatment, setRetirementTaxTreatment] =
    useState<RetirementTaxTreatment>('PRE_TAX');
  const [hsaCoverageLevel, setHsaCoverageLevel] = useState<HsaCoverageLevel>('SELF_ONLY');
  const [currency, setCurrency] = useState('USD');
  const selectedCurrency = useMemo(() => getCurrencyMetadata(currency), [currency]);
  const balanceInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: selectedCurrency.decimalPlaces,
    allowNegative: true,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -- database ------------------------------------------------------------
  const db = useDatabase();
  const initialValues = useMemo(() => getInitialFormValues(initialData), [initialData]);
  const isDirty =
    isOpen &&
    (name !== initialValues.name ||
      accountType !== initialValues.accountType ||
      purpose !== initialValues.purpose ||
      retirementAccountType !== initialValues.retirementAccountType ||
      retirementTaxTreatment !== initialValues.retirementTaxTreatment ||
      hsaCoverageLevel !== initialValues.hsaCoverageLevel ||
      currency !== initialValues.currency ||
      balanceInput.cents !== initialValues.balanceCents);
  const { confirmNavigation } = useNavigationGuard({
    when: isDirty,
    message: 'Discard the account changes you have not saved yet?',
  });

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
      setName(initialValues.name);
      setAccountType(initialValues.accountType);
      setPurpose(initialValues.purpose);
      setRetirementAccountType(initialValues.retirementAccountType as RetirementAccountType | '');
      setRetirementTaxTreatment(initialValues.retirementTaxTreatment);
      setHsaCoverageLevel(initialValues.hsaCoverageLevel);
      setCurrency(initialValues.currency);
      balanceInput.setCents(initialValues.balanceCents);
      setErrors({});
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [balanceInput.setCents, initialValues, isOpen]);

  // -- handlers ------------------------------------------------------------

  const handleCancel = useCallback(() => {
    if (!confirmNavigation()) {
      return;
    }

    onCancel();
  }, [confirmNavigation, onCancel]);

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

      const fieldErrors = validate(name, accountType, currency);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        requestAnimationFrame(() => errorSummaryRef.current?.focus());
        return;
      }

      const householdId = initialData?.householdId ?? getFirstHouseholdId(db);
      if (!householdId) {
        setSubmitError(getFormCopy('accountNoHousehold'));
        return;
      }

      const currencyObj = getCurrencyMetadata(currency);

      const input: CreateAccountInput = {
        householdId,
        name: name.trim(),
        type: accountType,
        purpose,
        retirementAccountType: retirementAccountType || null,
        retirementTaxTreatment: retirementAccountType ? retirementTaxTreatment : null,
        hsaCoverageLevel: retirementAccountType === 'HSA' ? hsaCoverageLevel : null,
        currency: {
          code: currencyObj.code,
          decimalPlaces: currencyObj.decimalPlaces,
        },
        currentBalance: { amount: balanceInput.cents },
      };

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        const initialValues = getInitialFormValues();
        setName(initialValues.name);
        setAccountType(initialValues.accountType);
        setPurpose(initialValues.purpose);
        setRetirementAccountType(initialValues.retirementAccountType as RetirementAccountType | '');
        setRetirementTaxTreatment(initialValues.retirementTaxTreatment);
        setHsaCoverageLevel(initialValues.hsaCoverageLevel);
        setCurrency(initialValues.currency);
        balanceInput.reset(initialValues.balanceCents);
        setErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : initialData
              ? getFormCopy('accountUpdateFailed')
              : getFormCopy('accountCreateFailed'),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      name,
      accountType,
      balanceInput.cents,
      balanceInput.reset,
      purpose,
      retirementAccountType,
      retirementTaxTreatment,
      hsaCoverageLevel,
      currency,
      db,
      initialData,
      onSubmit,
    ],
  );

  // -- render --------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const hasNameError = Boolean(errors.name);
  const hasBalanceError = Boolean(errors.balance);
  const isRetirementAccount = retirementAccountType !== '';
  const validationErrorItems: FormErrorSummaryItem[] = [
    hasNameError
      ? { fieldId: 'account-name', label: getFormCopy('accountNameLabel'), message: errors.name! }
      : null,
    hasBalanceError
      ? {
          fieldId: 'account-balance',
          label: getFormCopy('accountInitialBalanceLabel'),
          message: errors.balance!,
        }
      : null,
  ].filter((item): item is FormErrorSummaryItem => item !== null);

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
          {getFormCopy(initialData ? 'accountEditTitle' : 'accountCreateTitle')}
        </h2>

        {/* Form-level error */}
        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}
        <FormErrorSummary
          id="account-form-error-summary"
          errors={validationErrorItems}
          title={getFormCopy('errorSummaryTitle')}
          summaryRef={errorSummaryRef}
        />

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={
            validationErrorItems.length > 0 ? 'account-form-error-summary' : undefined
          }
        >
          <div className="form-fields">
            {/* Name */}
            <div className="form-group">
              <label
                htmlFor="account-name"
                className="form-group__label form-group__label--required"
              >
                {getFormCopy('accountNameLabel')}
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

            {/* Account Purpose */}
            <div className="form-group">
              <label htmlFor="account-purpose" className="form-group__label">
                Account Purpose
              </label>
              <select
                id="account-purpose"
                className="form-select"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as AccountPurpose)}
              >
                {ACCOUNT_PURPOSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="form-group form-fieldset">
              <legend className="form-group__label">Retirement classification</legend>
              <label className="form-checkbox-row">
                <input
                  type="checkbox"
                  checked={isRetirementAccount}
                  onChange={(event) => {
                    if (event.target.checked) {
                      const defaultType = 'TRADITIONAL_IRA' as RetirementAccountType;
                      setRetirementAccountType(defaultType);
                      setRetirementTaxTreatment(getDefaultRetirementTaxTreatment(defaultType));
                    } else {
                      setRetirementAccountType('');
                      setRetirementTaxTreatment('PRE_TAX');
                      setHsaCoverageLevel('SELF_ONLY');
                    }
                  }}
                />
                Mark this as a retirement or tax-advantaged account
              </label>
              {isRetirementAccount && (
                <>
                  <div className="form-group">
                    <label htmlFor="account-retirement-type" className="form-group__label">
                      Retirement account type
                    </label>
                    <select
                      id="account-retirement-type"
                      className="form-select"
                      value={retirementAccountType}
                      onChange={(event) => {
                        const nextType = event.target.value as RetirementAccountType;
                        setRetirementAccountType(nextType);
                        setRetirementTaxTreatment(getDefaultRetirementTaxTreatment(nextType));
                        if (nextType !== 'HSA') {
                          setHsaCoverageLevel('SELF_ONLY');
                        }
                      }}
                    >
                      {RETIREMENT_ACCOUNT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="account-tax-treatment" className="form-group__label">
                      Tax treatment
                    </label>
                    <select
                      id="account-tax-treatment"
                      className="form-select"
                      value={retirementTaxTreatment}
                      onChange={(event) =>
                        setRetirementTaxTreatment(event.target.value as RetirementTaxTreatment)
                      }
                    >
                      {RETIREMENT_TAX_TREATMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {retirementAccountType === 'HSA' && (
                    <div className="form-group">
                      <label htmlFor="account-hsa-coverage" className="form-group__label">
                        HSA coverage
                      </label>
                      <select
                        id="account-hsa-coverage"
                        className="form-select"
                        value={hsaCoverageLevel}
                        onChange={(event) =>
                          setHsaCoverageLevel(event.target.value as HsaCoverageLevel)
                        }
                      >
                        {HSA_COVERAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </fieldset>

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
                {getFormCopy('accountInitialBalanceLabel')}
              </label>
              <AmountInput
                id="account-balance"
                amountInput={balanceInput}
                className={`form-input${hasBalanceError ? ' form-input--error' : ''}`}
                placeholder={balanceInput.placeholderValue}
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
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
              {getFormCopy('accountCancel')}
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting
                ? initialData
                  ? getFormCopy('accountUpdating')
                  : getFormCopy('accountCreating')
                : initialData
                  ? getFormCopy('accountUpdate')
                  : getFormCopy('accountCreate')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
