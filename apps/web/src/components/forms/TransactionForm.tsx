// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible transaction form for creating and editing transactions.
 *
 * Renders a modal dialog with fields for creating or editing a financial transaction:
 * amount (required, > 0), description (required, maps to `payee`), type
 * (radio group, default EXPENSE), category (optional select), account
 * (required select), date (default today), and notes (optional textarea).
 *
 * Validates input client-side with accessible error messages using
 * `aria-invalid` and `aria-describedby`. The `householdId` is derived from
 * the selected account, so no separate household prop is needed.
 *
 * Keyboard support: Tab navigation, Enter submits via the form element,
 * Escape cancels. Focus is trapped within the dialog and the first field
 * is autofocused when the dialog opens.
 *
 * @module components/forms/TransactionForm
 * @see {@link CreateTransactionInput} from db/repositories/transactions
 * References: issues #445, #487
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
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import { useAutoCategory } from '../../hooks/useAutoCategory';
import { useAmountInput } from '../../hooks/useAmountInput';
import { useMerchants } from '../../hooks/useMerchants';
import type {
  Account,
  Category,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../kmp/bridge';
import { BNPL_CUSTOM_FIELD_KEYS } from '../../lib/bnpl-liability';
import type { CategorySuggestion } from '../../lib/categorization';
import type { MerchantMatchResult } from '../../lib/merchants';
import {
  MOOD_TAGS,
  MOOD_TAGS_CHANGED_EVENT,
  isMoodTagsEnabled,
  normalizeMoodTag,
} from '../../lib/mood-tags';
import { transactionSchema } from '../../lib/validation';
import { CounterpartyInput } from '../transactions/CounterpartyInput';

import './forms.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Transaction type options for the radio group. */
const TRANSACTION_TYPES: readonly { value: TransactionType; label: string }[] = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
] as const;

/** Transaction status options for the dropdown. */
const TRANSACTION_STATUSES: readonly { value: TransactionStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'CLEARED', label: 'Cleared' },
  { value: 'RECONCILED', label: 'Reconciled' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link TransactionForm}. */
export interface TransactionFormProps {
  /** Callback invoked with validated form data when the user submits. */
  onSubmit: (data: CreateTransactionInput) => Promise<void>;
  /** Callback invoked when the user cancels or presses Escape. */
  onCancel: () => void;
  /** Available accounts to choose from. */
  accounts: Account[];
  /** Available categories to choose from. */
  categories: Category[];
  /** Whether the form dialog is open. */
  isOpen: boolean;
  /** Existing transaction data used to prefill the form in edit mode. */
  initialData?: Transaction;
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

/** Convert stored tags array to a comma-separated string for the input. */
function tagsToString(tags: readonly string[]): string {
  return tags.join(', ');
}

/** Parse a comma-separated tags string into an array of trimmed non-empty strings. */
function parseTags(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  amount?: string;
  description?: string;
  accountId?: string;
}

function validate(
  amountCents: number,
  description: string,
  accountId: string,
  type: TransactionType,
  date: string,
): FormErrors {
  const errors: FormErrors = {};
  const result = transactionSchema.safeParse({
    description: description.trim(),
    amount: amountCents / 100,
    type,
    accountId,
    date,
  });

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === 'amount') {
        errors.amount = 'Amount must be greater than zero.';
      }

      if (issue.path[0] === 'description') {
        errors.description = 'Description is required.';
      }

