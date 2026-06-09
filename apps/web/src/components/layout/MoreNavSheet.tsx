// SPDX-License-Identifier: BUSL-1.1

/**
 * MoreNavSheet — full-height drawer that surfaces every navigation
 * destination not already on the bottom-nav tab bar. Opened from the
 * "More" tab on narrow viewports so nothing in the app is unreachable
 * via the navigation chrome (#1930).
 *
 * Accessibility:
 *   - Renders as `role="dialog"` with `aria-modal="true"`.
 *   - Focus is moved into the sheet on open and restored to the trigger
 *     on close.
 *   - Escape closes the sheet.
 *   - The active route is marked with `aria-current="page"`.
 */

import React, { useCallback, useEffect, useRef } from 'react';

import { Icon } from '../common/Icon';
import { IconToken } from '../../icons/tokens';
import {
  MORE_SHEET_ITEMS,
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  type NavConfigItem,
  type NavGroup,
} from './navConfig';
import { CloseIcon, KeyboardIcon, SignOutIcon } from './navIcons';

export interface MoreNavSheetProps {
  /** Whether the sheet is open. */
  open: boolean;
  /** Close the sheet (Escape, overlay click, item click). */
  onClose: () => void;
  /** The current route path, used to mark the active item. */
  activePath: string;
  /** Navigate to a route. */
  onNavigate: (path: string) => void;
  /** Optional: open the keyboard-shortcuts modal. */
  onOpenShortcuts?: () => void;
  /** Optional: open the feedback dialog. */
  onOpenFeedback?: () => void;
  /** Optional: sign-out handler. */
  onSignOut?: () => void | Promise<void>;
}

/** Bucket items into their groups, preserving config order. */
function bucketByGroup(items: readonly NavConfigItem[]): Map<NavGroup, NavConfigItem[]> {
  const buckets = new Map<NavGroup, NavConfigItem[]>();
  for (const group of NAV_GROUP_ORDER) {
    buckets.set(group, []);
  }
  for (const item of items) {
    if (!item.group) continue;
    buckets.get(item.group)?.push(item);
  }
  return buckets;
}

export const MoreNavSheet: React.FC<MoreNavSheetProps> = ({
  open,
  onClose,
  activePath,
  onNavigate,
  onOpenShortcuts,
  onOpenFeedback,
  onSignOut,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management: remember the trigger, focus into the sheet on open,
  // restore focus on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    // Defer to next frame so the dialog has rendered.
    const id = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(id);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleNavigate = useCallback(
    (path: string) => {
      onClose();
      onNavigate(path);
    },
    [onClose, onNavigate],
  );

  const handleSignOut = useCallback(async () => {
    onClose();
    if (onSignOut) {
      await onSignOut();
    }
  }, [onClose, onSignOut]);

  if (!open) return null;

  const buckets = bucketByGroup(MORE_SHEET_ITEMS);

  return (
    <div className="more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title">
      <button
        type="button"
        className="more-sheet__scrim"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="more-sheet__panel" ref={dialogRef}>
        <header className="more-sheet__header">
          <h2 id="more-sheet-title" className="more-sheet__title">
            All destinations
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="more-sheet__close"
            aria-label="Close menu"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="more-sheet__body">
          {NAV_GROUP_ORDER.map((group) => {
            const items = buckets.get(group) ?? [];
            if (items.length === 0) return null;
            return (
              <section
                key={group}
                className="more-sheet__group"
                aria-labelledby={`more-sheet-group-${group}`}
              >
                <h3 id={`more-sheet-group-${group}`} className="more-sheet__group-heading">
                  {NAV_GROUP_LABELS[group]}
                </h3>
                <ul className="more-sheet__list" role="list">
                  {items.map((item) => {
                    const isActive = activePath === item.href;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`more-sheet__item${isActive ? ' more-sheet__item--active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={item.label}
                          onClick={() => handleNavigate(item.href)}
                        >
                          <span className="more-sheet__item-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="more-sheet__item-text">
                            <span className="more-sheet__item-label">{item.label}</span>
                            {item.description ? (
                              <span className="more-sheet__item-description">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section className="more-sheet__group" aria-label="Account">
            <h3 className="more-sheet__group-heading">Account</h3>
            <ul className="more-sheet__list" role="list">
              <li>
                <button
                  type="button"
                  className={`more-sheet__item${activePath === '/settings' ? ' more-sheet__item--active' : ''}`}
                  aria-current={activePath === '/settings' ? 'page' : undefined}
                  aria-label="Settings"
                  onClick={() => handleNavigate('/settings')}
                >
                  <span className="more-sheet__item-icon" aria-hidden="true">
                    <Icon name={IconToken.SETTINGS} />
                  </span>
                  <span className="more-sheet__item-text">
                    <span className="more-sheet__item-label">Settings</span>
                    <span className="more-sheet__item-description">
                      Profile, security, appearance and notifications.
                    </span>
                  </span>
                </button>
              </li>
              {onOpenShortcuts ? (
                <li>
                  <button
                    type="button"
                    className="more-sheet__item"
                    aria-keyshortcuts="Shift+/"
                    aria-label="Keyboard shortcuts"
                    onClick={() => {
                      onClose();
                      onOpenShortcuts();
                    }}
                  >
                    <span className="more-sheet__item-icon" aria-hidden="true">
                      <KeyboardIcon />
                    </span>
                    <span className="more-sheet__item-text">
                      <span className="more-sheet__item-label">Keyboard shortcuts</span>
                      <span className="more-sheet__item-description">
                        Speed up navigation and common actions.
                      </span>
                    </span>
                  </button>
                </li>
              ) : null}
              {onOpenFeedback ? (
                <li>
                  <button
                    type="button"
                    className="more-sheet__item"
                    aria-label="Send feedback"
                    onClick={() => {
                      onClose();
                      onOpenFeedback();
                    }}
                  >
                    <span className="more-sheet__item-icon" aria-hidden="true">
                      <KeyboardIcon />
                    </span>
                    <span className="more-sheet__item-text">
                      <span className="more-sheet__item-label">Send feedback</span>
                      <span className="more-sheet__item-description">
                        Report bugs, ideas, and beta feedback.
                      </span>
                    </span>
                  </button>
                </li>
              ) : null}
              {onSignOut ? (
                <li>
                  <button
                    type="button"
                    className="more-sheet__item more-sheet__item--danger"
                    aria-label="Sign out"
                    onClick={handleSignOut}
                  >
                    <span className="more-sheet__item-icon" aria-hidden="true">
                      <SignOutIcon />
                    </span>
                    <span className="more-sheet__item-text">
                      <span className="more-sheet__item-label">Sign out</span>
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MoreNavSheet;
