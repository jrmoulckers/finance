// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useFocusTrap } from '../../accessibility/aria';

import '../forms/forms.css';

export interface CommandPaletteAction {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string;
  perform: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  actions: readonly CommandPaletteAction[];
  onClose: () => void;
}

function matchesAction(action: CommandPaletteAction, query: string): boolean {
  if (query.trim() === '') return true;
  const haystack = [action.label, action.description, action.shortcut, action.keywords]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

/** Keyboard-first command palette for navigation and common actions. */
export function CommandPalette({ isOpen, actions, onClose }: CommandPaletteProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: searchRef,
  });

  const filteredActions = useMemo(
    () => actions.filter((action) => matchesAction(action, query)),
    [actions, query],
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(filteredActions.length - 1, 0)));
  }, [filteredActions.length]);

  const runAction = useCallback(
    (action: CommandPaletteAction) => {
      action.perform();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) =>
          filteredActions.length === 0 ? 0 : (current + 1) % filteredActions.length,
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          filteredActions.length === 0
            ? 0
            : (current - 1 + filteredActions.length) % filteredActions.length,
        );
        return;
      }

      if (event.key === 'Enter') {
        const selectedAction = filteredActions[activeIndex];
        if (selectedAction) {
          event.preventDefault();
          runAction(selectedAction);
        }
      }
    },
    [activeIndex, filteredActions, onClose, runAction],
  );

  if (!isOpen) return null;

  return (
    <div className="form-dialog command-palette" role="presentation">
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="form-dialog__panel command-palette__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="command-palette__title">
          Command palette
        </h2>
        <p id={descriptionId} className="command-palette__description">
          Search destinations and run common actions from the keyboard.
        </p>
        <input
          ref={searchRef}
          className="command-palette__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search commands"
          aria-controls={listboxId}
          aria-activedescendant={filteredActions[activeIndex]?.id}
          placeholder="Type a command or destination…"
        />
        <div id={listboxId} className="command-palette__list" role="listbox" aria-label="Commands">
          {filteredActions.length === 0 ? (
            <p className="command-palette__empty">No matching commands.</p>
          ) : (
            filteredActions.map((action, index) => (
              <button
                key={action.id}
                id={action.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`command-palette__item${index === activeIndex ? ' command-palette__item--active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAction(action)}
              >
                <span className="command-palette__item-text">
                  <span className="command-palette__item-label">{action.label}</span>
                  {action.description ? (
                    <span className="command-palette__item-description">{action.description}</span>
                  ) : null}
                </span>
                {action.shortcut ? (
                  <kbd className="command-palette__shortcut">{action.shortcut}</kbd>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
