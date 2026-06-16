// SPDX-License-Identifier: BUSL-1.1

/**
 * useKeyboardShortcuts — Comprehensive keyboard shortcut system.
 *
 * Supports:
 * - Single key shortcuts (?, /, N, J, K, Enter)
 * - Two-key "G then X" navigation sequences with timeout
 * - Ctrl+Shift+P privacy mode toggle
 * - Input/textarea/contenteditable guard
 *
 * @module hooks/useKeyboardShortcuts
 * References: issues #1476, #1478, #1616
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shortcut category for display in the help dialog. */
export interface ShortcutCategory {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

export interface UseKeyboardShortcutsOptions {
  /** Callback to navigate to a route path. */
  onNavigate?: (path: string) => void;
  /** Callback to open new transaction form. */
  onNewTransaction?: () => void;
  /** Callback to focus the search field. */
  onFocusSearch?: () => void;
  /** Callback to open the command palette/search overlay. */
  onOpenCommandPalette?: () => void;
  /** Callback for J/K list navigation (direction: -1 up, +1 down). */
  onListNavigate?: (direction: -1 | 1) => void;
  /** Callback for Enter on selected list item. */
  onListSelect?: () => void;
  /** Callback to toggle selection for the active list item. */
  onListToggleSelection?: () => void;
  /** Callback to select every item in the active list. */
  onListSelectAll?: () => void;
  /** Callback to delete selected list items. */
  onListDeleteSelected?: () => void;
  /** Callback to edit the active list item. */
  onListEditSelected?: () => void;
  /** Callback invoked when Ctrl+Shift+P is pressed to toggle privacy mode. */
  onTogglePrivacyMode?: () => void;
}

export interface UseKeyboardShortcutsResult {
  showHelp: boolean;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  /** All available shortcuts organized by category for display. */
  shortcutCategories: ShortcutCategory[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout (ms) for the second key in a two-key sequence. */
const SEQUENCE_TIMEOUT = 1500;

/** Navigation targets for "G then X" sequences. */
const G_NAV_MAP: Record<string, string> = {
  d: '/dashboard',
  a: '/accounts',
  t: '/transactions',
  b: '/budgets',
  g: '/goals',
  i: '/investments',
  l: '/bills',
  c: '/categories',
  f: '/cash-flow',
  n: '/net-worth',
  r: '/report-builder',
  w: '/watchlists',
  h: '/household',
  m: '/import',
  s: '/settings/preferences',
};

/** All shortcut categories for the help dialog. */
export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'G then D', description: 'Go to Dashboard' },
      { keys: 'G then A', description: 'Go to Accounts' },
      { keys: 'G then T', description: 'Go to Transactions' },
      { keys: 'G then B', description: 'Go to Budgets' },
      { keys: 'G then G', description: 'Go to Goals' },
      { keys: 'G then I', description: 'Go to Investments' },
      { keys: 'G then L', description: 'Go to Bills' },
      { keys: 'G then C', description: 'Go to Categories' },
      { keys: 'G then F', description: 'Go to Cash Flow' },
      { keys: 'G then N', description: 'Go to Net Worth' },
      { keys: 'G then R', description: 'Go to Reports' },
      { keys: 'G then W', description: 'Go to Watchlists' },
      { keys: 'G then H', description: 'Go to Household' },
      { keys: 'G then M', description: 'Go to Import' },
      { keys: 'G then S', description: 'Go to Settings Preferences' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: 'N', description: 'Quick add transaction' },
      { keys: '/', description: 'Open command palette' },
      { keys: 'Ctrl/Cmd+K', description: 'Open command palette' },
      { keys: '?', description: 'Show keyboard shortcuts' },
      { keys: 'Ctrl+Shift+P', description: 'Toggle privacy mode' },
    ],
  },
  {
    title: 'Transaction List',
    shortcuts: [
      { keys: 'J / ↓', description: 'Next item' },
      { keys: 'K / ↑', description: 'Previous item' },
      { keys: 'X / Space', description: 'Toggle selected item' },
      { keys: 'A', description: 'Select all visible items' },
      { keys: 'E', description: 'Edit active item' },
      { keys: 'Delete', description: 'Delete selected items' },
      { keys: 'Enter', description: 'Open selected item' },
    ],
  },
  {
    title: 'General',
    shortcuts: [{ keys: 'Esc', description: 'Close dialog / dismiss' }],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Handle global keyboard shortcuts including two-key navigation sequences. */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions = {},
): UseKeyboardShortcutsResult {
  const {
    onNavigate,
    onNewTransaction,
    onFocusSearch,
    onOpenCommandPalette,
    onListNavigate,
    onListSelect,
    onListToggleSelection,
    onListSelectAll,
    onListDeleteSelected,
    onListEditSelected,
    onTogglePrivacyMode,
  } = options;

  const [showHelp, setShowHelp] = useState(false);
  const pendingGRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSequence = useCallback(() => {
    pendingGRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape always works, even in inputs
      if (event.key === 'Escape') {
        setShowHelp(false);
        clearSequence();
        return;
      }

      // Ctrl/Cmd+K — open command palette from anywhere
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenCommandPalette?.();
        return;
      }

      // Ctrl+Shift+P — toggle privacy mode
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        onTogglePrivacyMode?.();
        return;
      }

      // Skip if modifier keys are held (except Shift for ?)
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        clearSequence();
        return;
      }

      // Don't fire shortcuts when user is typing in an input/textarea
      if (isEditableTarget(event.target)) {
        clearSequence();
        return;
      }

      // --- Two-key sequence: waiting for second key after G ---
      if (pendingGRef.current) {
        clearSequence();
        const key = event.key.toLowerCase();
        const path = G_NAV_MAP[key];
        if (path && onNavigate) {
          event.preventDefault();
          onNavigate(path);
        }
        return;
      }

      // --- Single key handlers ---
      const key = event.key;

      // "G" starts a navigation sequence
      if (key === 'g' || key === 'G') {
        pendingGRef.current = true;
        timeoutRef.current = setTimeout(() => {
          pendingGRef.current = false;
        }, SEQUENCE_TIMEOUT);
        return;
      }

      // Show help with ?
      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault();
        setShowHelp(true);
        return;
      }

      // Open command palette/search with /
      if (key === '/' && !event.shiftKey && (onOpenCommandPalette || onFocusSearch)) {
        event.preventDefault();
        if (onOpenCommandPalette) {
          onOpenCommandPalette();
        } else {
          onFocusSearch?.();
        }
        return;
      }

      // New transaction
      if ((key === 'n' || key === 'N') && onNewTransaction) {
        event.preventDefault();
        onNewTransaction();
        return;
      }

      // List navigation: J/ArrowDown = down, K/ArrowUp = up
      if ((key === 'j' || key === 'J' || key === 'ArrowDown') && onListNavigate) {
        event.preventDefault();
        onListNavigate(1);
        return;
      }

      if ((key === 'k' || key === 'K' || key === 'ArrowUp') && onListNavigate) {
        event.preventDefault();
        onListNavigate(-1);
        return;
      }

      if (
        (key === 'x' || key === 'X' || key === ' ' || key === 'Spacebar') &&
        onListToggleSelection
      ) {
        event.preventDefault();
        onListToggleSelection();
        return;
      }

      if ((key === 'a' || key === 'A') && onListSelectAll) {
        event.preventDefault();
        onListSelectAll();
        return;
      }

      if (key === 'Delete' && onListDeleteSelected) {
        event.preventDefault();
        onListDeleteSelected();
        return;
      }

      if ((key === 'e' || key === 'E') && onListEditSelected) {
        event.preventDefault();
        onListEditSelected();
        return;
      }

      // Open selected item
      if (key === 'Enter' && onListSelect) {
        event.preventDefault();
        onListSelect();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearSequence();
    };
  }, [
    onNavigate,
    onNewTransaction,
    onFocusSearch,
    onOpenCommandPalette,
    onListNavigate,
    onListSelect,
    onListToggleSelection,
    onListSelectAll,
    onListDeleteSelected,
    onListEditSelected,
    onTogglePrivacyMode,
    clearSequence,
  ]);

  return { showHelp, setShowHelp, shortcutCategories: SHORTCUT_CATEGORIES };
}
