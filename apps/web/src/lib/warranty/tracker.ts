// SPDX-License-Identifier: BUSL-1.1

import { useMemo, useSyncExternalStore } from 'react';
import type { SyncId, Transaction } from '../../kmp/bridge';
import type { WarrantyEntry, WarrantyEntryDraft } from './types';

const STORAGE_KEY = 'finance-warranty-entries-v1';
const STORAGE_EVENT = 'finance:warranty-entries-changed';
const EMPTY_SNAPSHOT = '[]';

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEntry(entry: Partial<WarrantyEntry>): WarrantyEntry | null {
  if (
    !entry.id ||
    !entry.transactionId ||
    !entry.itemName ||
    !entry.purchaseDate ||
    typeof entry.amountCents !== 'number' ||
    !entry.currencyCode ||
    !entry.createdAt ||
    !entry.updatedAt
  ) {
    return null;
  }

  return {
    id: entry.id,
    transactionId: entry.transactionId,
    merchantName: normalizeOptionalString(entry.merchantName),
    itemName: entry.itemName,
    purchaseDate: entry.purchaseDate,
    amountCents: entry.amountCents,
    currencyCode: entry.currencyCode,
    warrantyExpiryDate: entry.warrantyExpiryDate ?? null,
    returnWindowEndDate: entry.returnWindowEndDate ?? null,
    receiptPhotoUrl: normalizeOptionalString(entry.receiptPhotoUrl),
    notes: normalizeOptionalString(entry.notes),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function parseEntries(snapshot: string): WarrantyEntry[] {
  try {
    const parsed = JSON.parse(snapshot) as Partial<WarrantyEntry>[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is WarrantyEntry => entry !== null)
      .sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));
  } catch {
    return [];
  }
}

function getStorageSnapshot(): string {
  if (typeof window === 'undefined') {
    return EMPTY_SNAPSHOT;
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
}

function emitWarrantyChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }
}

function writeEntries(entries: readonly WarrantyEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  emitWarrantyChange();
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };
  const handleLocalChange = () => callback();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(STORAGE_EVENT, handleLocalChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(STORAGE_EVENT, handleLocalChange);
  };
}

function resolveTransactionLabel(transaction: Transaction): string {
  return (
    transaction.note?.trim() ||
    transaction.payee?.trim() ||
    transaction.counterpartyName?.trim() ||
    'Transaction'
  );
}

export function loadWarrantyEntries(): WarrantyEntry[] {
  return parseEntries(getStorageSnapshot());
}

export function getWarrantyEntry(transactionId: SyncId): WarrantyEntry | null {
  return loadWarrantyEntries().find((entry) => entry.transactionId === transactionId) ?? null;
}

export function buildWarrantyDraftFromTransaction(
  transaction: Transaction,
  overrides: Partial<WarrantyEntryDraft> = {},
): WarrantyEntryDraft {
  return {
    transactionId: transaction.id,
    merchantName: transaction.payee?.trim() || transaction.counterpartyName?.trim() || null,
    itemName: resolveTransactionLabel(transaction),
    purchaseDate: transaction.date,
    amountCents: Math.abs(transaction.amount.amount),
    currencyCode: transaction.currency.code,
    warrantyExpiryDate: null,
    returnWindowEndDate: null,
    receiptPhotoUrl: null,
    notes: null,
    ...overrides,
  };
}

export function saveWarrantyEntry(draft: WarrantyEntryDraft): WarrantyEntry {
  const existingEntries = loadWarrantyEntries();
  const existingEntry = existingEntries.find(
    (entry) => entry.transactionId === draft.transactionId,
  );
  const now = new Date().toISOString();

  const nextEntry: WarrantyEntry = {
    id: existingEntry?.id ?? crypto.randomUUID(),
    transactionId: draft.transactionId,
    merchantName: normalizeOptionalString(draft.merchantName),
    itemName: draft.itemName.trim(),
    purchaseDate: draft.purchaseDate,
    amountCents: draft.amountCents,
    currencyCode: draft.currencyCode,
    warrantyExpiryDate: draft.warrantyExpiryDate ?? null,
    returnWindowEndDate: draft.returnWindowEndDate ?? null,
    receiptPhotoUrl: normalizeOptionalString(draft.receiptPhotoUrl),
    notes: normalizeOptionalString(draft.notes),
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
  };

  writeEntries([
    nextEntry,
    ...existingEntries.filter((entry) => entry.transactionId !== draft.transactionId),
  ]);

  return nextEntry;
}

export function deleteWarrantyEntry(transactionId: SyncId): boolean {
  const existingEntries = loadWarrantyEntries();
  const remainingEntries = existingEntries.filter((entry) => entry.transactionId !== transactionId);

  if (remainingEntries.length === existingEntries.length) {
    return false;
  }

  writeEntries(remainingEntries);
  return true;
}

export function clearWarrantyEntries(): void {
  writeEntries([]);
}

export function useWarrantyEntries(): WarrantyEntry[] {
  const snapshot = useSyncExternalStore(subscribe, getStorageSnapshot, () => EMPTY_SNAPSHOT);
  return useMemo(() => parseEntries(snapshot), [snapshot]);
}

export function useWarrantyEntry(transactionId: SyncId): WarrantyEntry | null {
  const entries = useWarrantyEntries();
  return useMemo(
    () => entries.find((entry) => entry.transactionId === transactionId) ?? null,
    [entries, transactionId],
  );
}
