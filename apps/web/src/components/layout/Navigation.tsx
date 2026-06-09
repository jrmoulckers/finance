// SPDX-License-Identifier: BUSL-1.1

/**
 * Primary navigation chrome.
 *
 * - `SidebarNavigation` is the wide-screen layout: a pinned Dashboard at
 *   the top, four collapsible grouped sections (Money, Plan, Insights,
 *   Connect), and a pinned footer for Shortcuts / Settings / Sign Out.
 * - `BottomNavigation` is the narrow-screen tab bar. It surfaces the
 *   four most-used destinations plus a "More" button that opens a sheet
 *   listing every remaining destination — every route in the app is
 *   reachable on every viewport (#1930).
 *
 * Both components read from the same `NAV_CONFIG` source-of-truth so the
 * two layouts can never drift.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../auth/auth-context';

import { MoreNavSheet } from './MoreNavSheet';
import {
  BOTTOM_NAV_PRIORITY_ITEMS,
  NAV_CONFIG,
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  PINNED_NAV_ITEMS,
  getItemsByGroup,
  type NavConfigItem,
  type NavGroup,
} from './navConfig';
import { ChevronDownIcon, KeyboardIcon, MoreIcon, SettingsIcon, SignOutIcon } from './navIcons';

// ---------------------------------------------------------------------------
// Back-compat shims for existing consumers / tests.
// ---------------------------------------------------------------------------

/**
 * @deprecated Prefer `NAV_CONFIG` from `./navConfig`. Kept so existing
 * tests and external imports continue to compile during the migration.
 */
export interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

/**
 * @deprecated Use `NAV_CONFIG` directly. Provided for backwards
 * compatibility with code that imported the old flat array.
 */
export const NAV_ITEMS: NavItem[] = NAV_CONFIG.map((item) => ({
  path: item.href,
  label: item.label,
  icon: item.icon,
}));

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface NavigationProps {
  activePath: string;
  onNavigate: (path: string) => void;
  onOpenShortcuts?: () => void;
  onOpenFeedback?: () => void;
}

function isActive(activePath: string, href: string): boolean {
  return activePath === href || activePath.startsWith(href + '/');
}

// ---------------------------------------------------------------------------
// Bottom navigation (mobile)
// ---------------------------------------------------------------------------

/**
 * Bottom tab bar for narrow viewports. Renders the four highest-priority
 * destinations plus a "More" tab that opens {@link MoreNavSheet}.
 */
