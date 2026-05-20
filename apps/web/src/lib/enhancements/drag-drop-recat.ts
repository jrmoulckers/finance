/**
 * Drag-and-drop recategorization in transaction workflows.
 * Closes #1764.
 * @module enhancements/drag-drop-recat
 */

import type { DragDropOperation, CategoryDropZone } from './types';

/**
 * Create a category drop zone descriptor.
 * @param categoryId - Category identifier
 * @param categoryName - Display name
 * @param acceptsTransactions - Whether this zone accepts drops
 * @returns A CategoryDropZone
 */
export function createDropZone(
  categoryId: string,
  categoryName: string,
  acceptsTransactions: boolean = true,
): CategoryDropZone {
  return { categoryId, categoryName, acceptsTransactions };
}

/**
 * Create a drag-drop recategorization operation.
 * @param id - Unique operation ID
 * @param transactionIds - IDs of transactions being moved
 * @param fromCategoryId - Source category
 * @param toCategoryId - Target category
 * @param timestamp - ISO-8601 timestamp
 * @returns A DragDropOperation record
 */
export function createDragDropOperation(
  id: string,
  transactionIds: readonly string[],
  fromCategoryId: string,
  toCategoryId: string,
  timestamp: string,
): DragDropOperation {
  return {
    id,
    transactionIds,
    fromCategoryId,
    toCategoryId,
    timestamp,
    undone: false,
  };
}

/**
 * Validate that a drop target accepts transactions and differs from source.
 * @param fromCategoryId - Source category
 * @param target - Target drop zone
 * @returns `true` if the drop is valid
 */
export function isValidDrop(fromCategoryId: string, target: CategoryDropZone): boolean {
  return target.acceptsTransactions && target.categoryId !== fromCategoryId;
}

/**
 * Mark a drag-drop operation as undone.
 * @param operation - The operation to undo
 * @returns Updated operation with undone flag set
 */
export function undoOperation(operation: DragDropOperation): DragDropOperation {
  return { ...operation, undone: true };
}

/**
 * Create a batch recategorization from a single drag-drop.
 * Splits a multi-transaction drag into individual operations sharing the same timestamp.
 * @param baseId - Base ID prefix
 * @param transactionIds - Transaction IDs to recategorize
 * @param fromCategoryId - Source category
 * @param toCategoryId - Target category
 * @param timestamp - ISO-8601 timestamp
 * @returns Array of individual operations (one per transaction) plus the batch operation
 */
export function createBatchRecategorization(
  baseId: string,
  transactionIds: readonly string[],
  fromCategoryId: string,
  toCategoryId: string,
  timestamp: string,
): readonly DragDropOperation[] {
  // Single batch operation covering all transactions
  return [createDragDropOperation(baseId, transactionIds, fromCategoryId, toCategoryId, timestamp)];
}

/**
 * Get the recategorization history, excluding undone operations.
 * @param operations - All operations
 * @returns Active (non-undone) operations in chronological order
 */
export function getActiveHistory(
  operations: readonly DragDropOperation[],
): readonly DragDropOperation[] {
  return operations.filter((op) => !op.undone);
}

/**
 * Get the full recategorization history including undone operations.
 * @param operations - All operations
 * @returns All operations sorted by timestamp
 */
export function getFullHistory(
  operations: readonly DragDropOperation[],
): readonly DragDropOperation[] {
  return [...operations].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Count total transactions recategorized (excluding undone).
 * @param operations - All operations
 * @returns Number of transactions recategorized
 */
export function countRecategorizedTransactions(operations: readonly DragDropOperation[]): number {
  return operations
    .filter((op) => !op.undone)
    .reduce((sum, op) => sum + op.transactionIds.length, 0);
}

/**
 * Find operations affecting a specific transaction.
 * @param operations - All operations
 * @param transactionId - Transaction to search for
 * @returns Operations involving the specified transaction
 */
export function findOperationsForTransaction(
  operations: readonly DragDropOperation[],
  transactionId: string,
): readonly DragDropOperation[] {
  return operations.filter((op) => op.transactionIds.includes(transactionId));
}
