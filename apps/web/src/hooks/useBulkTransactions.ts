// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for bulk transaction editing.
 *
 * Manages selection state for multiple transactions and provides
 * bulk operations: update category/status, update tags, and bulk delete.
 *
 * Usage:
 * ```tsx
 * const { selectedIds, toggleSelection, selectAll, clearSelection,
 *         bulkUpdate, bulkDelete, selectionCount } = useBulkTransactions(transactions);
 * ```
 *
 * References: issues #318, #2197
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  updateTransaction as repoUpdateTransaction,
  deleteTransaction as repoDeleteTransaction,
} from '../db/repositories/transactions';
import type { SyncId, Transaction, TransactionStatus, TransactionType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields that can be bulk-updated across selected transactions. */
export interface BulkUpdateFields {
  categoryId?: SyncId | null;
  tags?: readonly string[];
  type?: TransactionType;
  status?: TransactionStatus;
}

/** Result of a bulk operation. */
export interface BulkOperationResult {
  /** Number of transactions successfully modified. */
  successCount: number;
  /** Number of transactions that failed. */
  failureCount: number;
  /** Error messages from failed operations. */
  errors: string[];
}

/** Shape returned by {@link useBulkTransactions}. */
export interface UseBulkTransactionsResult {
  /** Set of currently selected transaction IDs. */
  selectedIds: ReadonlySet<SyncId>;
  /** Selected transaction records from the current transaction list. */
  selectedTransactions: Transaction[];
  /** Number of selected transactions. */
  selectionCount: number;
  /** Whether bulk mode is active (any selections exist). */
  isBulkMode: boolean;
  /** Toggle selection for a single transaction. */
  toggleSelection: (transactionId: SyncId) => void;
  /** Explicitly set selection for a single transaction. */
  setSelection: (transactionId: SyncId, selected: boolean) => void;
  /** Select/deselect a range from the previous anchor to this transaction. */
  selectRange: (transactionId: SyncId, selected?: boolean) => void;
  /** Select all provided transactions. */
  selectAll: () => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Check if a transaction is selected. */
  isSelected: (transactionId: SyncId) => boolean;
  /** Bulk update fields on all selected transactions. */
  bulkUpdate: (fields: BulkUpdateFields) => Promise<BulkOperationResult>;
  /** Add a tag to all selected transactions while preserving their existing tags. */
  bulkAddTag: (tag: string) => Promise<BulkOperationResult>;
  /** Remove a tag from all selected transactions while preserving other tags. */
  bulkRemoveTag: (tag: string) => Promise<BulkOperationResult>;
  /** Bulk mark all selected transactions with a new status. */
  bulkMarkStatus: (status: TransactionStatus) => Promise<BulkOperationResult>;
  /** Bulk soft-delete all selected transactions. */
  bulkDelete: () => Promise<BulkOperationResult>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBulkTransactions(
  transactions: Transaction[],
  onComplete?: () => void,
): UseBulkTransactionsResult {
  const db = useDatabase();
  const [selectedIds, setSelectedIds] = useState<Set<SyncId>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<SyncId | null>(null);

  const transactionIds = useMemo(
    () => transactions.map((transaction) => transaction.id),
    [transactions],
  );
  const transactionById = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );

  useEffect(() => {
    const visibleIds = new Set(transactionIds);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((transactionId) => visibleIds.has(transactionId)));
      return next.size === prev.size ? prev : next;
    });
    setLastSelectedId((prev) => (prev !== null && visibleIds.has(prev) ? prev : null));
  }, [transactionIds]);

  const selectedTransactions = useMemo(
    () => transactions.filter((transaction) => selectedIds.has(transaction.id)),
    [transactions, selectedIds],
  );

  useEffect(() => {
    const visibleTransactionIds = new Set(transactions.map((transaction) => transaction.id));
    setSelectedIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((transactionId) => visibleTransactionIds.has(transactionId)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [transactions]);

  const selectionCount = selectedIds.size;
  const isBulkMode = selectionCount > 0;

  const setSelection = useCallback((transactionId: SyncId, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return next;
    });
    setLastSelectedId(transactionId);
  }, []);

  const toggleSelection = useCallback((transactionId: SyncId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
    setLastSelectedId(transactionId);
  }, []);

  const selectRange = useCallback(
    (transactionId: SyncId, selected = true) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const startIndex = lastSelectedId ? transactionIds.indexOf(lastSelectedId) : -1;
        const endIndex = transactionIds.indexOf(transactionId);
        if (startIndex === -1 || endIndex === -1) {
          if (selected) {
            next.add(transactionId);
          } else {
            next.delete(transactionId);
          }
          return next;
        }

        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        for (const id of transactionIds.slice(from, to + 1)) {
          if (selected) {
            next.add(id);
          } else {
            next.delete(id);
          }
        }
        return next;
      });
      setLastSelectedId(transactionId);
    },
    [lastSelectedId, transactionIds],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(transactionIds));
    setLastSelectedId(transactionIds.length > 0 ? transactionIds[transactionIds.length - 1] : null);
  }, [transactionIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const isSelected = useCallback(
    (transactionId: SyncId) => selectedIds.has(transactionId),
    [selectedIds],
  );

  const updateSelectedTransactions = useCallback(
    async (
      getFields: (transaction: Transaction) => BulkUpdateFields,
    ): Promise<BulkOperationResult> => {
      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];

      for (const txId of selectedIds) {
        const transaction = transactionById.get(txId);
        if (!transaction) {
          failureCount++;
          errors.push(`Transaction ${txId}: not found or not visible`);
          continue;
        }

        try {
          const result = await repoUpdateTransaction(db, txId, getFields(transaction));
          if (result) {
            successCount++;
          } else {
            failureCount++;
            errors.push(`Transaction ${txId}: not found or already deleted`);
          }
        } catch (err) {
          failureCount++;
          errors.push(
            `Transaction ${txId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      }

      setSelectedIds(new Set());
      setLastSelectedId(null);
      onComplete?.();

      return { successCount, failureCount, errors };
    },
    [db, selectedIds, transactionById, onComplete],
  );

  const bulkUpdate = useCallback(
    (fields: BulkUpdateFields): Promise<BulkOperationResult> =>
      updateSelectedTransactions(() => fields),
    [updateSelectedTransactions],
  );

  const bulkAddTag = useCallback(
    async (tag: string): Promise<BulkOperationResult> => {
      const normalizedTag = tag.trim();
      if (!normalizedTag) {
        return { successCount: 0, failureCount: selectionCount, errors: ['Tag is required'] };
      }

      return updateSelectedTransactions((transaction) => ({
        tags: Array.from(new Set([...(transaction.tags ?? []), normalizedTag])),
      }));
    },
    [selectionCount, updateSelectedTransactions],
  );

  const bulkRemoveTag = useCallback(
    async (tag: string): Promise<BulkOperationResult> => {
      const normalizedTag = tag.trim();
      if (!normalizedTag) {
        return { successCount: 0, failureCount: selectionCount, errors: ['Tag is required'] };
      }

      return updateSelectedTransactions((transaction) => ({
        tags: (transaction.tags ?? []).filter((existingTag) => existingTag !== normalizedTag),
      }));
    },
    [selectionCount, updateSelectedTransactions],
  );

  const bulkMarkStatus = useCallback(
    (status: TransactionStatus): Promise<BulkOperationResult> => bulkUpdate({ status }),
    [bulkUpdate],
  );

  const bulkDelete = useCallback(async (): Promise<BulkOperationResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const txId of selectedIds) {
      try {
        const deleted = await repoDeleteTransaction(db, txId);
        if (deleted) {
          successCount++;
        } else {
          failureCount++;
          errors.push(`Transaction ${txId}: not found or already deleted`);
        }
      } catch (err) {
        failureCount++;
        errors.push(`Transaction ${txId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setSelectedIds(new Set());
    setLastSelectedId(null);
    onComplete?.();

    return { successCount, failureCount, errors };
  }, [db, selectedIds, onComplete]);

  const readonlySelectedIds = useMemo(() => selectedIds as ReadonlySet<SyncId>, [selectedIds]);

  return {
    selectedIds: readonlySelectedIds,
    selectedTransactions,
    selectionCount,
    isBulkMode,
    toggleSelection,
    setSelection,
    selectRange,
    selectAll,
    clearSelection,
    isSelected,
    bulkUpdate,
    bulkAddTag,
    bulkRemoveTag,
    bulkMarkStatus,
    bulkDelete,
  };
}
