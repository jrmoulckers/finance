// SPDX-License-Identifier: BUSL-1.1

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { buildNavigationShortcuts, isEditableTarget } from '../../lib/navigation/guardrails';
import { isMuscleMemoryRoute } from '../../lib/navigation/history';
import type { StableNavItem } from '../../lib/navigation/types';
import '../forms/forms.css';

export interface NavShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  items: readonly StableNavItem[];
}

export const NavShortcuts: FC<NavShortcutsProps> = ({ isOpen, onClose, onNavigate, items }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shortcuts = useMemo(() => buildNavigationShortcuts(items), [items]);

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: closeButtonRef,
  });

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="form-dialog nav-shortcuts" role="presentation">
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="form-dialog__panel nav-shortcuts__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nav-shortcuts-title"
        aria-describedby="nav-shortcuts-description"
        onKeyDown={handleKeyDown}
      >
        <h2 id="nav-shortcuts-title" className="form-dialog__title">
          Navigation shortcuts
        </h2>
        <p id="nav-shortcuts-description">
          Ctrl+1 through Ctrl+9 always follow the locked primary navigation order.
        </p>

        <table className="keyboard-shortcuts__table">
          <thead>
            <tr>
              <th scope="col">Shortcut</th>
              <th scope="col">Destination</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map((shortcut) => (
              <tr key={shortcut.path}>
                <th scope="row">
                  <kbd className="keyboard-shortcuts__key">Ctrl</kbd>
                  {' + '}
                  <kbd className="keyboard-shortcuts__key">{shortcut.digit}</kbd>
                </th>
                <td>
                  {shortcut.label}
                  {isMuscleMemoryRoute(shortcut.path) ? ' · frequent' : ''}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">
                <kbd className="keyboard-shortcuts__key">?</kbd>
              </th>
              <td>Open this overlay</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd className="keyboard-shortcuts__key">Esc</kbd>
              </th>
              <td>Close the overlay</td>
            </tr>
          </tbody>
        </table>

        <div className="form-actions keyboard-shortcuts__actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="form-button form-button--secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
