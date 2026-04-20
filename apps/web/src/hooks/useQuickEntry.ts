// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing the quick-entry transaction panel.
 *
 * Combines the open/close state with keyboard shortcut registration
 * (press 'n' to open) and transaction creation through the existing
 * useTransactions hook.
 *
 * Usage:
 * ```tsx
 * const { isOpen, open, close, submitTransaction } = useQuickEntry();
 * ```
 *
 * References: issue #319
 * @module hooks/useQuickEntry
 */

import { useCallback, useEffect, useState } from 'react';

import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts } from './useAccounts';
import { useAutoCategory } from './useAutoCategory';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseQuickEntryResult {
  /** Whether the quick-entry panel is open. */
  isOpen: boolean;
  /** Open the quick-entry panel. */
  open: () => void;
  /** Close the quick-entry panel. */
  close: () => void;
  /** Toggle the quick-entry panel. */
  toggle: () => void;
  /** Submit a transaction and auto-refresh the list. */
  submitTransaction: (data: CreateTransactionInput) => void;
  /** Whether a submission error occurred. */
  error: string | null;
  /** Accounts available for selection. */
  accounts: ReturnType<typeof useAccounts>['accounts'];
  /** Categories available for suggestion. */
  categories: ReturnType<typeof useCategories>['categories'];
  /** Category suggestion function. */
  suggestCategory: ReturnType<typeof useAutoCategory>['suggestCategory'];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useQuickEntry(): UseQuickEntryResult {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { createTransaction } = useTransactions();
  const { suggestCategory } = useAutoCategory(categories);

  const open = useCallback(() => {
    setIsOpen(true);
    setError(null);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setError(null);
  }, []);

  const submitTransaction = useCallback(
    (data: CreateTransactionInput) => {
      try {
        const result = createTransaction(data);
        if (result === null) {
          setError('Failed to create transaction.');
        } else {
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create transaction.');
      }
    },
    [createTransaction],
  );

  // Register global keyboard shortcut: 'n' opens quick entry
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      // Don't trigger when typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger with modifier keys
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        open();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return {
    isOpen,
    open,
    close,
    toggle,
    submitTransaction,
    error,
    accounts,
    categories,
    suggestCategory,
  };
}
