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

import type { AppNotification } from '../../lib/notifications';
import { useAuth } from '../../auth/auth-context';
import { useAccessibility } from '../../hooks/useAccessibility';
import { useHiddenModules } from '../../hooks/useModuleVisibility';
import { Icon } from '../common/Icon';
import { IconToken } from '../../icons/tokens';
import { NotificationCenter } from '../notifications';

import { MoreNavSheet } from './MoreNavSheet';
import { prefetchRoute } from '../../lib/navigation/prefetch';
import { getAllVisitCounts } from '../../lib/navigation/history';
import {
  NAV_CONFIG,
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  computeAdaptiveBottomNavItems,
  getItemsByGroup,
  getPinnedNavItems,
  getVisibleNavItems,
  isNavItemActive,
  type NavConfigItem,
  type NavGroup,
} from './navConfig';
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FeedbackIcon,
  KeyboardIcon,
  MoreIcon,
  SignOutIcon,
} from './navIcons';

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
  simpleMode?: boolean;
}

/**
 * Props for {@link SidebarNavigation}. Extends {@link NavigationProps} with the
 * quick actions relocated from the app header (which is `display:none` at
 * ≥768px). The controls are gated by `showQuickActions` so exactly one
 * instance of each lives in the DOM per breakpoint — the header keeps them for
 * `<768px`, the sidebar hosts them for `≥768px` — avoiding duplicate
 * accessible-name (strict-mode) collisions (#3197).
 */
export interface SidebarNavigationProps extends NavigationProps {
  /** Render the relocated header quick actions (notifications + hide-amounts). */
  showQuickActions?: boolean;
  /** All notifications, newest first. */
  notifications?: readonly AppNotification[];
  /** Number of unread notifications (drives the bell badge). */
  notificationUnreadCount?: number;
  /** Mark a single notification as read. */
  onMarkNotificationAsRead?: (id: string) => void;
  /** Mark every notification as read. */
  onMarkAllNotificationsAsRead?: () => void;
  /** Dismiss a single notification. */
  onDismissNotification?: (id: string) => void;
  /** Handle a notification's primary action (e.g. "View budget"). */
  onNotificationAction?: (notification: AppNotification) => void;
  /** Whether privacy mode (masked amounts) is active. */
  isPrivacyMode?: boolean;
  /** Toggle privacy mode. */
  onTogglePrivacyMode?: () => void;
}

function isActive(activePath: string, href: string): boolean {
  return isNavItemActive(activePath, href);
}

// ---------------------------------------------------------------------------
// Bottom navigation (mobile)
// ---------------------------------------------------------------------------

/**
 * Bottom tab bar for narrow viewports. Renders the four highest-priority
 * destinations plus a "More" tab that opens {@link MoreNavSheet}.
 */
const SIMPLE_MODE_BOTTOM_NAV_IDS = new Set(['dashboard', 'transactions', 'budgets', 'bills']);

