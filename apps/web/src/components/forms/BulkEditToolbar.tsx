// SPDX-License-Identifier: BUSL-1.1

/**
 * BulkEditToolbar — floating action bar for bulk transaction operations.
 *
 * Appears when one or more transactions are selected. Provides:
 *   - Selection count display
 *   - Category reassignment
 *   - Bulk delete with confirmation
 *   - Select all / Deselect all toggle
 *
 * Accessibility:
 *   - role="toolbar" with aria-label
 *   - Keyboard-accessible controls
 *   - aria-live region for operation results
 *
 * References: issue #318
 */

import React, { useCallback, useState } from 'react';
import type { Category, SyncId } from '../../kmp/bridge';
import type { BulkUpdateFields, BulkOperationResult } from '../../hooks/useBulkTransactions';

import '../../styles/bulk-edit.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkEditToolbarProps {
  /** Number of selected transactions. */
  selectionCount: number;
  /** Total number of transactions in the list. */
  totalCount: number;
  /** Available categories for reassignment. */
  categories: Category[];
  /** Select all transactions. */
  onSelectAll: () => void;
  /** Clear all selections. */
  onClearSelection: () => void;
  /** Apply bulk field updates. */
  onBulkUpdate: (fields: BulkUpdateFields) => BulkOperationResult;
  /** Bulk delete selected transactions. */
  onBulkDelete: () => BulkOperationResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BulkEditToolbar: React.FC<BulkEditToolbarProps> = ({
  selectionCount,
  totalCount,
  categories,
  onSelectAll,
  onClearSelection,
  onBulkUpdate,
  onBulkDelete,
}) => {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [operationResult, setOperationResult] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const allSelected = selectionCount === totalCount && totalCount > 0;

  const handleCategoryChange = useCallback(
    (categoryId: SyncId | null) => {
      const result = onBulkUpdate({ categoryId });
      setShowCategoryPicker(false);
      setOperationResult(
        `Updated category for ${result.successCount} transaction${result.successCount !== 1 ? 's' : ''}${result.failureCount > 0 ? ` (${result.failureCount} failed)` : ''}`,
      );
      setTimeout(() => setOperationResult(null), 4000);
    },
    [onBulkUpdate],
  );

  const handleBulkDelete = useCallback(() => {
    const result = onBulkDelete();
    setShowDeleteConfirm(false);
    setOperationResult(
      `Deleted ${result.successCount} transaction${result.successCount !== 1 ? 's' : ''}${result.failureCount > 0 ? ` (${result.failureCount} failed)` : ''}`,
    );
    setTimeout(() => setOperationResult(null), 4000);
  }, [onBulkDelete]);

  if (selectionCount === 0) return null;

  return (
    <div className="bulk-edit-toolbar" role="toolbar" aria-label="Bulk edit actions">
      <div className="bulk-edit-toolbar__info">
        <span className="bulk-edit-toolbar__count" aria-live="polite">
          {selectionCount} selected
        </span>
        <button
          type="button"
          className="bulk-edit-toolbar__toggle"
          onClick={allSelected ? onClearSelection : onSelectAll}
          aria-label={allSelected ? 'Deselect all transactions' : 'Select all transactions'}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="bulk-edit-toolbar__actions">
        {/* Category reassignment */}
        <div className="bulk-edit-toolbar__action-group">
          <button
            type="button"
            className="bulk-edit-toolbar__button"
            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            aria-expanded={showCategoryPicker}
            aria-label="Change category for selected transactions"
          >
            <span aria-hidden="true">📁</span> Category
          </button>
          {showCategoryPicker && (
            <div
              className="bulk-edit-toolbar__dropdown"
              role="listbox"
              aria-label="Select category"
            >
              <button
                type="button"
                className="bulk-edit-toolbar__dropdown-item"
                role="option"
                aria-selected={false}
                onClick={() => handleCategoryChange(null)}
              >
                Uncategorized
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="bulk-edit-toolbar__dropdown-item"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleCategoryChange(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bulk delete */}
        {!showDeleteConfirm ? (
          <button
            type="button"
            className="bulk-edit-toolbar__button bulk-edit-toolbar__button--danger"
            onClick={() => setShowDeleteConfirm(true)}
            aria-label={`Delete ${selectionCount} selected transactions`}
          >
            <span aria-hidden="true">🗑️</span> Delete
          </button>
        ) : (
          <div
            className="bulk-edit-toolbar__confirm"
            role="alertdialog"
            aria-label="Confirm deletion"
          >
            <span className="bulk-edit-toolbar__confirm-text">
              Delete {selectionCount} transaction{selectionCount !== 1 ? 's' : ''}?
            </span>
            <button
              type="button"
              className="bulk-edit-toolbar__button bulk-edit-toolbar__button--danger"
              onClick={handleBulkDelete}
              aria-label="Confirm delete"
            >
              Confirm
            </button>
            <button
              type="button"
              className="bulk-edit-toolbar__button"
              onClick={() => setShowDeleteConfirm(false)}
              aria-label="Cancel delete"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Clear selection */}
        <button
          type="button"
          className="bulk-edit-toolbar__button"
          onClick={onClearSelection}
          aria-label="Cancel bulk selection"
        >
          ✕
        </button>
      </div>

      {/* Operation result toast */}
      {operationResult && (
        <div className="bulk-edit-toolbar__toast" role="status" aria-live="polite">
          {operationResult}
        </div>
      )}
    </div>
  );
};

export default BulkEditToolbar;
