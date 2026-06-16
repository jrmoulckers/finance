// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';

import type { Category, SyncId, TransactionStatus } from '../../kmp/bridge';
import type { BulkOperationResult, BulkUpdateFields } from '../../hooks/useBulkTransactions';
import { AppIcon } from '../icons';

import '../../styles/bulk-edit.css';

export interface TransactionBulkActionsToolbarProps {
  selectionCount: number;
  totalCount: number;
  categories: Category[];
  availableTags: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkUpdate: (fields: BulkUpdateFields) => BulkOperationResult;
  onBulkAddTag: (tag: string) => BulkOperationResult;
  onBulkRemoveTag: (tag: string) => BulkOperationResult;
  onRequestBulkDelete: () => void;
}

const STATUS_ACTIONS: { status: TransactionStatus; label: string }[] = [
  { status: 'CLEARED', label: 'Mark cleared' },
  { status: 'RECONCILED', label: 'Mark reconciled' },
];

function formatOperationResult(action: string, result: BulkOperationResult): string {
  return `${action} ${result.successCount} transaction${result.successCount === 1 ? '' : 's'}${
    result.failureCount > 0 ? ` (${result.failureCount} failed)` : ''
  }`;
}

export const TransactionBulkActionsToolbar: React.FC<TransactionBulkActionsToolbarProps> = ({
  selectionCount,
  totalCount,
  categories,
  availableTags,
  onSelectAll,
  onClearSelection,
  onBulkUpdate,
  onBulkAddTag,
  onBulkRemoveTag,
  onRequestBulkDelete,
}) => {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showTagActions, setShowTagActions] = useState(false);
  const [showStatusActions, setShowStatusActions] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [selectedTagToRemove, setSelectedTagToRemove] = useState('');
  const [operationResult, setOperationResult] = useState<string | null>(null);

  const allSelected = selectionCount === totalCount && totalCount > 0;
  const sortedTags = useMemo(
    () => [...availableTags].sort((a, b) => a.localeCompare(b)),
    [availableTags],
  );

  const announceResult = useCallback((message: string) => {
    setOperationResult(message);
    window.setTimeout(() => setOperationResult(null), 4000);
  }, []);

  const handleCategoryChange = useCallback(
    (categoryId: SyncId | null, label: string) => {
      const result = onBulkUpdate({ categoryId });
      setShowCategoryPicker(false);
      announceResult(formatOperationResult(`Categorized as ${label} for`, result));
    },
    [announceResult, onBulkUpdate],
  );

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (!tag) return;
    const result = onBulkAddTag(tag);
    setTagInput('');
    announceResult(formatOperationResult(`Added tag ${tag} to`, result));
  }, [announceResult, onBulkAddTag, tagInput]);

  const handleRemoveTag = useCallback(() => {
    if (!selectedTagToRemove) return;
    const result = onBulkRemoveTag(selectedTagToRemove);
    setSelectedTagToRemove('');
    announceResult(formatOperationResult(`Removed tag ${selectedTagToRemove} from`, result));
  }, [announceResult, onBulkRemoveTag, selectedTagToRemove]);

  const handleStatusChange = useCallback(
    (status: TransactionStatus, label: string) => {
      const result = onBulkUpdate({ status });
      setShowStatusActions(false);
      announceResult(formatOperationResult(label, result));
    },
    [announceResult, onBulkUpdate],
  );

  if (selectionCount === 0) return null;

  return (
    <div className="bulk-edit-toolbar" role="toolbar" aria-label="Bulk transaction actions">
      <div className="bulk-edit-toolbar__info">
        <span className="bulk-edit-toolbar__count" aria-live="polite">
          {selectionCount} selected
        </span>
        <button
          type="button"
          className="bulk-edit-toolbar__toggle"
          onClick={allSelected ? onClearSelection : onSelectAll}
          aria-label={allSelected ? 'Deselect all transactions' : 'Select all visible transactions'}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="bulk-edit-toolbar__actions">
        <div className="bulk-edit-toolbar__action-group">
          <button
            type="button"
            className="bulk-edit-toolbar__button"
            onClick={() => setShowCategoryPicker((open) => !open)}
            aria-expanded={showCategoryPicker}
            aria-label="Change category for selected transactions"
          >
            <AppIcon name="folder" /> Category
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
                onClick={() => handleCategoryChange(null, 'Uncategorized')}
              >
                Uncategorized
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="bulk-edit-toolbar__dropdown-item"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleCategoryChange(category.id, category.name)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bulk-edit-toolbar__action-group">
          <button
            type="button"
            className="bulk-edit-toolbar__button"
            onClick={() => setShowTagActions((open) => !open)}
            aria-expanded={showTagActions}
            aria-label="Add or remove tags for selected transactions"
          >
            <AppIcon name="tag" /> Tags
          </button>
          {showTagActions && (
            <div
              className="bulk-edit-toolbar__dropdown bulk-edit-toolbar__dropdown--wide"
              role="group"
              aria-label="Bulk tag actions"
            >
              <label className="bulk-edit-toolbar__field-label" htmlFor="bulk-add-tag-input">
                Add tag
              </label>
              <div className="bulk-edit-toolbar__inline-field">
                <input
                  id="bulk-add-tag-input"
                  className="bulk-edit-toolbar__text-input"
                  type="text"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                />
                <button
                  type="button"
                  className="bulk-edit-toolbar__dropdown-item"
                  onClick={handleAddTag}
                >
                  Add tag
                </button>
              </div>
              <label className="bulk-edit-toolbar__field-label" htmlFor="bulk-remove-tag-select">
                Remove tag
              </label>
              <div className="bulk-edit-toolbar__inline-field">
                <select
                  id="bulk-remove-tag-select"
                  className="bulk-edit-toolbar__text-input"
                  value={selectedTagToRemove}
                  onChange={(event) => setSelectedTagToRemove(event.target.value)}
                >
                  <option value="">Select tag</option>
                  {sortedTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bulk-edit-toolbar__dropdown-item"
                  onClick={handleRemoveTag}
                  disabled={!selectedTagToRemove}
                >
                  Remove tag
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bulk-edit-toolbar__action-group">
          <button
            type="button"
            className="bulk-edit-toolbar__button"
            onClick={() => setShowStatusActions((open) => !open)}
            aria-expanded={showStatusActions}
            aria-label="Change status for selected transactions"
          >
            <AppIcon name="check" /> Status
          </button>
          {showStatusActions && (
            <div className="bulk-edit-toolbar__dropdown" role="listbox" aria-label="Select status">
              {STATUS_ACTIONS.map((action) => (
                <button
                  key={action.status}
                  type="button"
                  className="bulk-edit-toolbar__dropdown-item"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleStatusChange(action.status, action.label)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="bulk-edit-toolbar__button bulk-edit-toolbar__button--danger"
          onClick={onRequestBulkDelete}
          aria-label={`Delete ${selectionCount} selected transactions`}
        >
          <AppIcon name="trash" /> Delete
        </button>

        <button
          type="button"
          className="bulk-edit-toolbar__button"
          onClick={onClearSelection}
          aria-label="Cancel bulk selection"
        >
          <AppIcon name="x" /> Clear
        </button>
      </div>

      {operationResult && (
        <div className="bulk-edit-toolbar__toast" role="status" aria-live="polite">
          {operationResult}
        </div>
      )}
    </div>
  );
};

export default TransactionBulkActionsToolbar;
