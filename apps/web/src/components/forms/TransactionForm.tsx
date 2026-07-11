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
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import { useAutoCategorize } from '../../hooks/useAutoCategorize';
import { formatCentsDisplay, useAmountInput } from '../../hooks/useAmountInput';
import { useMerchants } from '../../hooks/useMerchants';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import type {
  Account,
  Category,
  ContributionDesignation,
  Currency,
  Transaction,
  TransactionSplit,
  TransactionSplitSharing,
  TransactionStatus,
  TransactionType,
} from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { BNPL_CUSTOM_FIELD_KEYS } from '../../lib/bnpl-liability';
import {
  applyLocalTimestampToCustomFields,
  captureNow,
  createLocalTimestamp,
  getBrowserTimeZone,
  isLocalTimestampFieldKey,
  localTimestampFromCustomFields,
} from '../../lib/transactions/local-timestamp';
import {
  CONTRIBUTION_DESIGNATION_OPTIONS,
  getRetirementAccountTypeLabel,
  supportsEmployerRetirementContributions,
} from '../../lib/tax/retirement-contribution-metadata';
import {
  TAX_CATEGORY_PLANNING_COPY,
  buildTaxCategoryCustomFieldPatch,
} from '../../lib/tax/tax-category-ui-model';
import type { DeductibleStatus, TaxCategory } from '../../lib/tax/tax-category-tagging';
import type { CategorySuggestion } from '../../lib/categorization';
import type { MerchantMatchResult } from '../../lib/merchants';
import {
  MOOD_TAGS,
  MOOD_TAGS_CHANGED_EVENT,
  isMoodTagsEnabled,
  normalizeMoodTag,
} from '../../lib/mood-tags';
import { buildDictationControlProps } from '../../lib/a11y/dictation-entry';
import { summarizeSplitSharing, validateTransactionSplits } from '../../lib/transactions/splits';
import { getCurrencyDecimals, isFxFieldKey, readFxMetadata } from '../../lib/currency/minor-units';
import { transactionSchema } from '../../lib/validation';
import { DateInput } from '../common';
import { Button } from '../common/Button';
import { CategoryConfirmation } from '../categorization';
import { AmountInput } from './AmountInput';
import { Checkbox } from '../common/Checkbox';
import { CounterpartyInput } from '../transactions/CounterpartyInput';
import { FormErrorSummary, type FormErrorSummaryItem } from './FormErrorSummary';

import { dollarsToCents } from '../../lib/currency';
import './forms.css';

/**
 * Currency picker + foreign-exchange entry fields, loaded lazily so their
 * markup, the currency option list, and the conversion math stay out of the
 * (saturated) shared route bundles until the transaction form is opened.
 */
const CurrencyFxSection = lazy(() => import('./CurrencyFxSection'));

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
  /**
   * Callback invoked with validated form data when the user submits. The
   * optional `options.addAnother` flag is set when the user chose "Save and add
   * another" so the caller can keep the dialog open for fast batch entry
   * (#3650).
   */
  onSubmit: (data: CreateTransactionInput, options?: { addAnother?: boolean }) => Promise<void>;
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

