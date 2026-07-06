// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useMemo, type FC } from 'react';

import type { ShortcutCategory } from '../../hooks/useKeyboardShortcuts';
import { buildNavigationShortcuts, isEditableTarget } from '../../lib/navigation/guardrails';
import { isMuscleMemoryRoute } from '../../lib/navigation/history';
import type { StableNavItem } from '../../lib/navigation/types';

export interface NavShortcutsProps {
  onNavigate: (path: string) => void;
  items: readonly StableNavItem[];
}

/**
 * Builds the "Locked navigation" shortcut category (Ctrl+1..9 -> primary
 * navigation destinations) for display inside the single, consolidated
 * keyboard-shortcuts help dialog. Returns `null` when there are no navigation
 * shortcuts to show so callers can omit an empty section.
 */
export function buildNavShortcutCategory(items: readonly StableNavItem[]): ShortcutCategory | null {
  const shortcuts = buildNavigationShortcuts(items);
  if (shortcuts.length === 0) {
    return null;
  }

  return {
    title: 'Locked navigation',
    shortcuts: shortcuts.map((shortcut) => ({
      keys: `Ctrl + ${shortcut.digit}`,
      description: `${shortcut.label}${isMuscleMemoryRoute(shortcut.path) ? ' · frequent' : ''}`,
    })),
  };
}

/**
 * Registers the always-on Ctrl+1..9 locked-order navigation shortcuts.
 *
 * Renders nothing: the shortcut reference is surfaced in the single
 * {@link KeyboardShortcutsModal} help dialog (via {@link buildNavShortcutCategory}),
 * so pressing "?" opens exactly one dialog instead of two competing modal
 * surfaces that trapped focus against each other.
 */
export const NavShortcuts: FC<NavShortcutsProps> = ({ onNavigate, items }) => {
  const shortcuts = useMemo(() => buildNavigationShortcuts(items), [items]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }

      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const shortcut = shortcuts.find((candidate) => event.key === String(candidate.digit));
      if (!shortcut) {
        return;
      }

      event.preventDefault();
      onNavigate(shortcut.path);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate, shortcuts]);

  return null;
};