export const BottomNavigation: React.FC<NavigationProps> = ({
  activePath,
  onNavigate,
  onOpenShortcuts,
  onOpenFeedback,
  simpleMode = false,
}) => {
  const { logout } = useAuth();
  const { isSimplified } = useAccessibility();
  const hiddenModules = useHiddenModules();
  const [moreOpen, setMoreOpen] = useState(false);
  // Snapshot the visit counts once at mount so the adaptive tab bar (#3687)
  // ranks by real usage but never reshuffles under the user mid-session.
  const [visitCountsSnapshot] = useState(() => getAllVisitCounts());
  const priorityItems = useMemo(
    () => computeAdaptiveBottomNavItems(visitCountsSnapshot, isSimplified, hiddenModules),
    [visitCountsSnapshot, isSimplified, hiddenModules],
  );
  const visibleItems = useMemo(
    () => getVisibleNavItems(isSimplified, hiddenModules),
    [isSimplified, hiddenModules],
  );

  const bottomNavItems = useMemo(
    () =>
      simpleMode
        ? NAV_CONFIG.filter((item) => SIMPLE_MODE_BOTTOM_NAV_IDS.has(item.id))
        : priorityItems,
    [priorityItems, simpleMode],
  );

  const isMoreActive = useMemo(() => {
    // The "More" tab should appear active when the user is on any route
    // that is reachable only via the sheet (i.e. not a priority item).
    if (bottomNavItems.some((item) => isActive(activePath, item.href))) {
      return false;
    }
    return visibleItems.some((item) => isActive(activePath, item.href));
  }, [activePath, bottomNavItems, visibleItems]);

  const handleSignOut = useCallback(async () => {
    await logout();
  }, [logout]);

  return (
    <>
      <nav
        className="bottom-nav"
        aria-label="Main navigation"
        data-simple-mode={simpleMode || undefined}
      >
        {bottomNavItems.map((item) => {
          const active = isActive(activePath, item.href);
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active ? ' nav-item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.href)}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
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
        priorityItems={bottomNavItems}
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

/** localStorage key for a group's persisted expand/collapse state (#3780). */
function groupExpandedStorageKey(group: NavGroup): string {
  return `finance:sidebar-group-expanded:${group}`;
}

/**
 * Read a group's persisted expand/collapse preference. Returns `null` when the
 * user has never toggled it (so callers fall back to the static default).
 */
function readStoredGroupExpanded(group: NavGroup): boolean | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(groupExpandedStorageKey(group));
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredGroupExpanded(group: NavGroup, expanded: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(groupExpandedStorageKey(group), String(expanded));
  } catch {
    // Storage may be unavailable (private mode / quota); expand state is
    // non-critical, so silently ignore.
  }
}

const SidebarGroup: React.FC<SidebarGroupProps> = ({
  group,
  items,
  activePath,
  onNavigate,
  defaultExpanded,
}) => {
  const containsActive = items.some((item) => isActive(activePath, item.href));
  // Initialise from the user's persisted choice when present, otherwise the
  // static default, OR force-open if the active route is already inside this
  // group at mount (so the user always lands on a visible active item even when
  // the group would otherwise start collapsed, #2005). Persisting the toggle
  // means a user's collapse/expand choice survives reloads and remounts (#3780).
  const [userExpanded, setUserExpanded] = useState(() => {
    const stored = readStoredGroupExpanded(group);
    return (stored ?? defaultExpanded) || containsActive;
  });

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

  const toggleExpanded = useCallback(() => {
    setUserExpanded((prev) => {
      const next = !prev;
      writeStoredGroupExpanded(group, next);
      return next;
    });
  }, [group]);

  const expanded = userExpanded;

  const sectionId = `sidebar-group-${group}`;
  const headingId = `sidebar-group-${group}-heading`;
  const label = NAV_GROUP_LABELS[group];
  // Surface a cue when a collapsed group still contains the active route, so a
  // returning user who collapsed it can tell their current page is inside
  // (#3780). The visible dot is decorative; the accessible name carries the
  // meaning for AT users.
  const showsCollapsedActiveCue = containsActive && !expanded;

  return (
    <section
      className="app-sidebar__group"
      aria-labelledby={headingId}
      data-expanded={expanded}
      data-contains-active={containsActive || undefined}
    >
      <h2 id={headingId} className="app-sidebar__group-heading">
        <button
          type="button"
          className="app-sidebar__group-toggle"
          aria-expanded={expanded}
          aria-controls={sectionId}
          aria-label={
            showsCollapsedActiveCue ? `${label} section, contains current page` : `${label} section`
          }
          onClick={toggleExpanded}
        >
          <span className="app-sidebar__group-label">{label}</span>
          {showsCollapsedActiveCue ? (
            <span className="app-sidebar__group-active-dot" aria-hidden="true" />
          ) : null}
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
                onMouseEnter={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
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

/**
 * localStorage key for the desktop sidebar rail (collapsed) preference (#3668).
 */
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'finance:sidebar-collapsed';

function readStoredSidebarCollapsed(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Non-critical preference; ignore storage failures (private mode / quota).
  }
}

/** Double-chevron icon for the sidebar collapse/expand toggle (#3668). */
const SidebarCollapseIcon: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none">
    <path
      d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Sidebar navigation for wide viewports. */
export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  activePath,
  onNavigate,
  onOpenShortcuts,
  onOpenFeedback,
  simpleMode = false,
  showQuickActions = false,
  notifications = [],
  notificationUnreadCount = 0,
  onMarkNotificationAsRead = () => undefined,
  onMarkAllNotificationsAsRead = () => undefined,
  onDismissNotification = () => undefined,
  onNotificationAction,
  isPrivacyMode = false,
  onTogglePrivacyMode = () => undefined,
}) => {
  const { logout } = useAuth();
  const { isSimplified } = useAccessibility();
  const hiddenModules = useHiddenModules();
  const isSettingsActive = isActive(activePath, '/settings');
  const pinnedItems = useMemo(
    () => getPinnedNavItems(isSimplified, hiddenModules),
    [isSimplified, hiddenModules],
  );

  // Desktop rail (icons-only) collapse state, persisted so the choice survives
  // reloads (#3668). Mobile/bottom-nav layouts are unaffected (the rail styling
  // is scoped to the ≥768px sidebar).
  const [collapsed, setCollapsed] = useState(readStoredSidebarCollapsed);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredSidebarCollapsed(next);
      return next;
    });
  }, []);

  // Keyboard shortcut: Ctrl/Cmd + \ toggles the rail. Ignored while typing in a
  // field so it never eats input.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '\\' || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

  const handleSignOut = useCallback(async () => {
    await logout();
  }, [logout]);

  return (
    <aside
      className="app-sidebar"
      aria-label="Sidebar"
      data-simple-mode={simpleMode || undefined}
      data-collapsed={collapsed || undefined}
    >
      <div className="app-sidebar__header">
        <span className="app-sidebar__logo">Finance</span>
        <button
          type="button"
          className="icon-button app-sidebar__collapse-toggle"
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-keyshortcuts="Control+\\"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleCollapsed}
        >
          <SidebarCollapseIcon collapsed={collapsed} />
        </button>
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary" id="primary-navigation" tabIndex={-1}>
        {/* Pinned destinations (Dashboard) */}
        <ul className="sidebar-nav__list" role="list">
          {pinnedItems.map((item) => {
            const active = isActive(activePath, item.href);
            return (
              <li key={item.id} role="listitem">
                <button
                  type="button"
                  className={`sidebar-nav__item${active ? ' sidebar-nav__item--active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.href)}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onFocus={() => prefetchRoute(item.href)}
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
        {NAV_GROUP_ORDER.map((group) => {
          const groupItems = getItemsByGroup(group, isSimplified, hiddenModules);
          if (groupItems.length === 0) {
            return null;
          }

          return (
            <SidebarGroup
              key={group}
              group={group}
              items={groupItems}
              activePath={activePath}
              onNavigate={onNavigate}
              defaultExpanded={
                isSimplified || (!simpleMode && (group === 'money' || group === 'plan'))
              }
            />
          );
        })}
      </nav>

      {/* Pinned footer — always visible without scrolling. */}
      <div className="app-sidebar__footer">
        {/* Quick actions relocated from the header, which is hidden at ≥768px.
            Rendered only when `showQuickActions` so the header copies (used at
            <768px) never coexist with these in the DOM — keeping notification
            state single-sourced and accessible names unique (#3197). */}
        {showQuickActions ? (
          <div className="app-sidebar__quick-actions" role="group" aria-label="Quick actions">
            <div className="app-sidebar__notifications">
              <NotificationCenter
                notifications={notifications}
                unreadCount={notificationUnreadCount}
                onMarkAsRead={onMarkNotificationAsRead}
                onMarkAllAsRead={onMarkAllNotificationsAsRead}
                onDismiss={onDismissNotification}
                onAction={onNotificationAction}
                onViewAll={() => onNavigate('/notifications')}
              />
            </div>
            <button
              type="button"
              className={`icon-button${isPrivacyMode ? ' icon-button--active' : ''}`}
              aria-label={isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
              aria-pressed={isPrivacyMode}
              title={isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
              onClick={onTogglePrivacyMode}
            >
              {isPrivacyMode ? <EyeOffIcon /> : <EyeIcon />}
              <span className="icon-button__label">
                {isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
              </span>
            </button>
          </div>
        ) : null}
        {onOpenShortcuts && !isSimplified ? (
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
        {onOpenFeedback && !isSimplified ? (
          <button
            type="button"
            className="sidebar-nav__item"
            aria-label="Send feedback"
            onClick={onOpenFeedback}
          >
            <span className="sidebar-nav__item-icon" aria-hidden="true">
              <FeedbackIcon />
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
            <Icon name={IconToken.SETTINGS} />
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
