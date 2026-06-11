// SPDX-License-Identifier: BUSL-1.1

import { ESTATE_CATEGORIES } from './categories';
import type {
  Beneficiary,
  EstateCategoryId,
  EstateInventoryItem,
  EstateInventorySummary,
} from './types';

const ESTATE_INVENTORY_STORAGE_KEY = 'finance-estate-inventory-v1';

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

  return {
    totalItems: items.length,
    documentedCategories,
    missingCategories: ESTATE_CATEGORIES.map((category) => category.id).filter(
      (categoryId) => !documentedCategories.includes(categoryId),
    ),
    itemsMissingDocuments: items.filter((item) => !item.documentLocation.trim()).length,
    itemsMissingVerification: items.filter((item) => !item.lastVerifiedAt.trim()).length,
  };
}

export { ESTATE_INVENTORY_STORAGE_KEY };
