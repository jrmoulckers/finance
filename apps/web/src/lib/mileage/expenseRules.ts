// SPDX-License-Identifier: BUSL-1.1

import type {
  BusinessExpenseMetadata,
  BusinessExpenseSource,
  ExpenseCategory,
  ExpenseClassification,
  ExpenseTransactionInput,
} from './types';

export const BUSINESS_EXPENSE_TAG = 'business-expense';
export const BUSINESS_EXPENSE_FIELDS = {
  category: 'businessExpenseCategory',
  businessUsePercent: 'businessExpensePercent',
  deductiblePercent: 'businessExpenseDeductionPercent',
  note: 'businessExpenseNote',
  source: 'businessExpenseSource',
  taggedAt: 'businessExpenseTaggedAt',
} as const;

export const EXPENSE_CATEGORY_RULES: Record<
  ExpenseCategory,
  {
    label: string;
    deductiblePercent: number;
    keywords: readonly string[];
    description: string;
  }
> = {
  travel: {
    label: 'Travel',
    deductiblePercent: 100,
    keywords: ['travel', 'hotel', 'airfare', 'flight', 'parking', 'toll', 'uber', 'lyft'],
    description: 'Business trips, lodging, parking, tolls, and other travel costs.',
  },
  meals: {
    label: 'Meals (50%)',
    deductiblePercent: 50,
    keywords: ['meal', 'restaurant', 'coffee', 'lunch', 'dinner', 'catering', 'cafe'],
    description: 'Business meals are typically only 50% deductible.',
  },
  equipment: {
    label: 'Equipment',
    deductiblePercent: 100,
    keywords: ['equipment', 'computer', 'laptop', 'monitor', 'printer', 'office depot'],
    description: 'Work equipment, devices, and office hardware.',
  },
  'home-office': {
    label: 'Home Office',
    deductiblePercent: 100,
    keywords: ['home office', 'internet', 'utilities', 'rent', 'desk', 'chair'],
    description: 'Dedicated workspace expenses and home office overhead.',
  },
  'professional-services': {
    label: 'Professional Services',
    deductiblePercent: 100,
    keywords: ['accounting', 'bookkeeping', 'legal', 'consulting', 'payroll', 'tax prep'],
    description: 'Professional fees for legal, accounting, and other services.',
  },
  subscriptions: {
    label: 'Subscriptions',
    deductiblePercent: 100,
    keywords: ['subscription', 'saas', 'software', 'adobe', 'github', 'notion', 'zoom'],
    description: 'Recurring software and business service subscriptions.',
  },
};

const EXPENSE_CATEGORY_ORDER = Object.keys(EXPENSE_CATEGORY_RULES) as ExpenseCategory[];

function normalizePercent(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return 100;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function parsePercent(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? normalizePercent(parsed) : null;
}

function parseExpenseCategory(raw: string | undefined): ExpenseCategory | null {
  if (!raw) {
    return null;
  }

  return EXPENSE_CATEGORY_ORDER.includes(raw as ExpenseCategory) ? (raw as ExpenseCategory) : null;
}

function normalizeText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .toLowerCase();
}

function withUniqueTags(tags: readonly string[], tag: string): string[] {
  return Array.from(new Set([...tags, tag]));
}

export function getExpenseCategoryLabel(category: ExpenseCategory): string {
  return EXPENSE_CATEGORY_RULES[category].label;
}

export function getDeductiblePercentForCategory(category: ExpenseCategory): number {
  return EXPENSE_CATEGORY_RULES[category].deductiblePercent;
}

export function getExpenseCategoryOptions(): Array<{
  value: ExpenseCategory;
  label: string;
  deductiblePercent: number;
  description: string;
}> {
  return EXPENSE_CATEGORY_ORDER.map((category) => ({
    value: category,
    label: getExpenseCategoryLabel(category),
    deductiblePercent: getDeductiblePercentForCategory(category),
    description: EXPENSE_CATEGORY_RULES[category].description,
  }));
}

export function inferExpenseCategory(
  transaction: Pick<ExpenseTransactionInput, 'payee' | 'note' | 'tags' | 'categoryName'>,
): ExpenseCategory | null {
  const normalizedText = normalizeText([
    transaction.payee,
    transaction.note,
    transaction.categoryName,
    transaction.tags.join(' '),
  ]);

  if (normalizedText.length === 0) {
    return null;
  }

  let bestMatch: { category: ExpenseCategory; score: number } | null = null;
  for (const category of EXPENSE_CATEGORY_ORDER) {
    const score = EXPENSE_CATEGORY_RULES[category].keywords.reduce((total, keyword) => {
      return total + (normalizedText.includes(keyword) ? 1 : 0);
    }, 0);

    if (score > 0 && (bestMatch === null || score > bestMatch.score)) {
      bestMatch = { category, score };
    }
  }

  return bestMatch?.category ?? null;
}

