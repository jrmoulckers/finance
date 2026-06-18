// SPDX-License-Identifier: BUSL-1.1

/**
 * Transaction-level tax-category and deductible-expense tagging helpers.
 *
 * This module is intentionally pure so UI, persistence, bulk edit, and tax reserve
 * flows can share the same classification semantics without coupling to React.
 * Amounts are integer cents. Classifications are estimates and are not tax advice.
 *
 * References: IRC §162 ordinary and necessary business expenses; issue #2259.
 */

const APP_RECEIPT_REVIEW_THRESHOLD_CENTS = 75_00;
const DEFAULT_DEDUCTION_PERCENT = 100;

export type TaxTransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TaxAccountPurpose = 'personal' | 'business' | 'both';

export type DeductibleStatus =
  | 'DEDUCTIBLE'
  | 'PARTIALLY_DEDUCTIBLE'
  | 'NON_DEDUCTIBLE'
  | 'REIMBURSABLE'
  | 'CAPITALIZED'
  | 'REVIEW_NEEDED';

export type ReceiptStatus = 'ATTACHED' | 'MISSING' | 'NOT_REQUIRED';

export type TaxCategory =
  | 'SCHEDULE_C_INCOME'
  | 'SCHEDULE_C_EXPENSE'
  | 'BUSINESS_MEALS'
  | 'HOME_OFFICE'
  | 'BUSINESS_MILEAGE'
  | 'CHARITABLE_CASH'
  | 'CHARITABLE_NON_CASH'
  | 'MEDICAL'
  | 'EDUCATION'
  | 'STATE_LOCAL_TAX'
  | 'RETIREMENT_CONTRIBUTION'
  | 'INVESTMENT_TAX'
  | 'PERSONAL_NON_DEDUCTIBLE'
  | 'REIMBURSABLE'
  | 'CAPITALIZED_ASSET'
  | 'REVIEW_NEEDED';

export interface TaxTaggableTransaction {
  readonly id: string;
  readonly date: string;
  readonly type: TaxTransactionType;
  readonly amountCents: number;
  readonly categoryName?: string;
  readonly payee?: string;
  readonly memo?: string;
  readonly accountPurpose?: TaxAccountPurpose;
  readonly customFields?: Readonly<Record<string, string | undefined>>;
}

export interface TaxTag {
  readonly transactionId: string;
  readonly taxYear: number;
  readonly category: TaxCategory;
  readonly deductibleStatus: DeductibleStatus;
  readonly deductionPercent: number;
  readonly receiptStatus: ReceiptStatus;
  readonly businessPurposeNote?: string;
  readonly reimbursable: boolean;
  readonly capitalized: boolean;
}

export interface TaxCategorySuggestion {
  readonly category: TaxCategory;
  readonly deductibleStatus: DeductibleStatus;
  readonly deductionPercent: number;
  readonly receiptStatus: ReceiptStatus;
  readonly confidence: number;
  readonly reason: string;
}

export interface PriorTaxTagRule {
  readonly payee?: string;
  readonly categoryName?: string;
  readonly suggestion: Omit<TaxCategorySuggestion, 'reason'>;
}

export interface TaggedTaxTransaction {
  readonly transaction: TaxTaggableTransaction;
  readonly tag: TaxTag;
  readonly deductibleAmountCents: number;
  readonly needsReview: boolean;
}

export interface TaxCategorySummaryRow {
  readonly category: TaxCategory;
  readonly transactionCount: number;
  readonly grossAmountCents: number;
  readonly deductibleAmountCents: number;
  readonly missingReceiptCount: number;
  readonly reviewNeededCount: number;
}

export interface TaxCategorySummary {
  readonly taxYear: number;
  readonly rows: readonly TaxCategorySummaryRow[];
  readonly totalDeductibleAmountCents: number;
  readonly missingReceiptTransactionIds: readonly string[];
  readonly reviewTransactionIds: readonly string[];
  readonly uncategorizedTransactionIds: readonly string[];
}

