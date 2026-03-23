// SPDX-License-Identifier: BUSL-1.1

/**
 * Toolbar displayed when one or more transactions are selected in bulk.
 *
 * Provides Categorize, Delete, and Export actions, plus a "Deselect all"
 * link and a count indicator.  The Delete button gates on a {@link ConfirmDialog}
 * to prevent accidental data loss.
 *
 * Uses `role="toolbar"` with `aria-label` for assistive technology discovery.
 * All action buttons include descriptive `aria-label` attributes that
 * incorporate the selected count.
 *
 * References: issue #318
 */

import React, { useCallback, useRef, useState, type KeyboardEvent } from 'react';

import type { Category } from '../../kmp/bridge';
import '../../styles/bulk-actions.css';
import { ConfirmDialog } from './ConfirmDialog';

/** Props for {@link BulkActionsToolbar}. */
export interface BulkActionsToolbarProps {
  /** Number of currently selected transactions. */
  selectedCount: number;
  /** Callback triggered when the user picks a category to assign. */
  onCategorize: (categoryId: string) => void;
  /** Callback triggered after the user confirms the delete action. */
  onDelete: () => void;
  /** Callback triggered when the user requests CSV export. */
  onExport: () => void;
  /** Clear all selections. */
  onDeselectAll: () => void;
  /** Available categories for the category picker. */
  categories: Category[];
}

/**
 * Render a bulk-actions toolbar when transactions are selected.
 */
export function BulkActionsToolbar({
  selectedCount,
  onCategorize,
  onDelete,
  onExport,
  onDeselectAll,
  categories,
}: BulkActionsToolbarProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setIsDeleteDialogOpen(false);
    onDelete();
  }, [onDelete]);

  const handleDeleteCancel = useCallback(() => {
    setIsDeleteDialogOpen(false);
  }, []);

  const handleCategorizeClick = useCallback(() => {
    setIsCategoryPickerOpen((prev) => !prev);
  }, []);

  const handleCategorySelect = useCallback(
    (categoryId: string) => {
      setIsCategoryPickerOpen(false);
      onCategorize(categoryId);
    },
    [onCategorize],
  );

  const handleCategoryPickerKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsCategoryPickerOpen(false);
      categoryButtonRef.current?.focus();
    }
  }, []);

  const handleToolbarKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const toolbar = event.currentTarget;
    const buttons = Array.from(
      toolbar.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"]:not([disabled])',
      ),
    );

    if (buttons.length === 0) return;

    const currentIndex = buttons.indexOf(event.target as HTMLElement);
    let nextIndex = -1;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextIndex = buttons.length - 1;
    }

    if (nextIndex >= 0) {
      buttons[nextIndex].focus();
    }
  }, []);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <div
        className="bulk-actions-toolbar"
        role="toolbar"
        aria-label="Bulk actions"
        onKeyDown={handleToolbarKeyDown}
      >
        <span className="bulk-actions-toolbar__count">{selectedCount} selected</span>

        <div style={{ position: 'relative' }}>
          <button
            ref={categoryButtonRef}
            type="button"
            className="bulk-actions-toolbar__button"
            onClick={handleCategorizeClick}
            aria-label={`Categorize ${selectedCount} transactions`}
            aria-expanded={isCategoryPickerOpen}
            aria-haspopup="listbox"
          >
            <span aria-hidden="true">🏷️</span> Categorize
          </button>

          {isCategoryPickerOpen && (
            <div
              className="bulk-category-picker"
              role="listbox"
              aria-label="Select category"
              onKeyDown={handleCategoryPickerKeyDown}
            >
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="bulk-category-picker__item"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleCategorySelect(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="bulk-actions-toolbar__button bulk-actions-toolbar__button--danger"
          onClick={handleDeleteClick}
          aria-label={`Delete ${selectedCount} transactions`}
        >
          <span aria-hidden="true">🗑️</span> Delete
        </button>

        <button
          type="button"
          className="bulk-actions-toolbar__button"
          onClick={onExport}
          aria-label={`Export ${selectedCount} transactions as CSV`}
        >
          <span aria-hidden="true">📥</span> Export
        </button>

        <button
          type="button"
          className="bulk-actions-toolbar__deselect"
          onClick={onDeselectAll}
          aria-label="Deselect all transactions"
        >
          Deselect all
        </button>
      </div>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Transactions"
        message={`Are you sure you want to delete ${selectedCount} transaction${selectedCount === 1 ? '' : 's'}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
}

export default BulkActionsToolbar;