      if (issue.path[0] === 'accountId') {
        errors.accountId = 'Please select an account.';
      }
    }
  }

  // Extra check: cents must be > 0
  if (amountCents <= 0 && !errors.amount) {
    errors.amount = 'Amount must be greater than zero.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible modal form for creating or editing a financial transaction.
 *
 * Provides fields for amount, description, transaction type, category,
 * account, date, and notes. Validates input and surfaces errors with
 * ARIA attributes. Traps focus within the dialog while open.
 */
export function TransactionForm({
  onSubmit,
  onCancel,
  accounts,
  categories,
  isOpen,
  initialData,
}: TransactionFormProps) {
  // -- refs ----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // -- state ---------------------------------------------------------------
  const amountInput = useAmountInput({ currencySymbol: '$', decimalPlaces: 2 });
  const [description, setDescription] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('EXPENSE');
  const [status, setStatus] = useState<TransactionStatus>('PENDING');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [moodTag, setMoodTag] = useState<string | null>(null);
  const [moodTagsEnabled, setMoodTagsEnabled] = useState(() => isMoodTagsEnabled());
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [counterpartyName, setCounterpartyName] = useState('');
  const [merchantMatch, setMerchantMatch] = useState<MerchantMatchResult | null>(null);
  const [isBnplLiability, setIsBnplLiability] = useState(false);
  const [bnplInstallmentCount, setBnplInstallmentCount] = useState('4');

  // -- additional details state ---------------------------------------------
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [merchantCity, setMerchantCity] = useState('');
  const [merchantState, setMerchantState] = useState('');
  const [merchantZip, setMerchantZip] = useState('');
  const [merchantCountry, setMerchantCountry] = useState('');
  const [statementDescription, setStatementDescription] = useState('');
  const [externalReferenceId, setExternalReferenceId] = useState('');
  const [customFieldEntries, setCustomFieldEntries] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [extraNotes, setExtraNotes] = useState('');

  // -- auto-categorisation --------------------------------------------------
  const { suggestCategory: autoSuggest, learnCorrection } = useAutoCategory(categories);

  // -- merchant matching ----------------------------------------------------
  const { merchants, matchDescription, recordMatch } = useMerchants();

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

  useEffect(() => {
    const refreshMoodPreference = () => setMoodTagsEnabled(isMoodTagsEnabled());
    window.addEventListener(MOOD_TAGS_CHANGED_EVENT, refreshMoodPreference);
    window.addEventListener('storage', refreshMoodPreference);
    return () => {
      window.removeEventListener(MOOD_TAGS_CHANGED_EVENT, refreshMoodPreference);
      window.removeEventListener('storage', refreshMoodPreference);
    };
  }, []);

  // -- initialize on open --------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (initialData) {
      amountInput.setCents(Math.abs(initialData.amount.amount));
    } else {
      amountInput.reset(0);
    }
    setDescription(initialData?.payee ?? '');
    setTransactionType(initialData?.type ?? 'EXPENSE');
    setStatus(initialData?.status ?? 'PENDING');
    setCategoryId(initialData?.categoryId ?? '');
    setAccountId(initialData?.accountId ?? '');
    setDate(initialData?.date ?? todayISO());
    setNotes(initialData?.note ?? '');
    setTagsInput(initialData ? tagsToString(initialData.tags) : '');
    setMoodTag(normalizeMoodTag(initialData?.moodTag));
    setCounterpartyName(initialData?.counterpartyName ?? '');
    setMerchantMatch(null);
    setIsBnplLiability(
      initialData?.customFields?.[BNPL_CUSTOM_FIELD_KEYS.liabilityType] === 'BNPL',
    );
    setBnplInstallmentCount(
      initialData?.customFields?.[BNPL_CUSTOM_FIELD_KEYS.installmentCount] ?? '4',
    );
    setErrors({});
    setSubmitting(false);
    setSubmitError(null);
    setSuggestion(null);

    // Additional details
    setMerchantCity(initialData?.merchantCity ?? '');
    setMerchantState(initialData?.merchantState ?? '');
    setMerchantZip(initialData?.merchantZip ?? '');
    setMerchantCountry(initialData?.merchantCountry ?? '');
    setStatementDescription(initialData?.statementDescription ?? '');
    setExternalReferenceId(initialData?.externalReferenceId ?? '');
    setExtraNotes(initialData?.extraNotes ?? '');
    setCustomFieldEntries(
      initialData?.customFields
        ? Object.entries(initialData.customFields).map(([key, value]) => ({ key, value }))
        : [],
    );
    setAdditionalOpen(false);
  }, [initialData, isOpen]);

  // -- auto-suggest category when description changes ----------------------
  useEffect(() => {
    if (!isOpen || !description.trim()) {
      setSuggestion(null);
      return;
    }

    const amountCents = amountInput.cents > 0 ? amountInput.cents : undefined;
    const result = autoSuggest(description, amountCents);
    setSuggestion(result);
  }, [description, amountInput.cents, isOpen, autoSuggest]);

  // -- auto-match merchant when description changes -------------------------
  useEffect(() => {
    if (!isOpen || !description.trim()) {
      setMerchantMatch(null);
      return;
    }

    const result = matchDescription(description);
    setMerchantMatch(result);

    // Auto-fill counterparty name if matched and counterparty is empty
    if (result && !counterpartyName.trim()) {
      setCounterpartyName(result.merchant.displayName ?? result.merchant.name);
    }
  }, [description, isOpen, matchDescription]);

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

  const isEditMode = initialData !== undefined;
  const dialogTitle = isEditMode ? 'Edit Transaction' : 'New Transaction';
  const submitButtonLabel = isEditMode ? 'Update Transaction' : 'Add Transaction';
  const submittingLabel = isEditMode ? 'Updating…' : 'Adding…';
  const submitFailureMessage = isEditMode
    ? 'Failed to update transaction.'
    : 'Failed to add transaction.';

  /** Accept the auto-suggested category. */
  const handleAcceptSuggestion = useCallback(() => {
    if (suggestion) {
      setCategoryId(suggestion.categoryId);
    }
  }, [suggestion]);

  /** Handle merchant selection from CounterpartyInput. */
  const handleMerchantMatch = useCallback(
    (result: MerchantMatchResult | null) => {
      setMerchantMatch(result);
      if (result?.merchant.categoryDefault && !categoryId) {
        // Auto-fill category if the merchant has a default and none is selected
        const matchedCategory = categories.find(
          (c) => c.name.toLowerCase() === result.merchant.categoryDefault?.toLowerCase(),
        );
        if (matchedCategory) {
          setCategoryId(matchedCategory.id);
        }
      }
    },
    [categories, categoryId],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      const fieldErrors = validate(
        amountInput.cents,
        description,
        accountId,
        transactionType,
        date,
      );
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      // Derive householdId from the selected account.
      const selectedAccount = accounts.find((a) => a.id === accountId);
      if (!selectedAccount) {
        setSubmitError('Selected account not found.');
        return;
      }

      // Build custom fields from entries, skipping empty keys.
      const customFields: Record<string, string> = {};
      for (const entry of customFieldEntries) {
        const trimmedKey = entry.key.trim();
        if (trimmedKey) {
          customFields[trimmedKey] = entry.value;
        }
      }
      if (isBnplLiability) {
        customFields[BNPL_CUSTOM_FIELD_KEYS.liabilityType] = 'BNPL';
        customFields[BNPL_CUSTOM_FIELD_KEYS.installmentCount] = bnplInstallmentCount;
      } else {
        delete customFields[BNPL_CUSTOM_FIELD_KEYS.liabilityType];
        delete customFields[BNPL_CUSTOM_FIELD_KEYS.installmentCount];
      }

      const input: CreateTransactionInput = {
        householdId: selectedAccount.householdId,
        accountId,
        type: transactionType,
        status,
        amount: { amount: amountInput.cents },
        currency: selectedAccount.currency,
        payee: description.trim(),
        date,
        categoryId: categoryId || null,
        note: notes.trim() || null,
        tags: parseTags(tagsInput),
        ...(moodTagsEnabled ? { moodTag } : {}),
        merchantCity: merchantCity.trim() || null,
        merchantState: merchantState.trim() || null,
        merchantZip: merchantZip.trim() || null,
        merchantCountry: merchantCountry.trim() || null,
        statementDescription: statementDescription.trim() || null,
        externalReferenceId: externalReferenceId.trim() || null,
        customFields: Object.keys(customFields).length > 0 ? customFields : null,
        extraNotes: extraNotes.trim() || null,
        counterpartyName: counterpartyName.trim() || null,
      };

      // Learn from user's category choice if it differs from the suggestion.
      if (categoryId && description.trim() && suggestion && categoryId !== suggestion.categoryId) {
        learnCorrection(description, categoryId);
      }

      // Record merchant match for ranking
      if (merchantMatch) {
        recordMatch(merchantMatch.merchant.id);
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(input);
        // Reset form on success
        amountInput.reset(0);
        setDescription('');
        setTransactionType('EXPENSE');
        setStatus('PENDING');
        setCategoryId('');
        setAccountId('');
        setDate(todayISO());
        setNotes('');
        setTagsInput('');
        setMoodTag(null);
        setCounterpartyName('');
        setMerchantMatch(null);
        setIsBnplLiability(false);
        setBnplInstallmentCount('4');
        setErrors({});
        setSuggestion(null);
        setMerchantCity('');
        setMerchantState('');
        setMerchantZip('');
        setMerchantCountry('');
        setStatementDescription('');
        setExternalReferenceId('');
        setCustomFieldEntries([]);
        setExtraNotes('');
        setAdditionalOpen(false);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : submitFailureMessage);
      } finally {
        setSubmitting(false);
      }
    },
    [
      amountInput,
      description,
      accountId,
      accounts,
      transactionType,
      status,
      date,
      categoryId,
      notes,
      tagsInput,
      moodTag,
      moodTagsEnabled,
      merchantCity,
      merchantState,
      merchantZip,
      merchantCountry,
      statementDescription,
      externalReferenceId,
      customFieldEntries,
      extraNotes,
      counterpartyName,
      merchantMatch,
      isBnplLiability,
      bnplInstallmentCount,
      onSubmit,
      submitFailureMessage,
      suggestion,
      learnCorrection,
      recordMatch,
    ],
  );

  // -- render --------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const hasAmountError = Boolean(errors.amount);
  const hasDescriptionError = Boolean(errors.description);
  const hasAccountError = Boolean(errors.accountId);

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
        aria-labelledby="transaction-form-title"
      >
        <h2 id="transaction-form-title" className="form-dialog__title">
          {dialogTitle}
        </h2>

        {/* Form-level error */}
        {submitError && (
          <div className="form-banner-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-fields">
            {/* Amount (Venmo-style cents-first) */}
            <div className="form-group">
              <label htmlFor="txn-amount" className="form-group__label form-group__label--required">
                Amount
              </label>
              <input
                ref={firstInputRef}
                id="txn-amount"
                className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                type="text"
                inputMode="numeric"
                value={amountInput.displayValue}
                onKeyDown={amountInput.handleKeyDown}
                onChange={amountInput.handleChange}
                placeholder="$0.00"
                aria-invalid={hasAmountError}
                aria-describedby={hasAmountError ? 'txn-amount-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasAmountError && (
                <span id="txn-amount-error" className="form-error" role="alert">
                  {errors.amount}
                </span>
              )}
            </div>

            {/* Payee */}
            <div className="form-group">
              <label
                htmlFor="txn-description"
                className="form-group__label form-group__label--required"
              >
                Payee
              </label>
              <input
                id="txn-description"
                className={`form-input${hasDescriptionError ? ' form-input--error' : ''}`}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={hasDescriptionError}
                aria-describedby={hasDescriptionError ? 'txn-description-error' : undefined}
                aria-required="true"
                autoComplete="off"
              />
              {hasDescriptionError && (
                <span id="txn-description-error" className="form-error" role="alert">
                  {errors.description}
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
                      name="txn-type"
                      value={t.value}
                      checked={transactionType === t.value}
                      onChange={() => setTransactionType(t.value)}
                    />
                    <span className="form-radio-option__label">{t.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Status */}
            <div className="form-group">
              <label htmlFor="txn-status" className="form-group__label">
                Status
              </label>
              <select
                id="txn-status"
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TransactionStatus)}
              >
                {TRANSACTION_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Counterparty */}
            <div className="form-group">
              <label htmlFor="txn-counterparty" className="form-group__label">
                Counterparty
              </label>
              <CounterpartyInput
                id="txn-counterparty"
                value={counterpartyName}
                onChange={setCounterpartyName}
                merchants={merchants}
                matchResult={merchantMatch}
                onMerchantMatch={handleMerchantMatch}
                placeholder="e.g. Walgreens, Amazon"
              />
            </div>

            <fieldset className="form-group">
              <legend className="form-group__label">Buy-now-pay-later liability</legend>
              <label className="form-checkbox-row">
                <input
                  type="checkbox"
                  checked={isBnplLiability}
                  onChange={(event) => setIsBnplLiability(event.target.checked)}
                />
                Track this purchase as a BNPL liability with installments
              </label>
              {isBnplLiability && (
                <input
                  id="txn-bnpl-installments"
                  className="form-input"
                  type="number"
                  min="1"
                  max="60"
                  value={bnplInstallmentCount}
                  onChange={(event) => setBnplInstallmentCount(event.target.value)}
                  aria-label="Number of BNPL installments"
                />
              )}
            </fieldset>

            {/* Category */}
            <div className="form-group">
              <label htmlFor="txn-category" className="form-group__label">
                Category
              </label>
              <select
                id="txn-category"
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
              {suggestion && !categoryId && (
                <div className="form-category-suggestion" role="status">
                  <span className="form-category-suggestion__text">
                    Suggested: {suggestion.categoryName} ({Math.round(suggestion.confidence * 100)}
                    %)
                  </span>
                  <button
                    type="button"
                    className="form-category-suggestion__accept"
                    onClick={handleAcceptSuggestion}
                    aria-label={`Accept suggested category: ${suggestion.categoryName}`}
                  >
                    Accept
                  </button>
                </div>
              )}
            </div>

            {/* Account */}
            <div className="form-group">
              <label
                htmlFor="txn-account"
                className="form-group__label form-group__label--required"
              >
                Account
              </label>
              <select
                id="txn-account"
                className={`form-select${hasAccountError ? ' form-select--error' : ''}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-invalid={hasAccountError}
                aria-describedby={hasAccountError ? 'txn-account-error' : undefined}
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
                <span id="txn-account-error" className="form-error" role="alert">
                  {errors.accountId}
                </span>
              )}
            </div>

            {/* Date */}
            <div className="form-group">
              <label htmlFor="txn-date" className="form-group__label">
                Date
              </label>
              <input
                id="txn-date"
                className="form-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label htmlFor="txn-notes" className="form-group__label">
                Notes
              </label>
              <textarea
                id="txn-notes"
                className="form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Tags */}
            <div className="form-group">
              <label htmlFor="txn-tags" className="form-group__label">
                Tags
              </label>
              <input
                id="txn-tags"
                className="form-input"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Enter tags separated by commas"
                autoComplete="off"
                aria-describedby="txn-tags-hint"
              />
              <span id="txn-tags-hint" className="form-hint">
                Separate multiple tags with commas
              </span>
              {parseTags(tagsInput).length > 0 && (
                <div className="form-tags" role="list" aria-label="Selected tags">
                  {parseTags(tagsInput).map((tag) => (
                    <span key={tag} className="form-tag-chip" role="listitem">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {moodTagsEnabled && (
              <fieldset className="form-radio-group" aria-label="Mood tag">
                <legend className="form-radio-group__legend">Mood tag</legend>
                <div
                  className="form-radio-group__options"
                  role="group"
                  aria-label="Optional mood tag"
                >
                  {MOOD_TAGS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="form-button form-button--secondary"
                      aria-pressed={moodTag === emoji}
                      onClick={() => setMoodTag(moodTag === emoji ? null : emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                  {moodTag && (
                    <button
                      type="button"
                      className="form-button form-button--secondary"
                      onClick={() => setMoodTag(null)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </fieldset>
            )}

            {/* Additional Details — expandable section */}
            <fieldset className="form-group" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ display: 'contents' }}>
                <button
                  type="button"
                  onClick={() => setAdditionalOpen((prev) => !prev)}
                  aria-expanded={additionalOpen}
                  aria-controls="txn-additional-details"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-1)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 'var(--spacing-1) 0',
                    fontSize: 'var(--type-scale-body-font-size)',
                    fontWeight: 600,
                    color: 'var(--semantic-text-secondary)',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      transition: 'transform 0.2s',
                      transform: additionalOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    ▶
                  </span>
                  Additional Details
                </button>
              </legend>

              {additionalOpen && (
                <div
                  id="txn-additional-details"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-3)',
                    marginTop: 'var(--spacing-2)',
                  }}
                >
                  {/* Merchant location fields */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 'var(--spacing-3)',
                    }}
                  >
                    <div className="form-group">
                      <label htmlFor="txn-merchant-city" className="form-group__label">
                        Merchant City
                      </label>
                      <input
                        id="txn-merchant-city"
                        className="form-input"
                        type="text"
                        value={merchantCity}
                        onChange={(e) => setMerchantCity(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="txn-merchant-state" className="form-group__label">
                        Merchant State
                      </label>
                      <input
                        id="txn-merchant-state"
                        className="form-input"
                        type="text"
                        value={merchantState}
                        onChange={(e) => setMerchantState(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="txn-merchant-zip" className="form-group__label">
                        Merchant ZIP
                      </label>
                      <input
                        id="txn-merchant-zip"
                        className="form-input"
                        type="text"
                        value={merchantZip}
                        onChange={(e) => setMerchantZip(e.target.value)}
                        placeholder="12345 or 12345-6789"
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="txn-merchant-country" className="form-group__label">
                        Merchant Country
                      </label>
                      <input
                        id="txn-merchant-country"
                        className="form-input"
                        type="text"
                        value={merchantCountry}
                        onChange={(e) => setMerchantCountry(e.target.value)}
                        placeholder="US, GB, etc."
                        maxLength={2}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* Statement description */}
                  <div className="form-group">
                    <label htmlFor="txn-statement-desc" className="form-group__label">
                      Statement Description
                    </label>
                    <input
                      id="txn-statement-desc"
                      className="form-input"
                      type="text"
                      value={statementDescription}
                      onChange={(e) => setStatementDescription(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  {/* External reference ID */}
                  <div className="form-group">
                    <label htmlFor="txn-external-ref" className="form-group__label">
                      External Reference ID
                    </label>
                    <input
                      id="txn-external-ref"
                      className="form-input"
                      type="text"
                      value={externalReferenceId}
                      onChange={(e) => setExternalReferenceId(e.target.value)}
                      readOnly={isEditMode && !!initialData?.externalReferenceId}
                      autoComplete="off"
                    />
                  </div>

                  {/* Custom fields — key/value pairs */}
                  <div className="form-group">
                    <label className="form-group__label">Custom Fields</label>
                    {customFieldEntries.map((entry, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          gap: 'var(--spacing-2)',
                          marginBottom: 'var(--spacing-1)',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          className="form-input"
                          type="text"
                          placeholder="Field name"
                          value={entry.key}
                          onChange={(e) => {
                            const updated = [...customFieldEntries];
                            updated[idx] = { ...entry, key: e.target.value };
                            setCustomFieldEntries(updated);
                          }}
                          aria-label={`Custom field ${idx + 1} name`}
                          autoComplete="off"
                          style={{ flex: 1 }}
                        />
                        <input
                          className="form-input"
                          type="text"
                          placeholder="Value"
                          value={entry.value}
                          onChange={(e) => {
                            const updated = [...customFieldEntries];
                            updated[idx] = { ...entry, value: e.target.value };
                            setCustomFieldEntries(updated);
                          }}
                          aria-label={`Custom field ${idx + 1} value`}
                          autoComplete="off"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCustomFieldEntries(customFieldEntries.filter((_, i) => i !== idx));
                          }}
                          aria-label={`Remove custom field ${idx + 1}`}
                          className="icon-button"
                          style={{ flexShrink: 0 }}
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setCustomFieldEntries([...customFieldEntries, { key: '', value: '' }])
                      }
                      className="form-button form-button--secondary"
                      style={{
                        fontSize: 'var(--type-scale-caption-font-size)',
                        padding: 'var(--spacing-1) var(--spacing-2)',
                      }}
                    >
                      + Add Field
                    </button>
                  </div>

                  {/* Extra notes */}
                  <div className="form-group">
                    <label htmlFor="txn-extra-notes" className="form-group__label">
                      Extra Notes
                    </label>
                    <textarea
                      id="txn-extra-notes"
                      className="form-textarea"
                      value={extraNotes}
                      onChange={(e) => setExtraNotes(e.target.value)}
                      rows={3}
                      placeholder="Free-form text — bank memos, import leftovers, etc."
                    />
                  </div>
                </div>
              )}
            </fieldset>
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
              {submitting ? submittingLabel : submitButtonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