export const BottomNavigation: React.FC<NavigationProps> = ({
  activePath,
  onNavigate,
  onOpenShortcuts,
  onOpenFeedback,
}) => {
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = useMemo(() => {
    // The "More" tab should appear active when the user is on any route
    // that is reachable only via the sheet (i.e. not a priority item).
    if (BOTTOM_NAV_PRIORITY_ITEMS.some((item) => isActive(activePath, item.href))) {
      return false;
    }
    return NAV_CONFIG.some((item) => isActive(activePath, item.href));
  }, [activePath]);

  const handleSignOut = useCallback(async () => {
    await logout();
  }, [logout]);

  return (
    <>
      <nav className="bottom-nav" aria-label="Main navigation">
        {BOTTOM_NAV_PRIORITY_ITEMS.map((item) => {
          const active = isActive(activePath, item.href);
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active ? ' nav-item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => onNavigate(item.href)}
            >
              <span className="nav-item__icon">{item.icon}</span>
              <span className="nav-item__label">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`nav-item nav-item--more${isMoreActive ? ' nav-item--active' : ''}`}
          aria-label="More destinations"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={isMoreActive ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <span className="nav-item__icon">
            <MoreIcon />
          </span>
          <span className="nav-item__label">More</span>
        </button>
      </nav>
      <MoreNavSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        activePath={activePath}
        onNavigate={onNavigate}
        onOpenShortcuts={onOpenShortcuts}
        onOpenFeedback={onOpenFeedback}
        onSignOut={handleSignOut}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Sidebar navigation (desktop)
// ---------------------------------------------------------------------------

interface SidebarGroupProps {
  group: NavGroup;
  items: readonly NavConfigItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  defaultExpanded: boolean;
}

const SidebarGroup: React.FC<SidebarGroupProps> = ({
  group,
  items,
  activePath,
  onNavigate,
  defaultExpanded,
}) => {
  const containsActive = items.some((item) => isActive(activePath, item.href));
  // Initialise from the static default, OR force-open if the active route is
  // already inside this group at mount (so the user always lands on a visible
  // active item even when the group would otherwise start collapsed, #2005).
  const [userExpanded, setUserExpanded] = useState(defaultExpanded || containsActive);

  // Auto-expand only on the *rising edge* of containsActive — i.e. when the
  // user navigates INTO this group from another. This keeps the helpful
  // "show me where I am" behaviour without sticking the section open and
  // making the toggle non-functional (#2005).
  const prevContainsActive = useRef(containsActive);
  useEffect(() => {
    if (containsActive && !prevContainsActive.current) {
      setUserExpanded(true);
    }
    prevContainsActive.current = containsActive;
  }, [containsActive]);

  const expanded = userExpanded;

  const sectionId = `sidebar-group-${group}`;
  const headingId = `sidebar-group-${group}-heading`;
  const label = NAV_GROUP_LABELS[group];

  return (
    <section className="app-sidebar__group" aria-labelledby={headingId} data-expanded={expanded}>
      <h2 id={headingId} className="app-sidebar__group-heading">
        <button
          type="button"
          className="app-sidebar__group-toggle"
          aria-expanded={expanded}
          aria-controls={sectionId}
          aria-label={`${label} section`}
          onClick={() => setUserExpanded((prev) => !prev)}
        >
          <span className="app-sidebar__group-label">{label}</span>
          <span
            className={`app-sidebar__group-chevron${expanded ? ' app-sidebar__group-chevron--expanded' : ''}`}
            aria-hidden="true"
          >
            <ChevronDownIcon />
          </span>
        </button>
      </h2>
      <ul
        id={sectionId}
        className={`sidebar-nav__list sidebar-nav__list--nested${expanded ? '' : ' sidebar-nav__list--collapsed'}`}
        role="list"
        hidden={!expanded}
        aria-hidden={!expanded}
      >
        {items.map((item) => {
          const active = isActive(activePath, item.href);
          return (
            <li key={item.id} role="listitem">
              <button
                type="button"
                className={`sidebar-nav__item${active ? ' sidebar-nav__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.href)}
              >
                <span className="sidebar-nav__item-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Sidebar navigation for wide viewports. */
export const SidebarNavigation: React.FC<NavigationProps> = ({
  activePath,
  onNavigate,
  onOpenShortcuts,
  onOpenFeedback,
}) => {
  const { logout } = useAuth();
  const isSettingsActive = isActive(activePath, '/settings');

  const handleSignOut = useCallback(async () => {
    await logout();
  }, [logout]);

  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="app-sidebar__header">
        <span className="app-sidebar__logo">Finance</span>
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary">
        {/* Pinned destinations (Dashboard) */}
        <ul className="sidebar-nav__list" role="list">
          {PINNED_NAV_ITEMS.map((item) => {
            const active = isActive(activePath, item.href);
            return (
              <li key={item.id} role="listitem">
                <button
                  type="button"
                  className={`sidebar-nav__item${active ? ' sidebar-nav__item--active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.href)}
                >
                  <span className="sidebar-nav__item-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Grouped destinations. Money + Plan are expanded by default
            because they hold the most-used routes; Insights + Connect
            start collapsed to reduce cognitive load. */}
        {NAV_GROUP_ORDER.map((group) => (
          <SidebarGroup
            key={group}
            group={group}
            items={getItemsByGroup(group)}
            activePath={activePath}
            onNavigate={onNavigate}
            defaultExpanded={group === 'money' || group === 'plan'}
          />
        ))}
      </nav>

      {/* Pinned footer — always visible without scrolling. */}
      <div className="app-sidebar__footer">
        {onOpenShortcuts ? (
          <button
            type="button"
            className="sidebar-nav__item"
            aria-keyshortcuts="Shift+/"
            onClick={onOpenShortcuts}
          >
            <span className="sidebar-nav__item-icon" aria-hidden="true">
              <KeyboardIcon />
            </span>
            <span>Shortcuts</span>
          </button>
        ) : null}
        {onOpenFeedback ? (
          <button
            type="button"
            className="sidebar-nav__item"
            aria-label="Send feedback"
            onClick={onOpenFeedback}
          >
            <span className="sidebar-nav__item-icon" aria-hidden="true">
              <KeyboardIcon />
            </span>
            <span>Feedback</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`sidebar-nav__item${isSettingsActive ? ' sidebar-nav__item--active' : ''}`}
          aria-current={isSettingsActive ? 'page' : undefined}
          onClick={() => onNavigate('/settings')}
        >
          <span className="sidebar-nav__item-icon" aria-hidden="true">
            <SettingsIcon />
          </span>
          <span>Settings</span>
        </button>
        <button
          type="button"
          className="sidebar-nav__item sidebar-nav__item--sign-out"
          onClick={handleSignOut}
          aria-label="Sign out"
        >
          <span className="sidebar-nav__item-icon" aria-hidden="true">
            <SignOutIcon />
          </span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default BottomNavigation;