export function parseBusinessExpenseMetadata(
  transaction: Pick<
    ExpenseTransactionInput,
    'tags' | 'customFields' | 'payee' | 'note' | 'categoryName'
  >,
): BusinessExpenseMetadata | null {
  const customFields = transaction.customFields ?? {};
  const storedCategory = parseExpenseCategory(customFields[BUSINESS_EXPENSE_FIELDS.category]);
  const category = storedCategory ?? inferExpenseCategory(transaction);
  const hasBusinessFlag =
    transaction.tags.includes(BUSINESS_EXPENSE_TAG) ||
    customFields[BUSINESS_EXPENSE_FIELDS.category] !== undefined;

  if (!hasBusinessFlag || category === null) {
    return null;
  }

  const deductiblePercent =
    parsePercent(customFields[BUSINESS_EXPENSE_FIELDS.deductiblePercent]) ??
    getDeductiblePercentForCategory(category);

  return {
    category,
    businessUsePercent:
      parsePercent(customFields[BUSINESS_EXPENSE_FIELDS.businessUsePercent]) ?? 100,
    deductiblePercent,
    note: customFields[BUSINESS_EXPENSE_FIELDS.note] ?? '',
    source:
      (customFields[BUSINESS_EXPENSE_FIELDS.source] as BusinessExpenseSource | undefined) ??
      'manual',
    taggedAt: customFields[BUSINESS_EXPENSE_FIELDS.taggedAt] ?? '',
  };
}

export function getBusinessExpenseDefaults(
  transaction: Pick<
    ExpenseTransactionInput,
    'payee' | 'note' | 'tags' | 'customFields' | 'categoryName'
  >,
): BusinessExpenseMetadata {
  const existing = parseBusinessExpenseMetadata(transaction);
  if (existing !== null) {
    return existing;
  }

  const inferredCategory = inferExpenseCategory(transaction) ?? 'travel';
  return {
    category: inferredCategory,
    businessUsePercent: 100,
    deductiblePercent: getDeductiblePercentForCategory(inferredCategory),
    note: '',
    source: 'rule',
    taggedAt: '',
  };
}

export function buildBusinessExpenseUpdate(
  transaction: Pick<
    ExpenseTransactionInput,
    'tags' | 'customFields' | 'payee' | 'note' | 'categoryName'
  >,
  input: {
    enabled: boolean;
    category?: ExpenseCategory;
    businessUsePercent?: number;
    deductiblePercent?: number;
    note?: string;
    source?: BusinessExpenseSource;
  },
): { tags: string[]; customFields: Record<string, string> | null } {
  const nextTags = new Set(transaction.tags);
  const nextCustomFields: Record<string, string> = { ...(transaction.customFields ?? {}) };

  if (!input.enabled) {
    nextTags.delete(BUSINESS_EXPENSE_TAG);
    for (const fieldKey of Object.values(BUSINESS_EXPENSE_FIELDS)) {
      delete nextCustomFields[fieldKey];
    }

    return {
      tags: Array.from(nextTags),
      customFields: Object.keys(nextCustomFields).length > 0 ? nextCustomFields : null,
    };
  }

  const defaults = getBusinessExpenseDefaults(transaction);
  const category = input.category ?? defaults.category;
  const deductiblePercent = input.deductiblePercent ?? getDeductiblePercentForCategory(category);
  const normalizedNote = input.note?.trim() ?? '';

  nextCustomFields[BUSINESS_EXPENSE_FIELDS.category] = category;
  nextCustomFields[BUSINESS_EXPENSE_FIELDS.businessUsePercent] = String(
    normalizePercent(input.businessUsePercent ?? defaults.businessUsePercent),
  );
  nextCustomFields[BUSINESS_EXPENSE_FIELDS.deductiblePercent] = String(
    normalizePercent(deductiblePercent),
  );
  nextCustomFields[BUSINESS_EXPENSE_FIELDS.source] = input.source ?? 'manual';
  nextCustomFields[BUSINESS_EXPENSE_FIELDS.taggedAt] = new Date().toISOString();

  if (normalizedNote.length > 0) {
    nextCustomFields[BUSINESS_EXPENSE_FIELDS.note] = normalizedNote;
  } else {
    delete nextCustomFields[BUSINESS_EXPENSE_FIELDS.note];
  }

  return {
    tags: withUniqueTags(transaction.tags, BUSINESS_EXPENSE_TAG),
    customFields: nextCustomFields,
  };
}

export function isBusinessExpenseTransaction(
  transaction: Pick<
    ExpenseTransactionInput,
    'tags' | 'customFields' | 'payee' | 'note' | 'categoryName'
  >,
): boolean {
  return parseBusinessExpenseMetadata(transaction) !== null;
}

export function classifyBusinessExpense(
  transaction: ExpenseTransactionInput,
): ExpenseClassification | null {
  if (transaction.type !== 'EXPENSE') {
    return null;
  }

  const metadata = parseBusinessExpenseMetadata(transaction);
  if (metadata === null) {
    return null;
  }

  const amountCents = Math.abs(transaction.amountCents);
  const deductibleAmountCents = Math.round(
    amountCents * (metadata.businessUsePercent / 100) * (metadata.deductiblePercent / 100),
  );

  return {
    transactionId: transaction.id,
    date: transaction.date,
    payee: transaction.payee?.trim() || transaction.note?.trim() || 'Business expense',
    amountCents,
    deductibleAmountCents,
    deductionType: 'business-expense',
    categoryLabel: getExpenseCategoryLabel(metadata.category),
    ...metadata,
  };
}
