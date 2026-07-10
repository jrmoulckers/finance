// SPDX-License-Identifier: BUSL-1.1

import { ESTATE_CATEGORIES } from './categories';
import type {
  Beneficiary,
  EstateCategoryId,
  EstateCategoryValueSubtotal,
  EstateInventoryItem,
  EstateInventorySummary,
  EstateValueKind,
} from './types';

const ESTATE_INVENTORY_STORAGE_KEY = 'finance-estate-inventory-v1';

/**
 * How each estate category's recorded currency values contribute to the
 * estimated total. Assets add to the estate, liabilities subtract, and "other"
 * (e.g. insurance payouts, recurring subscription costs) is summarised but kept
 * out of the net figure so the headline number is not double-counted.
 */
const CATEGORY_VALUE_KIND: Record<EstateCategoryId, EstateValueKind> = {
  'bank-accounts': 'asset',
  investments: 'asset',
  'real-estate': 'asset',
  'digital-assets': 'asset',
  debts: 'liability',
  insurance: 'other',
  subscriptions: 'other',
  'important-contacts': 'other',
};

/** Currency-field keys per category, derived once from the category schema. */
const CURRENCY_FIELDS_BY_CATEGORY: Record<EstateCategoryId, readonly string[]> =
  ESTATE_CATEGORIES.reduce(
    (acc, category) => {
      acc[category.id] = category.fields
        .filter((field) => field.inputType === 'currency')
        .map((field) => field.key);
      return acc;
    },
    {} as Record<EstateCategoryId, string[]>,
  );

/**
 * Parses a free-text currency field to integer cents.
 *
 * Tolerates thousands separators, currency symbols and surrounding whitespace
 * (e.g. "$1,250.50" → 125050). Blank, non-numeric or negative inputs yield 0 so
 * mixed/partial data never corrupts the rollup.
 *
 * @param raw - Raw stored currency string.
 * @returns Non-negative integer cents.
 */
export function parseEstateCurrencyToCents(raw: string | undefined): number {
  if (typeof raw !== 'string') return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function getNowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readInventoryStore(): EstateInventoryItem[] {
  if (!canUseLocalStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ESTATE_INVENTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeInventoryItem).sort(sortByNewestFirst);
  } catch {
    return [];
  }
}

function writeInventoryStore(items: readonly EstateInventoryItem[]): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(ESTATE_INVENTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Best-effort persistence only.
  }
}

function normalizeBeneficiary(value: unknown): Beneficiary {
  const beneficiary = (value ?? {}) as Partial<Beneficiary>;
  return {
    id:
      typeof beneficiary.id === 'string' && beneficiary.id.trim()
        ? beneficiary.id
        : generateId('beneficiary'),
    name: typeof beneficiary.name === 'string' ? beneficiary.name : '',
    relationship: typeof beneficiary.relationship === 'string' ? beneficiary.relationship : '',
    sharePercent: typeof beneficiary.sharePercent === 'string' ? beneficiary.sharePercent : '',
    notes: typeof beneficiary.notes === 'string' ? beneficiary.notes : '',
  };
}

export function normalizeInventoryItem(value: Partial<EstateInventoryItem>): EstateInventoryItem {
  const createdAt =
    typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : getNowIso();
  const updatedAt =
    typeof value.updatedAt === 'string' && value.updatedAt ? value.updatedAt : createdAt;

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : generateId('estate-item'),
    categoryId: (value.categoryId ?? 'bank-accounts') as EstateCategoryId,
    details:
      value.details && typeof value.details === 'object' && !Array.isArray(value.details)
        ? Object.fromEntries(
            Object.entries(value.details).map(([key, detailValue]) => [
              key,
              typeof detailValue === 'string' ? detailValue : String(detailValue ?? ''),
            ]),
          )
        : {},
    beneficiaries: Array.isArray(value.beneficiaries)
      ? value.beneficiaries.map(normalizeBeneficiary)
      : [],
    notes: typeof value.notes === 'string' ? value.notes : '',
    documentLocation: typeof value.documentLocation === 'string' ? value.documentLocation : '',
    lastVerifiedAt: typeof value.lastVerifiedAt === 'string' ? value.lastVerifiedAt : '',
    createdAt,
    updatedAt,
  };
}

