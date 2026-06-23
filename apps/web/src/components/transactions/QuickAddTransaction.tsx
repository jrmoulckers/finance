// SPDX-License-Identifier: BUSL-1.1

/**
 * Quick Add Transaction — one-thumb expense capture affordance.
 *
 * A persistent, keyboard-operable floating action button (FAB) for the
 * Transactions surface. Tapping it opens a compact bottom-sheet dialog with
 * instant presets and remembered defaults for true on-the-go capture.
 *
 * This whole component is lazy-loaded by `TransactionsPage` (default export)
 * so none of its code — nor the dialog body, presets, or persistence helper —
 * lands in the chronically-saturated Transactions route chunk.
 *
 * References: issue #2167
 * @module components/transactions/QuickAddTransaction
 */

import { useCallback, useId, useRef, useState, type FC } from 'react';

import type { CreateTransactionInput } from '../../db/repositories/transactions';
import type { Account, Category } from '../../kmp/bridge';
import QuickAddDialog from './QuickAddDialog';

import './quick-add-transaction.css';

export interface QuickAddTransactionProps {
  /** Available accounts for the remembered/default account. */
  accounts: Account[];
  /** Available categories for presets and the category quick-pick. */
  categories: Category[];
  /** Create a transaction through the page's existing data path. */
  onCreate: (input: CreateTransactionInput) => void | Promise<void>;
  /** Optional extra class for the FAB. */
  className?: string;
}

/** FAB affordance that opens the quick-add dialog. */
export const QuickAddTransaction: FC<QuickAddTransactionProps> = ({
  accounts,
  categories,
  onCreate,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const fabRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Restore focus to the FAB as a fallback for the dialog's focus trap.
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`quick-add-fab ${className}`.trim()}
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Quick add expense"
        data-testid="quick-add-fab"
      >
        <span aria-hidden="true">+</span>
      </button>

      {isOpen && (
        <QuickAddDialog
          accounts={accounts}
          categories={categories}
          onCreate={onCreate}
          onClose={close}
          titleId={titleId}
        />
      )}
    </>
  );
};

export default QuickAddTransaction;