function taxYearFromDate(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid tax transaction date: ${date}`);
  }
  return year;
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function clampPercent(percent: number | undefined): number {
  if (!Number.isFinite(percent)) return DEFAULT_DEDUCTION_PERCENT;
  return Math.min(Math.max(Math.round(percent ?? DEFAULT_DEDUCTION_PERCENT), 0), 100);
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

function isKnownTaxCategory(value: string | undefined): value is TaxCategory {
  return (
    value === 'SCHEDULE_C_INCOME' ||
    value === 'SCHEDULE_C_EXPENSE' ||
    value === 'BUSINESS_MEALS' ||
    value === 'HOME_OFFICE' ||
    value === 'BUSINESS_MILEAGE' ||
    value === 'CHARITABLE_CASH' ||
    value === 'CHARITABLE_NON_CASH' ||
    value === 'MEDICAL' ||
    value === 'EDUCATION' ||
    value === 'STATE_LOCAL_TAX' ||
    value === 'RETIREMENT_CONTRIBUTION' ||
    value === 'INVESTMENT_TAX' ||
    value === 'PERSONAL_NON_DEDUCTIBLE' ||
    value === 'REIMBURSABLE' ||
    value === 'CAPITALIZED_ASSET' ||
    value === 'REVIEW_NEEDED'
  );
}

function isKnownDeductibleStatus(value: string | undefined): value is DeductibleStatus {
  return (
    value === 'DEDUCTIBLE' ||
    value === 'PARTIALLY_DEDUCTIBLE' ||
    value === 'NON_DEDUCTIBLE' ||
    value === 'REIMBURSABLE' ||
    value === 'CAPITALIZED' ||
    value === 'REVIEW_NEEDED'
  );
}

function isKnownReceiptStatus(value: string | undefined): value is ReceiptStatus {
  return value === 'ATTACHED' || value === 'MISSING' || value === 'NOT_REQUIRED';
}

function receiptStatusFor(
  transaction: TaxTaggableTransaction,
  deductibleStatus: DeductibleStatus,
): ReceiptStatus {
  if (deductibleStatus === 'NON_DEDUCTIBLE' || transaction.type !== 'EXPENSE') {
    return 'NOT_REQUIRED';
  }

  return Math.abs(transaction.amountCents) >= APP_RECEIPT_REVIEW_THRESHOLD_CENTS
    ? 'MISSING'
    : 'NOT_REQUIRED';
}

function suggestionFromPriorRule(
  transaction: TaxTaggableTransaction,
  rules: readonly PriorTaxTagRule[],
): TaxCategorySuggestion | null {
  const payee = normalizeText(transaction.payee);
  const categoryName = normalizeText(transaction.categoryName);
  const rule = rules.find(
    (candidate) =>
      (candidate.payee !== undefined && normalizeText(candidate.payee) === payee) ||
      (candidate.categoryName !== undefined &&
        normalizeText(candidate.categoryName) === categoryName),
  );

  if (rule === undefined) return null;
  return {
    ...rule.suggestion,
    reason: 'Matched a prior tax classification rule for this payee or category.',
  };
}

/** Suggest a tax tag from transaction metadata and optional prior user choices. */
export function suggestTaxCategory(
  transaction: TaxTaggableTransaction,
  priorRules: readonly PriorTaxTagRule[] = [],
): TaxCategorySuggestion {
  const prior = suggestionFromPriorRule(transaction, priorRules);
  if (prior !== null) return prior;

  const haystack = `${normalizeText(transaction.categoryName)} ${normalizeText(transaction.payee)} ${normalizeText(
    transaction.memo,
  )}`;

  if (transaction.type === 'INCOME' && transaction.accountPurpose !== 'personal') {
    return {
      category: 'SCHEDULE_C_INCOME',
      deductibleStatus: 'NON_DEDUCTIBLE',
      deductionPercent: 0,
      receiptStatus: 'NOT_REQUIRED',
      confidence: 0.8,
      reason: 'Business-purpose income is treated as Schedule C income for tax summaries.',
    };
  }

  if (transaction.type !== 'EXPENSE') {
    return {
      category: 'REVIEW_NEEDED',
      deductibleStatus: 'REVIEW_NEEDED',
      deductionPercent: 0,
      receiptStatus: 'NOT_REQUIRED',
      confidence: 0.2,
      reason: 'Transfers and non-expense transactions need manual tax review.',
    };
  }

  if (haystack.match(/meal|restaurant|coffee|lunch|dinner|catering/u)) {
    return {
      category: 'BUSINESS_MEALS',
      deductibleStatus: 'PARTIALLY_DEDUCTIBLE',
      deductionPercent: 50,
      receiptStatus: receiptStatusFor(transaction, 'PARTIALLY_DEDUCTIBLE'),
      confidence: 0.7,
      reason: 'Business meals commonly require partial-deduction review.',
    };
  }

  if (haystack.match(/office|software|subscription|supplies|internet|phone|hosting|domain/u)) {
    return {
      category: 'SCHEDULE_C_EXPENSE',
      deductibleStatus: 'DEDUCTIBLE',
      deductionPercent: 100,
      receiptStatus: receiptStatusFor(transaction, 'DEDUCTIBLE'),
      confidence: 0.75,
      reason: 'Category/payee resembles an ordinary business expense.',
    };
  }

  if (haystack.match(/home office|rent|utilities/u)) {
    return {
      category: 'HOME_OFFICE',
      deductibleStatus: 'REVIEW_NEEDED',
      deductionPercent: 0,
      receiptStatus: receiptStatusFor(transaction, 'REVIEW_NEEDED'),
      confidence: 0.55,
      reason: 'Home-office expenses require business-use percentage and method selection.',
    };
  }

  if (haystack.match(/mileage|parking|toll|rideshare|uber|lyft/u)) {
    return {
      category: 'BUSINESS_MILEAGE',
      deductibleStatus: 'REVIEW_NEEDED',
      deductionPercent: 0,
      receiptStatus: receiptStatusFor(transaction, 'REVIEW_NEEDED'),
      confidence: 0.55,
      reason: 'Vehicle expenses need mileage or actual-expense substantiation.',
    };
  }

  if (haystack.match(/donation|charity|church|nonprofit|goodwill/u)) {
    return {
      category: 'CHARITABLE_CASH',
      deductibleStatus: 'DEDUCTIBLE',
      deductionPercent: 100,
      receiptStatus: receiptStatusFor(transaction, 'DEDUCTIBLE'),
      confidence: 0.65,
      reason: 'Payee/category resembles a charitable contribution.',
    };
  }

  if (haystack.match(/medical|doctor|hospital|dental|pharmacy/u)) {
    return {
      category: 'MEDICAL',
      deductibleStatus: 'REVIEW_NEEDED',
      deductionPercent: 0,
      receiptStatus: receiptStatusFor(transaction, 'REVIEW_NEEDED'),
      confidence: 0.55,
      reason: 'Medical expenses are subject to AGI floor and itemization rules.',
    };
  }

  if (haystack.match(/reimburs|client billback/u)) {
    return {
      category: 'REIMBURSABLE',
      deductibleStatus: 'REIMBURSABLE',
      deductionPercent: 0,
      receiptStatus: receiptStatusFor(transaction, 'REIMBURSABLE'),
      confidence: 0.7,
      reason: 'Transaction appears reimbursable and should be separated from deductions.',
    };
  }

  if (transaction.accountPurpose === 'business' || transaction.accountPurpose === 'both') {
    return {
      category: 'REVIEW_NEEDED',
      deductibleStatus: 'REVIEW_NEEDED',
      deductionPercent: 0,
      receiptStatus: receiptStatusFor(transaction, 'REVIEW_NEEDED'),
      confidence: 0.45,
      reason: 'Business-account expenses should be reviewed before tax reporting.',
    };
  }

  return {
    category: 'PERSONAL_NON_DEDUCTIBLE',
    deductibleStatus: 'NON_DEDUCTIBLE',
    deductionPercent: 0,
    receiptStatus: 'NOT_REQUIRED',
    confidence: 0.4,
    reason: 'No tax-significant signal was found; defaulting to personal non-deductible.',
  };
}

/** Build a TaxTag from existing transaction custom fields used by tax reserve flows. */
export function taxTagFromCustomFields(transaction: TaxTaggableTransaction): TaxTag | null {
  const fields = transaction.customFields ?? {};
  const category = fields['tax.category'];
  const deductibleStatus = fields['tax.deductibleStatus'];
  if (!isKnownTaxCategory(category) || !isKnownDeductibleStatus(deductibleStatus)) {
    return null;
  }

  const receiptStatus = isKnownReceiptStatus(fields['tax.receiptStatus'])
    ? fields['tax.receiptStatus']
    : receiptStatusFor(transaction, deductibleStatus);

  return {
    transactionId: transaction.id,
    taxYear: taxYearFromDate(transaction.date),
    category,
    deductibleStatus,
    deductionPercent: clampPercent(Number(fields['tax.deductionPercent'])),
    receiptStatus,
    businessPurposeNote: fields['tax.businessPurposeNote'],
    reimbursable: parseBoolean(fields['tax.reimbursable']),
    capitalized: parseBoolean(fields['tax.capitalized']),
  };
}

/** Build a normalized TaxTag from a transaction, preferring saved custom fields. */
export function buildTaxTag(
  transaction: TaxTaggableTransaction,
  priorRules: readonly PriorTaxTagRule[] = [],
): TaxTag {
  const saved = taxTagFromCustomFields(transaction);
  if (saved !== null) return saved;

  const suggestion = suggestTaxCategory(transaction, priorRules);
  return {
    transactionId: transaction.id,
    taxYear: taxYearFromDate(transaction.date),
    category: suggestion.category,
    deductibleStatus: suggestion.deductibleStatus,
    deductionPercent: suggestion.deductionPercent,
    receiptStatus: suggestion.receiptStatus,
    reimbursable: suggestion.deductibleStatus === 'REIMBURSABLE',
    capitalized: suggestion.deductibleStatus === 'CAPITALIZED',
  };
}

/** Calculate the deductible amount after status and percentage rules. */
export function calculateDeductibleAmountCents(
  transaction: Pick<TaxTaggableTransaction, 'amountCents' | 'type'>,
  tag: Pick<TaxTag, 'deductibleStatus' | 'deductionPercent'>,
): number {
  if (transaction.type !== 'EXPENSE') return 0;
  if (tag.deductibleStatus === 'DEDUCTIBLE') return Math.abs(Math.round(transaction.amountCents));
  if (tag.deductibleStatus !== 'PARTIALLY_DEDUCTIBLE') return 0;
  return Math.round(Math.abs(transaction.amountCents) * (clampPercent(tag.deductionPercent) / 100));
}

/** Apply tax tags and review flags to transactions. */
export function tagTaxTransactions(
  transactions: readonly TaxTaggableTransaction[],
  priorRules: readonly PriorTaxTagRule[] = [],
): TaggedTaxTransaction[] {
  return transactions.map((transaction) => {
    const tag = buildTaxTag(transaction, priorRules);
    const deductibleAmountCents = calculateDeductibleAmountCents(transaction, tag);
    return {
      transaction,
      tag,
      deductibleAmountCents,
      needsReview:
        tag.deductibleStatus === 'REVIEW_NEEDED' ||
        tag.receiptStatus === 'MISSING' ||
        tag.category === 'REVIEW_NEEDED',
    };
  });
}

/** Summarize tagged transactions by tax category for reports and filters. */
export function summarizeTaxCategories(
  transactions: readonly TaxTaggableTransaction[],
  taxYear: number,
  priorRules: readonly PriorTaxTagRule[] = [],
): TaxCategorySummary {
  const tagged = tagTaxTransactions(transactions, priorRules).filter(
    (item) => item.tag.taxYear === taxYear,
  );
  const rowMap = new Map<TaxCategory, TaxCategorySummaryRow>();
  const missingReceiptTransactionIds: string[] = [];
  const reviewTransactionIds: string[] = [];
  const uncategorizedTransactionIds: string[] = [];

  for (const item of tagged) {
    const current = rowMap.get(item.tag.category) ?? {
      category: item.tag.category,
      transactionCount: 0,
      grossAmountCents: 0,
      deductibleAmountCents: 0,
      missingReceiptCount: 0,
      reviewNeededCount: 0,
    };

    const missingReceiptCount = item.tag.receiptStatus === 'MISSING' ? 1 : 0;
    const reviewNeededCount = item.needsReview ? 1 : 0;
    if (missingReceiptCount > 0) missingReceiptTransactionIds.push(item.transaction.id);
    if (reviewNeededCount > 0) reviewTransactionIds.push(item.transaction.id);
    if (item.tag.category === 'REVIEW_NEEDED')
      uncategorizedTransactionIds.push(item.transaction.id);

    rowMap.set(item.tag.category, {
      ...current,
      transactionCount: current.transactionCount + 1,
      grossAmountCents:
        current.grossAmountCents + Math.abs(Math.round(item.transaction.amountCents)),
      deductibleAmountCents: current.deductibleAmountCents + item.deductibleAmountCents,
      missingReceiptCount: current.missingReceiptCount + missingReceiptCount,
      reviewNeededCount: current.reviewNeededCount + reviewNeededCount,
    });
  }

  const rows = [...rowMap.values()].sort((a, b) => a.category.localeCompare(b.category));
  return {
    taxYear,
    rows,
    totalDeductibleAmountCents: rows.reduce((sum, row) => sum + row.deductibleAmountCents, 0),
    missingReceiptTransactionIds,
    reviewTransactionIds,
    uncategorizedTransactionIds,
  };
}
