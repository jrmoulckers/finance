// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { getRecentRoutes } from '../../lib/navigation/history';

import '../forms/forms.css';

export interface CommandPaletteAction {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string;
  perform: () => void;
  /**
   * Target route for navigation actions. Used to surface recently visited
   * destinations in the "Recent" section (#3676) and to prefetch the route's
   * chunk on hover/focus (#3672).
   */
  href?: string;
  /** Optional: warm the destination's lazy chunk on hover/focus (#3672). */
  prefetch?: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  actions: readonly CommandPaletteAction[];
  onClose: () => void;
  /** The current route path, excluded from the "Recent" section (#3676). */
  currentPath?: string;
}

/** How many recent destinations to surface when the search box is empty. */
const RECENTS_LIMIT = 5;

interface PaletteRow {
  /** Stable React key + DOM id (prefixed for recents so ids stay unique). */
  domId: string;
  action: CommandPaletteAction;
  recent: boolean;
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
export function CommandPalette({ isOpen, actions, onClose, currentPath }: CommandPaletteProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const listboxId = useId();
  const recentLabelId = useId();
  const allLabelId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: searchRef,
  });

  const isEmptyQuery = query.trim() === '';

  const filteredActions = useMemo(
    () => actions.filter((action) => matchesAction(action, query)),
    [actions, query],
  );

  // Recently visited destinations, newest first, only when the user has not
  // started typing. Matched back to their nav actions by `href` (#3676).
  const recentActions = useMemo<CommandPaletteAction[]>(() => {
    if (!isEmptyQuery) return [];
    const byHref = new Map<string, CommandPaletteAction>();
    for (const action of actions) {
      if (action.href && !byHref.has(action.href)) {
        byHref.set(action.href, action);
      }
    }
    const seen = new Set<string>();
    const result: CommandPaletteAction[] = [];
    for (const entry of getRecentRoutes(RECENTS_LIMIT, currentPath)) {
      const action = byHref.get(entry.path);
      if (action && !seen.has(action.id)) {
        seen.add(action.id);
        result.push(action);
      }
    }
    return result;
  }, [actions, isEmptyQuery, currentPath]);

  // Flatten recents + the main list into a single ordered set of rows so
  // keyboard navigation (Arrow/Enter) traverses both sections seamlessly.
  const rows = useMemo<PaletteRow[]>(() => {
    const list: PaletteRow[] = [];
    for (const action of recentActions) {
      list.push({ domId: `recent-${action.id}`, action, recent: true });
    }
    for (const action of filteredActions) {
      list.push({ domId: action.id, action, recent: false });
    }
    return list;
  }, [recentActions, filteredActions]);

  const recentCount = recentActions.length;

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
    setActiveIndex((current) => Math.min(current, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

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
        setActiveIndex((current) => (rows.length === 0 ? 0 : (current + 1) % rows.length));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length,
        );
        return;
      }

      if (event.key === 'Enter') {
        const selected = rows[activeIndex];
        if (selected) {
          event.preventDefault();
          runAction(selected.action);
        }
      }
    },
    [activeIndex, rows, onClose, runAction],
  );

  if (!isOpen) return null;

  const renderRow = (row: PaletteRow, index: number) => {
    const { action } = row;
    return (
      <button
        key={row.domId}
        id={row.domId}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        className={`command-palette__item${index === activeIndex ? ' command-palette__item--active' : ''}`}
        onMouseEnter={() => {
          setActiveIndex(index);
          action.prefetch?.();
        }}
        onFocus={() => action.prefetch?.()}
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
    );
  };

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
          aria-activedescendant={rows[activeIndex]?.domId}
          placeholder="Type a command or destination…"
        />
        <div id={listboxId} className="command-palette__list" role="listbox" aria-label="Commands">
          {rows.length === 0 ? (
            <p className="command-palette__empty">No matching commands.</p>
          ) : (
            <>
              {recentCount > 0 ? (
                <div
                  className="command-palette__group"
                  role="group"
                  aria-labelledby={recentLabelId}
                >
                  <p id={recentLabelId} className="command-palette__group-label">
                    Recent
                  </p>
                  {rows.slice(0, recentCount).map((row, index) => renderRow(row, index))}
                </div>
              ) : null}
              {rows.length > recentCount ? (
                <div
                  className="command-palette__group"
                  role="group"
                  aria-labelledby={recentCount > 0 ? allLabelId : undefined}
                >
                  {recentCount > 0 ? (
                    <p id={allLabelId} className="command-palette__group-label">
                      All commands
                    </p>
                  ) : null}
                  {rows
                    .slice(recentCount)
                    .map((row, offset) => renderRow(row, recentCount + offset))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