function sortByNewestFirst(left: EstateInventoryItem, right: EstateInventoryItem): number {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

export function createEmptyBeneficiary(): Beneficiary {
  return {
    id: generateId('beneficiary'),
    name: '',
    relationship: '',
    sharePercent: '',
    notes: '',
  };
}

export function createEmptyInventoryItem(categoryId: EstateCategoryId): EstateInventoryItem {
  const now = getNowIso();
  return {
    id: generateId('estate-item'),
    categoryId,
    details: {},
    beneficiaries: [],
    notes: '',
    documentLocation: '',
    lastVerifiedAt: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function listInventoryItems(): EstateInventoryItem[] {
  return readInventoryStore();
}

export function getInventoryItemsByCategory(categoryId: EstateCategoryId): EstateInventoryItem[] {
  return listInventoryItems().filter((item) => item.categoryId === categoryId);
}

export function saveInventoryItem(item: EstateInventoryItem): EstateInventoryItem {
  const normalized = normalizeInventoryItem({
    ...item,
    updatedAt: getNowIso(),
    createdAt: item.createdAt,
  });
  const existingItems = readInventoryStore().filter((entry) => entry.id !== normalized.id);
  const nextItems = [...existingItems, normalized].sort(sortByNewestFirst);
  writeInventoryStore(nextItems);
  return normalized;
}

export function deleteInventoryItem(itemId: string): void {
  writeInventoryStore(readInventoryStore().filter((item) => item.id !== itemId));
}

export function summarizeInventory(
  items: readonly EstateInventoryItem[] = listInventoryItems(),
): EstateInventorySummary {
  const documentedCategories = ESTATE_CATEGORIES.filter((category) =>
    items.some((item) => item.categoryId === category.id),
  ).map((category) => category.id);

  // Roll up parsed currency fields per category (integer cents).
  const subtotalByCategory = new Map<EstateCategoryId, number>();
  let hasEstimatedValue = false;
  for (const item of items) {
    const currencyKeys = CURRENCY_FIELDS_BY_CATEGORY[item.categoryId] ?? [];
    if (currencyKeys.length === 0) continue;
    let itemCents = 0;
    for (const key of currencyKeys) {
      const cents = parseEstateCurrencyToCents(item.details[key]);
      if (cents > 0) hasEstimatedValue = true;
      itemCents += cents;
    }
    subtotalByCategory.set(
      item.categoryId,
      (subtotalByCategory.get(item.categoryId) ?? 0) + itemCents,
    );
  }

  const categoryValueSubtotals: EstateCategoryValueSubtotal[] = [];
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  for (const category of ESTATE_CATEGORIES) {
    const totalCents = subtotalByCategory.get(category.id) ?? 0;
    if (totalCents === 0) continue;
    const kind = CATEGORY_VALUE_KIND[category.id];
    categoryValueSubtotals.push({ categoryId: category.id, kind, totalCents });
    if (kind === 'asset') totalAssetsCents += totalCents;
    else if (kind === 'liability') totalLiabilitiesCents += totalCents;
  }

  return {
    totalItems: items.length,
    documentedCategories,
    missingCategories: ESTATE_CATEGORIES.map((category) => category.id).filter(
      (categoryId) => !documentedCategories.includes(categoryId),
    ),
    itemsMissingDocuments: items.filter((item) => !item.documentLocation.trim()).length,
    itemsMissingVerification: items.filter((item) => !item.lastVerifiedAt.trim()).length,
    totalAssetsCents,
    totalLiabilitiesCents,
    netEstimatedValueCents: totalAssetsCents - totalLiabilitiesCents,
    categoryValueSubtotals,
    hasEstimatedValue,
  };
}

export { ESTATE_INVENTORY_STORAGE_KEY };
