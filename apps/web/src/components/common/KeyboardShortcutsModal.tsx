// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useId, useRef, type KeyboardEvent } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { SHORTCUT_CATEGORIES } from '../../hooks/useKeyboardShortcuts';

import '../forms/forms.css';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  singleKeyShortcutsEnabled?: boolean;
}

/** Accessible help dialog listing the app's keyboard shortcuts. */
export function KeyboardShortcutsModal({
  isOpen,
  onClose,
  singleKeyShortcutsEnabled = true,
}: KeyboardShortcutsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: closeButtonRef,
  });

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

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    },
    [handleClose],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="form-dialog keyboard-shortcuts-modal" role="presentation">
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={handleClose} />
      <div
        ref={panelRef}
        className="form-dialog__panel keyboard-shortcuts__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="form-dialog__title keyboard-shortcuts__title">
          Keyboard shortcuts
        </h2>
        <p id={descriptionId} className="keyboard-shortcuts__description">
          Shortcuts work when focus is outside text fields and keep common actions within reach.
          {singleKeyShortcutsEnabled
            ? ' Character-key shortcuts are currently enabled.'
            : ' Character-key shortcuts are currently disabled; use visible controls or Ctrl/Cmd+K.'}
        </p>

        <table className="keyboard-shortcuts__table">
          <thead>
            <tr>
              <th scope="col">Shortcut</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUT_CATEGORIES.map((category) => (
              <React.Fragment key={category.title}>
                <tr className="keyboard-shortcuts__category-row">
                  <th scope="rowgroup" colSpan={2}>
                    {category.title}
                  </th>
                </tr>
                {category.shortcuts.map((shortcut) => (
                  <tr key={`${category.title}-${shortcut.keys}`}>
                    <th scope="row">
                      <kbd className="keyboard-shortcuts__key">{shortcut.keys}</kbd>
                    </th>
                    <td>{shortcut.description}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        <div className="form-actions keyboard-shortcuts__actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="form-button form-button--secondary"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