function createSplitRowId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `split-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatSplitAmountInput(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

function parseSplitAmountInput(value: string): number {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? dollarsToCents(parsed) : 0;
}

function formatSplitRemainder(remainingCents: number): string {
  if (remainingCents === 0) {
    return 'Remaining: $0.00';
  }

  const label = remainingCents > 0 ? 'Remaining' : 'Overassigned';
  return `${label}: ${formatCentsDisplay(Math.abs(remainingCents))}`;
}

function splitRowsToTransactionSplits(rows: readonly SplitFormRow[]): TransactionSplit[] {
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId || null,
    amount: { amount: parseSplitAmountInput(row.amountInput) },
    note: row.note.trim() || null,
    sharing: row.sharing,
  }));
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

// Tax treatment options (issue #3226). Selecting a category writes the `tax.*`
// custom fields the tax-reserve engine and Schedule C report already consume.
// Labels stay in the presentation layer; the enum lives in tax-category-tagging.
const TAX_CATEGORY_OPTIONS: readonly { value: TaxCategory; label: string }[] = [
  { value: 'SCHEDULE_C_INCOME', label: 'Business income (Schedule C)' },
  { value: 'SCHEDULE_C_EXPENSE', label: 'Business expense (Schedule C)' },
  { value: 'BUSINESS_MEALS', label: 'Business meals' },
  { value: 'HOME_OFFICE', label: 'Home office' },
  { value: 'BUSINESS_MILEAGE', label: 'Car / mileage' },
  { value: 'CAPITALIZED_ASSET', label: 'Equipment / capitalized asset' },
  { value: 'CHARITABLE_CASH', label: 'Charitable donation (cash)' },
  { value: 'CHARITABLE_NON_CASH', label: 'Charitable donation (non-cash)' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'STATE_LOCAL_TAX', label: 'State / local tax' },
  { value: 'RETIREMENT_CONTRIBUTION', label: 'Retirement contribution' },
  { value: 'INVESTMENT_TAX', label: 'Investment / capital gains' },
  { value: 'REVIEW_NEEDED', label: 'Needs review' },
];

const DEDUCTIBLE_STATUS_OPTIONS: readonly { value: DeductibleStatus; label: string }[] = [
  { value: 'DEDUCTIBLE', label: 'Fully deductible' },
  { value: 'PARTIALLY_DEDUCTIBLE', label: 'Partially deductible' },
  { value: 'NON_DEDUCTIBLE', label: 'Not deductible' },
  { value: 'REIMBURSABLE', label: 'Reimbursable' },
  { value: 'CAPITALIZED', label: 'Capitalized' },
  { value: 'REVIEW_NEEDED', label: 'Needs review' },
];

const MANAGED_TAX_FIELD_KEYS = new Set([
  'tax.category',
  'tax.deductibleStatus',
  'tax.businessPurposeNote',
]);

/** Whether a custom-field key is owned by the Tax treatment section (issue #3226). */
function isManagedTaxFieldKey(key: string): boolean {
  return MANAGED_TAX_FIELD_KEYS.has(key);
}

/** Sensible default deductible status when a tax category is first selected. */
function defaultDeductibleStatusFor(category: string): DeductibleStatus {
  switch (category) {
    case 'SCHEDULE_C_INCOME':
    case 'STATE_LOCAL_TAX':
      return 'NON_DEDUCTIBLE';
    case 'BUSINESS_MEALS':
      return 'PARTIALLY_DEDUCTIBLE';
    case 'CAPITALIZED_ASSET':
      return 'CAPITALIZED';
    case 'REVIEW_NEEDED':
      return 'REVIEW_NEEDED';
    default:
      return 'DEDUCTIBLE';
  }
}

function buildTransactionSnapshot(initialData?: Transaction) {
  const existingLocalTimestamp = localTimestampFromCustomFields(initialData?.customFields ?? null);
  const fxMetadata = readFxMetadata(initialData?.customFields ?? null);
  const browserTimeZone = getBrowserTimeZone();
  return {
    transactionType: initialData?.type ?? 'EXPENSE',
    // For a foreign-currency transaction, the form edits the ORIGINAL amount in
    // the original currency; the stored `amount` is the converted base amount.
    amountCents: fxMetadata?.originalAmountMinor ?? initialData?.amount.amount ?? 0,
    transactionCurrencyCode: fxMetadata?.originalCurrency ?? '',
    exchangeRateInput: fxMetadata?.rate ?? '',
    rateCapturedAt: fxMetadata?.rateTimestamp ?? null,
    description: initialData?.payee ?? '',
    status: initialData?.status ?? 'PENDING',
    categoryId: initialData?.categoryId ?? '',
    splitRows:
      initialData?.splits?.map((split) => ({
        id: split.id ?? createSplitRowId(),
        categoryId: split.categoryId ?? '',
        amountInput: formatSplitAmountInput(split.amount.amount),
        note: split.note ?? '',
        sharing: split.sharing ?? 'SHARED',
      })) ?? [],
    accountId: initialData?.accountId ?? '',
    date: initialData?.date ?? todayISO(),
    notes: initialData?.note ?? '',
    tagsInput: initialData ? tagsToString(initialData.tags) : '',
    isRetirementContribution: Boolean(initialData?.retirementContributionDesignation),
    retirementContributionYear:
      initialData?.retirementContributionYear !== null &&
      initialData?.retirementContributionYear !== undefined
        ? String(initialData.retirementContributionYear)
        : (initialData?.date ?? todayISO()).slice(0, 4),
    retirementContributionDesignation: initialData?.retirementContributionDesignation ?? 'EMPLOYEE',
    moodTag: normalizeMoodTag(initialData?.moodTag),
    counterpartyName: initialData?.counterpartyName ?? '',
    isBnplLiability: initialData?.customFields?.[BNPL_CUSTOM_FIELD_KEYS.liabilityType] === 'BNPL',
    bnplInstallmentCount:
      initialData?.customFields?.[BNPL_CUSTOM_FIELD_KEYS.installmentCount] ?? '4',
    taxCategory: initialData?.customFields?.['tax.category'] ?? '',
    taxDeductibleStatus: initialData?.customFields?.['tax.deductibleStatus'] ?? '',
    taxBusinessPurposeNote: initialData?.customFields?.['tax.businessPurposeNote'] ?? '',
    merchantCity: initialData?.merchantCity ?? '',
    merchantState: initialData?.merchantState ?? '',
    merchantZip: initialData?.merchantZip ?? '',
    merchantCountry: initialData?.merchantCountry ?? '',
    statementDescription: initialData?.statementDescription ?? '',
    externalReferenceId: initialData?.externalReferenceId ?? '',
    extraNotes: initialData?.extraNotes ?? '',
    customFieldEntries: initialData?.customFields
      ? Object.entries(initialData.customFields)
          .filter(
            ([key]) =>
              !isLocalTimestampFieldKey(key) && !isFxFieldKey(key) && !isManagedTaxFieldKey(key),
          )
          .map(([key, value]) => ({ key, value }))
      : [],
    localTime:
      existingLocalTimestamp?.localDateTime ??
      (initialData ? '' : captureNow(browserTimeZone).localDateTime),
    localTimeZone: existingLocalTimestamp?.timeZone ?? browserTimeZone,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  amount?: string;
  description?: string;
  accountId?: string;
  splits?: string;
  rate?: string;
}

interface SplitFormRow {
  id: string;
  categoryId: string;
  amountInput: string;
  note: string;
  sharing: TransactionSplitSharing;
}

function validate(
  amountCents: number,
  description: string,
  accountId: string,
  type: TransactionType,
  date: string,
): FormErrors {
  const errors: FormErrors = {};
  const normalizedAmountCents = normalizeTransactionAmount(amountCents, type);
  const result = transactionSchema.safeParse({
    description: description.trim(),
    amount: Math.abs(normalizedAmountCents) / 100,
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

  // Extra check: magnitude must be > 0
  if (normalizedAmountCents === 0 && !errors.amount) {
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
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  // Tracks which submit button was used so a successful create can either close
  // the dialog ("Save") or keep it open for the next entry ("Save and add
  // another", #3650).
  const submitModeRef = useRef<'close' | 'add-another'>('close');

  // -- state ---------------------------------------------------------------
  const [transactionType, setTransactionType] = useState<TransactionType>('EXPENSE');
  const [accountId, setAccountId] = useState('');

  // -- currency / foreign-exchange state -----------------------------------
  // The transaction currency defaults from the selected account's currency but
  // can be overridden per transaction (digital-nomad foreign spend). When a
  // non-base currency is chosen we also capture the exchange rate used and the
  // moment it was captured, so the base-currency (account) impact stays exact.
  const [currencyCode, setCurrencyCode] = useState('');
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [rateCapturedAt, setRateCapturedAt] = useState<string | null>(null);

  const baseCurrency = useMemo<Currency>(() => {
    const account = accounts.find((candidate) => candidate.id === accountId);
    return account?.currency ?? Currencies.USD;
  }, [accounts, accountId]);

  // Effective entry currency: the user's override when set, else the account's.
  const entryCurrencyCode = currencyTouched && currencyCode ? currencyCode : baseCurrency.code;
  const entryCurrency = useMemo<Currency>(
    () => ({ code: entryCurrencyCode, decimalPlaces: getCurrencyDecimals(entryCurrencyCode) }),
    [entryCurrencyCode],
  );
  const isForeignEntry = entryCurrency.code !== baseCurrency.code;
  // The amount field shows the entry-currency symbol (e.g. $, €, ฿). It is
  // resolved inside the lazily-loaded CurrencyFxSection (which owns the `Intl`
  // symbol path) and reported back here, keeping that code out of the shared
  // route bundle. Defaults to "$" so a same-currency USD entry never flashes.
  const [entrySymbol, setEntrySymbol] = useState('$');

  const amountInput = useAmountInput({
    currencySymbol: entrySymbol,
    decimalPlaces: entryCurrency.decimalPlaces,
    allowNegative: transactionType !== 'INCOME',
  });
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('PENDING');
  const [categoryId, setCategoryId] = useState('');
  const [splitRows, setSplitRows] = useState<SplitFormRow[]>([]);
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isRetirementContribution, setIsRetirementContribution] = useState(false);
  const [retirementContributionYear, setRetirementContributionYear] = useState('');
  const [retirementContributionDesignation, setRetirementContributionDesignation] =
    useState<ContributionDesignation>('EMPLOYEE');
  const [moodTag, setMoodTag] = useState<string | null>(null);
  const [moodTagsEnabled, setMoodTagsEnabled] = useState(() => isMoodTagsEnabled());
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Polite confirmation announced after "Save and add another" so assistive
  // tech users know the entry saved and the form is ready for the next (#3650).
  const [addAnotherStatus, setAddAnotherStatus] = useState('');
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [counterpartyName, setCounterpartyName] = useState('');
  const [merchantMatch, setMerchantMatch] = useState<MerchantMatchResult | null>(null);
  const [isBnplLiability, setIsBnplLiability] = useState(false);
  const [bnplInstallmentCount, setBnplInstallmentCount] = useState('4');
  const [taxCategory, setTaxCategory] = useState('');
  const [taxDeductibleStatus, setTaxDeductibleStatus] = useState('');
  const [taxBusinessPurposeNote, setTaxBusinessPurposeNote] = useState('');

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
  const [localTime, setLocalTime] = useState('');
  const [localTimeZone, setLocalTimeZone] = useState(() => getBrowserTimeZone());
  const initialSnapshot = useMemo(() => buildTransactionSnapshot(initialData), [initialData]);
  const currentSnapshot = useMemo(
    () => ({
      transactionType,
      amountCents: amountInput.cents,
      transactionCurrencyCode: currencyTouched ? currencyCode : '',
      exchangeRateInput,
      rateCapturedAt,
      description,
      status,
      categoryId,
      splitRows,
      accountId,
      date,
      notes,
      tagsInput,
      isRetirementContribution,
      retirementContributionYear,
      retirementContributionDesignation,
      moodTag,
      counterpartyName,
      isBnplLiability,
      bnplInstallmentCount,
      taxCategory,
      taxDeductibleStatus,
      taxBusinessPurposeNote,
      merchantCity,
      merchantState,
      merchantZip,
      merchantCountry,
      statementDescription,
      externalReferenceId,
      extraNotes,
      customFieldEntries,
      localTime,
      localTimeZone,
    }),
    [
      accountId,
      amountInput.cents,
      bnplInstallmentCount,
      categoryId,
      counterpartyName,
      currencyCode,
      currencyTouched,
      customFieldEntries,
      date,
      description,
      exchangeRateInput,
      externalReferenceId,
      extraNotes,
      isBnplLiability,
      isRetirementContribution,
      localTime,
      localTimeZone,
      merchantCity,
      merchantCountry,
      merchantState,
      merchantZip,
      moodTag,
      notes,
      rateCapturedAt,
      retirementContributionDesignation,
      retirementContributionYear,
      splitRows,
      statementDescription,
      status,
      tagsInput,
      taxBusinessPurposeNote,
      taxCategory,
      taxDeductibleStatus,
      transactionType,
    ],
  );
  const isDirty = isOpen && JSON.stringify(currentSnapshot) !== JSON.stringify(initialSnapshot);
  const { confirmNavigation } = useNavigationGuard({
    when: isDirty,
    message: 'Discard the transaction changes you have not saved yet?',
  });

  // -- auto-categorisation --------------------------------------------------
  const { suggestCategory: autoSuggest, learnFromFeedback } = useAutoCategorize(categories);

  // -- merchant matching ----------------------------------------------------
  const { merchants, matchDescription, recordMatch } = useMerchants();

  // -- focus trap -----------------------------------------------------------
  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  // -- autofocus first field ------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setAddAnotherStatus('');
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
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
      amountInput.setCents(initialSnapshot.amountCents);
    } else {
      amountInput.reset(0);
    }
    setDescription(initialSnapshot.description);
    setTransactionType(initialSnapshot.transactionType);
    setStatus(initialSnapshot.status);
    setCategoryId(initialSnapshot.categoryId);
    setSplitRows(initialSnapshot.splitRows);
    setAccountId(initialSnapshot.accountId);
    setCurrencyCode(initialSnapshot.transactionCurrencyCode);
    setCurrencyTouched(initialSnapshot.transactionCurrencyCode !== '');
    setExchangeRateInput(initialSnapshot.exchangeRateInput);
    setRateCapturedAt(initialSnapshot.rateCapturedAt);
    setDate(initialSnapshot.date);
    setNotes(initialSnapshot.notes);
    setTagsInput(initialSnapshot.tagsInput);
    setIsRetirementContribution(initialSnapshot.isRetirementContribution);
    setRetirementContributionYear(initialSnapshot.retirementContributionYear);
    setRetirementContributionDesignation(initialSnapshot.retirementContributionDesignation);
    setMoodTag(initialSnapshot.moodTag);
    setCounterpartyName(initialSnapshot.counterpartyName);
    setMerchantMatch(null);
    setIsBnplLiability(initialSnapshot.isBnplLiability);
    setBnplInstallmentCount(initialSnapshot.bnplInstallmentCount);
    setTaxCategory(initialSnapshot.taxCategory);
    setTaxDeductibleStatus(initialSnapshot.taxDeductibleStatus);
    setTaxBusinessPurposeNote(initialSnapshot.taxBusinessPurposeNote);
    setErrors({});
    setSubmitting(false);
    setSubmitError(null);
    setSuggestion(null);

    // Additional details
    setMerchantCity(initialSnapshot.merchantCity);
    setMerchantState(initialSnapshot.merchantState);
    setMerchantZip(initialSnapshot.merchantZip);
    setMerchantCountry(initialSnapshot.merchantCountry);
    setStatementDescription(initialSnapshot.statementDescription);
    setExternalReferenceId(initialSnapshot.externalReferenceId);
    setExtraNotes(initialSnapshot.extraNotes);
    setLocalTime(initialSnapshot.localTime);
    setLocalTimeZone(initialSnapshot.localTimeZone);
    setCustomFieldEntries(initialSnapshot.customFieldEntries);
    setAdditionalOpen(false);
  }, [amountInput.reset, amountInput.setCents, initialData, initialSnapshot, isOpen]);

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

  // -- auto-suggest category when description changes ----------------------
  useEffect(() => {
    if (!isOpen || !description.trim()) {
      setSuggestion(null);
      return;
    }

    const amountCents = Math.abs(amountInput.cents) > 0 ? Math.abs(amountInput.cents) : undefined;
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

  const isEditMode = initialData !== undefined;
  const dialogTitle = isEditMode ? 'Edit Transaction' : 'New Transaction';
  const submitButtonLabel = isEditMode ? 'Update Transaction' : 'Add Transaction';
  const submittingLabel = isEditMode ? 'Updating╬ô├ç┬¬' : 'Adding╬ô├ç┬¬';
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

  const transactionSplits = useMemo(() => splitRowsToTransactionSplits(splitRows), [splitRows]);
  const splitValidation = useMemo(
    () => validateTransactionSplits(Math.abs(amountInput.cents), transactionSplits),
    [amountInput.cents, transactionSplits],
  );
  const hasSplitRows = splitRows.length > 0;
  const splitRemainderText = formatSplitRemainder(splitValidation.remainingCents);
  const splitSharing = useMemo(() => summarizeSplitSharing(transactionSplits), [transactionSplits]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId],
  );

  // -- foreign-currency conversion (derived) -------------------------------
  // The base-currency equivalent itself is computed in the lazily-loaded
  // CurrencyFxSection (display) and recomputed at submit, keeping the
  // conversion math out of this widely-imported bundle.
  const parsedExchangeRate = Number.parseFloat(exchangeRateInput);
  const hasValidExchangeRate =
    exchangeRateInput.trim() !== '' &&
    Number.isFinite(parsedExchangeRate) &&
    parsedExchangeRate > 0;

  const updateSplitRow = useCallback((id: string, updates: Partial<SplitFormRow>) => {
    setSplitRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...updates } : row)));
  }, []);

  const addSplitRow = useCallback(() => {
    setSplitRows((rows) => {
      const totalCents = Math.abs(amountInput.cents);
      const currentSplits = splitRowsToTransactionSplits(rows);
      const currentValidation = validateTransactionSplits(totalCents, currentSplits);
      const defaultAmountCents =
        rows.length === 0 ? totalCents : Math.max(currentValidation.remainingCents, 0);

      return [
        ...rows,
        {
          id: createSplitRowId(),
          categoryId: '',
          amountInput: defaultAmountCents > 0 ? formatSplitAmountInput(defaultAmountCents) : '',
          note: '',
          sharing: 'SHARED',
        },
      ];
    });
  }, [amountInput.cents]);

  const removeSplitRow = useCallback((id: string) => {
    setSplitRows((rows) => rows.filter((row) => row.id !== id));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      // Capture and reset the requested submit mode immediately so it cannot
      // leak into a later submission if this one bails out on validation.
      const addAnother = !isEditMode && submitModeRef.current === 'add-another';
      submitModeRef.current = 'close';

      const normalizedAmountCents = normalizeTransactionAmount(amountInput.cents, transactionType);
      const fieldErrors = validate(
        normalizedAmountCents,
        description,
        accountId,
        transactionType,
        date,
      );

      if (hasSplitRows && !splitValidation.isBalanced) {
        fieldErrors.splits = `${splitValidation.error ?? 'Split amounts must equal the transaction total.'} ${splitRemainderText}`;
      }

      if (isForeignEntry && !hasValidExchangeRate) {
        fieldErrors.rate = 'Enter the exchange rate used.';
      }

      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length > 0) {
        requestAnimationFrame(() => errorSummaryRef.current?.focus());
        return;
      }

      // Derive householdId from the selected account.
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

      // Tax treatment (issue #3226): persist the tax.* custom fields the
      // tax-reserve engine and Schedule C report read. Cleared when no category
      // is selected so the deductible pipeline never sees stale data.
      if (taxCategory) {
        Object.assign(
          customFields,
          buildTaxCategoryCustomFieldPatch({
            category: taxCategory as TaxCategory,
            deductibleStatus: (taxDeductibleStatus ||
              defaultDeductibleStatusFor(taxCategory)) as DeductibleStatus,
            ...(taxBusinessPurposeNote.trim()
              ? { businessPurposeNote: taxBusinessPurposeNote.trim() }
              : {}),
          }),
        );
      } else {
        delete customFields['tax.category'];
        delete customFields['tax.deductibleStatus'];
        delete customFields['tax.businessPurposeNote'];
      }

      // Foreign-currency entry: the user typed the ORIGINAL local amount; store
      // the converted BASE (account) amount so balances stay correct, and keep
      // the original amount, currency, rate, and rate timestamp in customFields.
      // The conversion math is loaded lazily (only needed for foreign spend).
      let baseAmountCents = normalizedAmountCents;
      if (isForeignEntry) {
        const { convertToBaseMinorUnits, buildFxCustomFields } =
          await import('../../lib/currency/fx-convert');
        baseAmountCents = convertToBaseMinorUnits({
          originalMinorUnits: normalizedAmountCents,
          originalDecimals: entryCurrency.decimalPlaces,
          baseDecimals: baseCurrency.decimalPlaces,
          rate: parsedExchangeRate,
        });
        Object.assign(
          customFields,
          buildFxCustomFields({
            originalAmountMinor: normalizedAmountCents,
            originalCurrency: entryCurrency.code,
            rate: exchangeRateInput.trim(),
            rateTimestamp: rateCapturedAt ?? new Date().toISOString(),
            baseCurrency: baseCurrency.code,
          }),
        );
      }

      // Preserve the captured local time + zone alongside the transaction in the
      // web store's flexible customFields bag (no schema change). Absent when the
      // user clears the field, which degrades to legacy date-only behavior.
      const localTimestamp = localTime.trim()
        ? createLocalTimestamp(localTime, localTimeZone.trim() || null)
        : null;
      const customFieldsWithTimestamp = applyLocalTimestampToCustomFields(
        customFields,
        localTimestamp,
      );

      const input: CreateTransactionInput = {
        householdId: selectedAccount.householdId,
        accountId,
        type: transactionType,
        status,
        amount: { amount: baseAmountCents },
        currency: baseCurrency,
        payee: description.trim(),
        date,
        categoryId:
          categoryId || transactionSplits.find((split) => split.categoryId)?.categoryId || null,
        note: notes.trim() || null,
        tags: parseTags(tagsInput),
        retirementContributionYear: isRetirementContribution
          ? Number.parseInt(retirementContributionYear || date.slice(0, 4), 10)
          : null,
        retirementContributionDesignation: isRetirementContribution
          ? retirementContributionDesignation
          : null,
        ...(hasSplitRows ? { splits: transactionSplits } : {}),
        ...(moodTagsEnabled ? { moodTag } : {}),
        merchantCity: merchantCity.trim() || null,
        merchantState: merchantState.trim() || null,
        merchantZip: merchantZip.trim() || null,
        merchantCountry: merchantCountry.trim() || null,
        statementDescription: statementDescription.trim() || null,
        externalReferenceId: externalReferenceId.trim() || null,
        customFields:
          Object.keys(customFieldsWithTimestamp).length > 0 ? customFieldsWithTimestamp : null,
        extraNotes: extraNotes.trim() || null,
        counterpartyName: counterpartyName.trim() || null,
      };

      // Record merchant match for ranking
      if (merchantMatch) {
        recordMatch(merchantMatch.merchant.id);
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        if (addAnother) {
          await onSubmit(input, { addAnother: true });
        } else {
          await onSubmit(input);
        }

        if (categoryId && description.trim()) {
          learnFromFeedback({
            description,
            amountCents: Math.abs(normalizedAmountCents),
            categoryId,
            categoryName: categories.find((category) => category.id === categoryId)?.name ?? null,
          });
        }

        // Reset form on success. "Save and add another" keeps sensible context
        // (account, date, type, status, currency) for the next entry (#3650);
        // "Save" resets everything before the dialog closes.
        amountInput.reset(0);
        amountInput.setSign('negative');
        setDescription('');
        setCategoryId('');
        setSplitRows([]);
        setNotes('');
        setTagsInput('');
        setIsRetirementContribution(false);
        setRetirementContributionYear(todayISO().slice(0, 4));
        setRetirementContributionDesignation('EMPLOYEE');
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
        setLocalTime(captureNow(getBrowserTimeZone()).localDateTime);
        setLocalTimeZone(getBrowserTimeZone());
        setAdditionalOpen(false);

        if (!addAnother) {
          setTransactionType('EXPENSE');
          setStatus('PENDING');
          setAccountId('');
          setCurrencyCode('');
          setCurrencyTouched(false);
          setExchangeRateInput('');
          setRateCapturedAt(null);
          setDate(todayISO());
        } else {
          // Keep the dialog open, return focus to the first field, and confirm
          // the save to assistive tech for the next fast entry.
          setAddAnotherStatus('Transaction saved. Ready to add another.');
          requestAnimationFrame(() => firstInputRef.current?.focus());
        }
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
      isEditMode,
      baseCurrency,
      entryCurrency,
      isForeignEntry,
      hasValidExchangeRate,
      parsedExchangeRate,
      exchangeRateInput,
      rateCapturedAt,
      selectedAccount,
      transactionType,
      status,
      date,
      categoryId,
      transactionSplits,
      hasSplitRows,
      splitValidation,
      splitRemainderText,
      notes,
      tagsInput,
      isRetirementContribution,
      retirementContributionYear,
      retirementContributionDesignation,
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
      localTime,
      localTimeZone,
      counterpartyName,
      merchantMatch,
      isBnplLiability,
      bnplInstallmentCount,
      onSubmit,
      submitFailureMessage,
      suggestion,
      learnFromFeedback,
      categories,
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
  const hasSplitError = Boolean(errors.splits);
  const hasRateError = Boolean(errors.rate);
  const hasValidationErrors = Object.keys(errors).length > 0;
  const retirementContributionWarning =
    isRetirementContribution && selectedAccount
      ? selectedAccount.retirementAccountType
        ? retirementContributionDesignation === 'EMPLOYER' &&
          !supportsEmployerRetirementContributions(selectedAccount.retirementAccountType)
          ? `${getRetirementAccountTypeLabel(
              selectedAccount.retirementAccountType,
            )} contributions cannot be tagged as employer-funded in the annual-limit tracker.`
          : null
        : 'Selected account is not classified as a supported retirement account, so this contribution will be flagged in limit tracking.'
      : null;
  const validationErrorItems: FormErrorSummaryItem[] = [
    hasAmountError ? { fieldId: 'txn-amount', label: 'Amount', message: errors.amount! } : null,
    hasDescriptionError
      ? { fieldId: 'txn-description', label: 'Payee', message: errors.description! }
      : null,
    hasAccountError
      ? { fieldId: 'txn-account', label: 'Account', message: errors.accountId! }
      : null,
    hasRateError
      ? { fieldId: 'txn-exchange-rate', label: 'Exchange rate', message: errors.rate! }
      : null,
    hasSplitError
      ? { fieldId: 'txn-splits-status', label: 'Splits', message: errors.splits! }
      : null,
  ].filter((item): item is FormErrorSummaryItem => item !== null);
  const dictationControls = {
    amount: buildDictationControlProps({ id: 'txn-amount', visibleLabel: 'Amount' }),
    payee: buildDictationControlProps({ id: 'txn-description', visibleLabel: 'Payee' }),
    status: buildDictationControlProps({ id: 'txn-status', visibleLabel: 'Status' }),
    category: buildDictationControlProps({ id: 'txn-category', visibleLabel: 'Category' }),
    account: buildDictationControlProps({ id: 'txn-account', visibleLabel: 'Account' }),
    date: buildDictationControlProps({ id: 'txn-date', visibleLabel: 'Date' }),
    notes: buildDictationControlProps({ id: 'txn-notes', visibleLabel: 'Notes' }),
    tags: buildDictationControlProps({ id: 'txn-tags', visibleLabel: 'Tags' }),
  } as const;

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
        <FormErrorSummary
          id="transaction-form-error-summary"
          errors={validationErrorItems}
          summaryRef={errorSummaryRef}
        />

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={
            validationErrorItems.length > 0 ? 'transaction-form-error-summary' : undefined
          }
        >
          <div className="form-fields">
            {/* Amount (Venmo-style cents-first) */}
            <div className="form-group">
              <label htmlFor="txn-amount" className="form-group__label form-group__label--required">
                Amount
              </label>
              <p id="txn-amount-help" className="form-group__help">
                Type digits only. The decimal is applied automatically from the right.
              </p>
              <AmountInput
                ref={firstInputRef}
                id={dictationControls.amount.id}
                name={dictationControls.amount.name}
                aria-label={dictationControls.amount['aria-label']}
                data-dictation-label={dictationControls.amount.label}
                amountInput={amountInput}
                className={`form-input${hasAmountError ? ' form-input--error' : ''}`}
                placeholder={amountInput.placeholderValue}
                aria-invalid={hasAmountError}
                aria-describedby={`txn-amount-help${hasAmountError ? ' txn-amount-error' : ''}`}
                aria-required="true"
                autoComplete="off"
                toggleLabel="Toggle transaction amount sign"
              />
              {hasAmountError && (
                <span id="txn-amount-error" className="form-error" role="alert">
                  {errors.amount}
                </span>
              )}
            </div>

            {/* Currency picker + foreign-exchange fields (lazily loaded) */}
            <Suspense fallback={<div className="form-group" aria-hidden="true" />}>
              <CurrencyFxSection
                entryCurrencyCode={entryCurrencyCode}
                baseCurrencyCode={baseCurrency.code}
                onCurrencyChange={(code) => {
                  setCurrencyCode(code);
                  setCurrencyTouched(true);
                }}
                onEntrySymbolResolved={setEntrySymbol}
                originalMinorUnits={amountInput.cents}
                exchangeRateInput={exchangeRateInput}
                onExchangeRateChange={(value) => {
                  setExchangeRateInput(value);
                  setRateCapturedAt(new Date().toISOString());
                }}
                rateError={errors.rate}
                rateCapturedAt={rateCapturedAt}
              />
            </Suspense>

            {/* Payee */}
            <div className="form-group">
              <label
                htmlFor="txn-description"
                className="form-group__label form-group__label--required"
              >
                Payee
              </label>
              <p id="txn-description-help" className="form-group__help">
                What appears on your statement (e.g. ╬ô├ç┬úAMZN MKTPL*XYZ╬ô├ç┬Ñ).
              </p>
              <input
                id={dictationControls.payee.id}
                name={dictationControls.payee.name}
                aria-label={dictationControls.payee['aria-label']}
                data-dictation-label={dictationControls.payee.label}
                className={`form-input${hasDescriptionError ? ' form-input--error' : ''}`}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={hasDescriptionError}
                aria-describedby={`txn-description-help${
                  hasDescriptionError ? ' txn-description-error' : ''
                }`}
                aria-required="true"
                autoComplete="off"
              />
              {hasDescriptionError && (
                <span id="txn-description-error" className="form-error" role="alert">
                  {errors.description}
                </span>
              )}
            </div>

            {/* Type ╬ô├ç├┤ radio group */}
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
                id={dictationControls.status.id}
                name={dictationControls.status.name}
                aria-label={dictationControls.status['aria-label']}
                data-dictation-label={dictationControls.status.label}
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
              <p id="txn-counterparty-help" className="form-group__help">
                The actual merchant or person (e.g. ╬ô├ç┬úAmazon╬ô├ç┬Ñ, ╬ô├ç┬úSarah Lee╬ô├ç┬Ñ).
              </p>
              <CounterpartyInput
                id="txn-counterparty"
                value={counterpartyName}
                onChange={setCounterpartyName}
                merchants={merchants}
                matchResult={merchantMatch}
                onMerchantMatch={handleMerchantMatch}
                placeholder="e.g. Walgreens, Amazon"
                ariaDescribedBy="txn-counterparty-help"
              />
            </div>

            <fieldset className="form-group form-fieldset">
              <legend className="form-group__label">Buy-now-pay-later liability</legend>
              <Checkbox
                label="Track this purchase as a BNPL liability with installments"
                checked={isBnplLiability}
                onChange={(event) => setIsBnplLiability(event.target.checked)}
              />
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

            <fieldset className="form-group form-fieldset">
              <legend className="form-group__label">Tax treatment</legend>
              <p className="form-group__help">
                Flag business income and tax-deductible expenses so your Schedule C view and
                quarterly tax reserve run on real data instead of guesses.{' '}
                {TAX_CATEGORY_PLANNING_COPY}
              </p>
              <label htmlFor="txn-tax-category" className="form-group__label">
                Tax category
              </label>
              <select
                id="txn-tax-category"
                className="form-select"
                value={taxCategory}
                onChange={(event) => {
                  const next = event.target.value;
                  setTaxCategory(next);
                  if (next && !taxDeductibleStatus) {
                    setTaxDeductibleStatus(defaultDeductibleStatusFor(next));
                  }
                }}
              >
                <option value="">Not a business / tax item</option>
                {TAX_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {taxCategory && (
                <>
                  <label htmlFor="txn-tax-deductible-status" className="form-group__label">
                    Deductible status
                  </label>
                  <select
                    id="txn-tax-deductible-status"
                    className="form-select"
                    value={taxDeductibleStatus || defaultDeductibleStatusFor(taxCategory)}
                    onChange={(event) => setTaxDeductibleStatus(event.target.value)}
                  >
                    {DEDUCTIBLE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="txn-tax-note" className="form-group__label">
                    Business purpose (optional)
                  </label>
                  <input
                    id="txn-tax-note"
                    className="form-input"
                    type="text"
                    value={taxBusinessPurposeNote}
                    onChange={(event) => setTaxBusinessPurposeNote(event.target.value)}
                    placeholder="e.g. Client logo design software"
                  />
                </>
              )}
            </fieldset>

            {/* Category */}
            <div className="form-group">
              <label htmlFor="txn-category" className="form-group__label">
                Category
              </label>
              <select
                id={dictationControls.category.id}
                name={dictationControls.category.name}
                aria-label={dictationControls.category['aria-label']}
                data-dictation-label={dictationControls.category.label}
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">╬ô├ç├╢ None ╬ô├ç├╢</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {suggestion && !categoryId && (
                <CategoryConfirmation
                  suggestion={suggestion}
                  onAccept={handleAcceptSuggestion}
                  onReject={() => setSuggestion(null)}
                />
              )}
            </div>

            {/* Splits */}
            <fieldset className="form-group form-fieldset" aria-describedby="txn-splits-status">
              <legend className="form-group__label">Splits</legend>
              <p className="form-group__help">
                Allocate this transaction across multiple categories. Split amounts must add up to
                the transaction total.
              </p>
              {splitRows.map((split, index) => (
                <div
                  key={split.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 9rem 1fr 9rem auto',
                    gap: 'var(--spacing-2)',
                    alignItems: 'end',
                    marginBottom: 'var(--spacing-2)',
                  }}
                >
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor={`txn-split-${split.id}-category`} className="form-group__label">
                      Split {index + 1} category
                    </label>
                    <select
                      id={`txn-split-${split.id}-category`}
                      className="form-select"
                      value={split.categoryId}
                      onChange={(event) =>
                        updateSplitRow(split.id, { categoryId: event.target.value })
                      }
                    >
                      <option value="">None</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor={`txn-split-${split.id}-amount`} className="form-group__label">
                      Split {index + 1} amount
                    </label>
                    <input
                      id={`txn-split-${split.id}-amount`}
                      className={`form-input${hasSplitError ? ' form-input--error' : ''}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={split.amountInput}
                      onChange={(event) =>
                        updateSplitRow(split.id, { amountInput: event.target.value })
                      }
                      aria-invalid={hasSplitError}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor={`txn-split-${split.id}-note`} className="form-group__label">
                      Split {index + 1} note
                    </label>
                    <input
                      id={`txn-split-${split.id}-note`}
                      className="form-input"
                      type="text"
                      value={split.note}
                      onChange={(event) => updateSplitRow(split.id, { note: event.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor={`txn-split-${split.id}-sharing`} className="form-group__label">
                      Split {index + 1} sharing
                    </label>
                    <select
                      id={`txn-split-${split.id}-sharing`}
                      className="form-select"
                      value={split.sharing}
                      onChange={(event) =>
                        updateSplitRow(split.id, {
                          sharing: event.target.value as TransactionSplitSharing,
                        })
                      }
                    >
                      <option value="SHARED">Shared / joint</option>
                      <option value="PERSONAL">Personal</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removeSplitRow(split.id)}
                    aria-label={`Remove split ${index + 1}`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
              ))}
              <div
                id="txn-splits-status"
                aria-live="polite"
                style={{
                  color:
                    hasSplitRows && !splitValidation.isBalanced
                      ? 'var(--semantic-text-danger)'
                      : 'var(--semantic-text-secondary)',
                  marginBottom: 'var(--spacing-2)',
                }}
              >
                {hasSplitRows ? splitRemainderText : 'Unassigned: no split lines'}
              </div>
              {hasSplitRows && splitSharing.hasPersonal && (
                <p
                  aria-live="polite"
                  style={{
                    color: 'var(--semantic-text-secondary)',
                    marginBottom: 'var(--spacing-2)',
                  }}
                >
                  {`Shared: ${formatCentsDisplay(splitSharing.sharedCents)} · Personal: ${formatCentsDisplay(splitSharing.personalCents)}`}
                </p>
              )}
              {hasSplitError && (
                <span id="txn-splits-error" className="form-error" role="alert">
                  {errors.splits}
                </span>
              )}
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={addSplitRow}
              >
                Add split
              </button>
            </fieldset>

            {/* Account */}
            <div className="form-group">
              <label
                htmlFor="txn-account"
                className="form-group__label form-group__label--required"
              >
                Account
              </label>
              <select
                id={dictationControls.account.id}
                name={dictationControls.account.name}
                aria-label={dictationControls.account['aria-label']}
                data-dictation-label={dictationControls.account.label}
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

            <fieldset className="form-group form-fieldset">
              <legend className="form-group__label">Retirement contribution</legend>
              <Checkbox
                label="Count this transaction or transfer toward an annual contribution limit"
                checked={isRetirementContribution}
                onChange={(event) => {
                  setIsRetirementContribution(event.target.checked);
                  if (event.target.checked && retirementContributionYear.trim() === '') {
                    setRetirementContributionYear(date.slice(0, 4));
                  }
                }}
              />
              {isRetirementContribution && (
                <>
                  <div className="form-group">
                    <label htmlFor="txn-contribution-year" className="form-group__label">
                      Contribution year
                    </label>
                    <input
                      id="txn-contribution-year"
                      className="form-input"
                      type="number"
                      min="2000"
                      max="2100"
                      value={retirementContributionYear}
                      onChange={(event) => setRetirementContributionYear(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="txn-contribution-designation" className="form-group__label">
                      Contribution designation
                    </label>
                    <select
                      id="txn-contribution-designation"
                      className="form-select"
                      value={retirementContributionDesignation}
                      onChange={(event) =>
                        setRetirementContributionDesignation(
                          event.target.value as ContributionDesignation,
                        )
                      }
                    >
                      {CONTRIBUTION_DESIGNATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {retirementContributionWarning && (
                    <p className="form-hint" role="alert">
                      {retirementContributionWarning}
                    </p>
                  )}
                </>
              )}
            </fieldset>

            {/* Date */}
            <div className="form-group">
              <label htmlFor="txn-date" className="form-group__label">
                Date
              </label>
              <DateInput
                id={dictationControls.date.id}
                name={dictationControls.date.name}
                aria-label={dictationControls.date['aria-label']}
                data-dictation-label={dictationControls.date.label}
                className="form-input"
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
                id={dictationControls.notes.id}
                name={dictationControls.notes.name}
                aria-label={dictationControls.notes['aria-label']}
                data-dictation-label={dictationControls.notes.label}
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
                id={dictationControls.tags.id}
                name={dictationControls.tags.name}
                aria-label={dictationControls.tags['aria-label']}
                data-dictation-label={dictationControls.tags.label}
                className="form-input"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="client:Acme, project:Website redesign"
                autoComplete="off"
                aria-describedby="txn-tags-hint"
              />
              <span id="txn-tags-hint" className="form-hint">
                Separate multiple tags with commas. Use client: or project: tags for profitability
                reporting.
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

            {/* Additional Details ╬ô├ç├╢ expandable section */}
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
                    ╬ô├╗Γòó
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
                        placeholder="Seattle"
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
                        placeholder="WA"
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

                  {/* Purchase local time + timezone (preserved per issue #2206) */}
                  <fieldset className="form-group form-fieldset">
                    <legend className="form-group__label">Purchase local time &amp; zone</legend>
                    <p id="txn-local-time-hint" className="form-hint">
                      Local time and zone where the purchase happened, so daily-spend and trip
                      reports stay correct after you move. Defaults to now in your zone; clear to
                      keep the calendar date only.
                    </p>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--spacing-3)',
                      }}
                    >
                      <div className="form-group">
                        <label htmlFor="txn-local-time" className="form-group__label">
                          Local time
                        </label>
                        <input
                          id="txn-local-time"
                          className="form-input"
                          type="datetime-local"
                          value={localTime}
                          onChange={(e) => setLocalTime(e.target.value)}
                          aria-describedby="txn-local-time-hint"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="txn-local-timezone" className="form-group__label">
                          Time zone
                        </label>
                        <input
                          id="txn-local-timezone"
                          className="form-input"
                          type="text"
                          value={localTimeZone}
                          onChange={(e) => setLocalTimeZone(e.target.value)}
                          placeholder="Asia/Bangkok"
                          autoComplete="off"
                          aria-describedby="txn-local-time-hint"
                        />
                      </div>
                    </div>
                  </fieldset>

                  {/* Custom fields ╬ô├ç├╢ key/value pairs */}
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
                          <span aria-hidden="true">╬ô┬ú├▓</span>
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
                    />
                  </div>
                </div>
              )}
            </fieldset>
          </div>

          {hasValidationErrors && (
            <div className="form-submit-summary" role="status" aria-live="polite">
              Some fields need attention ╬ô├ç├╢ see highlighted errors above.
            </div>
          )}

          <div className="sr-only" aria-live="polite">
            {addAnotherStatus}
          </div>

          {/* Actions */}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
              Cancel
            </Button>
            {!isEditMode && (
              <Button
                type="submit"
                variant="secondary"
                loading={submitting}
                onClick={() => {
                  submitModeRef.current = 'add-another';
                }}
              >
                Save and add another
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              onClick={() => {
                submitModeRef.current = 'close';
              }}
            >
              {submitting ? submittingLabel : submitButtonLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
