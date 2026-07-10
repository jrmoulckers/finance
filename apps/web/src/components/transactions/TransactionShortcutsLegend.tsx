// SPDX-License-Identifier: BUSL-1.1

/**
 * TransactionShortcutsLegend — a discoverable, on-screen affordance that
 * surfaces the transaction-list keyboard shortcuts wired up by
 * `useKeyboardShortcuts`. Without it the shortcuts (J/K navigate, X toggle,
 * A select-all, E edit, Delete, Enter open) are effectively invisible (#3654).
 *
 * Renders a compact "?" button that toggles a small, dismissible legend. The
 * legend is keyboard reachable, closes on Escape, and returns focus to the
 * trigger. Styling uses design tokens and respects reduced-motion.
 *
 * @module components/transactions/TransactionShortcutsLegend
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import { SHORTCUT_CATEGORIES } from '../../hooks/useKeyboardShortcuts';

import './transaction-shortcuts-legend.css';

const TRANSACTION_LIST_SHORTCUTS =
  SHORTCUT_CATEGORIES.find((category) => category.title === 'Transaction List')?.shortcuts ?? [];

export function TransactionShortcutsLegend(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const legendId = useId();

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (legendRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, close]);

  return (
    <div className="transaction-shortcuts-legend">
      <button
        ref={triggerRef}
        type="button"
        className="transaction-shortcuts-legend__trigger"
        aria-label="Keyboard shortcuts for the transaction list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? legendId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">?</span>
      </button>

      {isOpen && (
        <div
          ref={legendRef}
          id={legendId}
          role="dialog"
          aria-label="Transaction list keyboard shortcuts"
          className="transaction-shortcuts-legend__panel"
        >
          <p className="transaction-shortcuts-legend__title">Keyboard shortcuts</p>
          <dl className="transaction-shortcuts-legend__list">
            {TRANSACTION_LIST_SHORTCUTS.map((shortcut) => (
              <div className="transaction-shortcuts-legend__row" key={shortcut.keys}>
                <dt className="transaction-shortcuts-legend__keys">
                  <kbd>{shortcut.keys}</kbd>
                </dt>
                <dd className="transaction-shortcuts-legend__action">{shortcut.description}</dd>
              </div>
            ))}
          </dl>
          <p className="transaction-shortcuts-legend__hint">
            Shortcuts work when focus is outside text fields. Press <kbd>?</kbd> anywhere for the
            full list.
          </p>
        </div>
      )}
    </div>
  );
}

export default TransactionShortcutsLegend;
