// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for bulk transaction editing.
 *
 * Manages selection state for multiple transactions and provides
 * bulk operations: update category, update tags, and bulk delete.
 *
 * Usage:
 * ```tsx
 * const { selectedIds, toggleSelection, selectAll, clearSelection,
 *         bulkUpdateCategory, bulkDelete, selectionCount } = useBulkTransactions(transactions);
 * ```
 *
 * References: issue #318
 */

import { useCallback, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  updateTransaction as repoUpdateTransaction,
  deleteTransaction as repoDeleteTransaction,
} from '../db/repositories/transactions';
import type { SyncId, Transaction, TransactionType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields that can be bulk-updated across selected transactions. */
export interface BulkUpdateFields {
  categoryId?: SyncId | null;
  tags?: readonly string[];
  type?: TransactionType;
  status?: 'PENDING' | 'CLEARED' | 'RECONCILED' | 'VOID';
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
  /** Number of selected transactions. */
  selectionCount: number;
  /** Whether bulk mode is active (any selections exist). */
  isBulkMode: boolean;
  /** Toggle selection for a single transaction. */
  toggleSelection: (transactionId: SyncId) => void;
  /** Select all provided transactions. */
  selectAll: () => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Check if a transaction is selected. */
  isSelected: (transactionId: SyncId) => boolean;
  /** Bulk update fields on all selected transactions. */
  bulkUpdate: (fields: BulkUpdateFields) => BulkOperationResult;
  /** Bulk soft-delete all selected transactions. */
  bulkDelete: () => BulkOperationResult;
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

  const selectionCount = selectedIds.size;
  const isBulkMode = selectionCount > 0;

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
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(transactions.map((t) => t.id)));
  }, [transactions]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (transactionId: SyncId) => selectedIds.has(transactionId),
    [selectedIds],
  );

  const bulkUpdate = useCallback(
    (fields: BulkUpdateFields): BulkOperationResult => {
      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];

      for (const txId of selectedIds) {
        try {
          const result = repoUpdateTransaction(db, txId, {
            categoryId: fields.categoryId,
            tags: fields.tags,
            type: fields.type,
            status: fields.status,
          });
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
      onComplete?.();

      return { successCount, failureCount, errors };
    },
    [db, selectedIds, onComplete],
  );

  const bulkDelete = useCallback((): BulkOperationResult => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const txId of selectedIds) {
      try {
        const deleted = repoDeleteTransaction(db, txId);
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
    onComplete?.();

    return { successCount, failureCount, errors };
  }, [db, selectedIds, onComplete]);

  // Memoize the read-only view of selected IDs.
  const readonlySelectedIds = useMemo(() => selectedIds as ReadonlySet<SyncId>, [selectedIds]);

  return {
    selectedIds: readonlySelectedIds,
    selectionCount,
    isBulkMode,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    bulkUpdate,
    bulkDelete,
  };
}
