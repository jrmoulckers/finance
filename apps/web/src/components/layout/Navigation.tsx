// SPDX-License-Identifier: BUSL-1.1

import React, { useState } from 'react';
import { useAuth } from '../../auth/auth-context';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

/** Primary navigation items shown in the main nav section. */
export const NAV_ITEMS: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    path: '/accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    path: '/transactions',
    label: 'Transactions',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    path: '/budgets',
    label: 'Budgets',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
      </svg>
    ),
  },
  {
    path: '/goals',
    label: 'Goals',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    path: '/investments',
    label: 'Investments',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M17 7h4v4" />
      </svg>
    ),
  },
  {
    path: '/bills',
    label: 'Bills',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
  },
  {
    path: '/insights',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    path: '/household',
    label: 'Household',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

/** Secondary navigation items shown in a collapsible "More" section. */
export const MORE_NAV_ITEMS: NavItem[] = [
  {
    path: '/report-builder',
    label: 'Report Builder',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    path: '/achievements',
    label: 'Achievements',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    path: '/watchlists',
    label: 'Watchlists',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
];

export interface NavigationProps {
  activePath: string;
  onNavigate: (path: string) => void;
  onOpenShortcuts?: () => void;
}

/** Bottom navigation for mobile viewports. */
export const BottomNavigation: React.FC<NavigationProps> = ({ activePath, onNavigate }) => (
  <nav className="bottom-nav" aria-label="Main navigation">
    {NAV_ITEMS.slice(0, 5).map((item) => {
      const isActive = activePath === item.path;
      return (
        <button
          key={item.path}
          type="button"
          className={`nav-item${isActive ? ' nav-item--active' : ''}`}
          aria-current={isActive ? 'page' : undefined}
          aria-label={item.label}
          onClick={() => onNavigate(item.path)}
        >
          <span className="nav-item__icon">{item.icon}</span>
          <span className="nav-item__label">{item.label}</span>
        </button>
      );
    })}
  </nav>
);

/** Sidebar navigation for desktop viewports with pinned footer. */
export const SidebarNavigation: React.FC<NavigationProps> = ({
  activePath,
  onNavigate,
  onOpenShortcuts,
}) => {
  const { logout } = useAuth();
  const [moreExpanded, setMoreExpanded] = useState(false);
  const isSettingsActive = activePath === '/settings';

  const handleSignOut = async () => {
    await logout();
  };

  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="app-sidebar__header">
        <span className="app-sidebar__logo">Finance</span>
      </div>

      {/* Scrollable navigation section */}
      <div className="app-sidebar__scrollable">
        <nav className="app-sidebar__nav" aria-label="Primary">
          <ul className="sidebar-nav__list" role="list">
            {NAV_ITEMS.map((item) => {
              const isActive = activePath === item.path;
              return (
                <li key={item.path} role="listitem">
                  <button
                    type="button"
                    className={`sidebar-nav__item${isActive ? ' sidebar-nav__item--active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onNavigate(item.path)}
                  >
                    <span className="sidebar-nav__item-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Collapsible "More" section */}
        <div className="app-sidebar__more">
          <button
            type="button"
            className="sidebar-nav__item sidebar-nav__item--more-toggle"
            aria-expanded={moreExpanded}
            aria-controls="sidebar-more-section"
            onClick={() => setMoreExpanded((prev) => !prev)}
          >
            <span className="sidebar-nav__item-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </span>
            <span>More</span>
            <span
              className={`sidebar-nav__item-chevron${moreExpanded ? ' sidebar-nav__item-chevron--expanded' : ''}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
          {moreExpanded && (
            <ul
              id="sidebar-more-section"
              className="sidebar-nav__list sidebar-nav__list--nested"
              role="list"
            >
              {MORE_NAV_ITEMS.map((item) => {
                const isActive = activePath === item.path;
                return (
                  <li key={item.path} role="listitem">
                    <button
                      type="button"
                      className={`sidebar-nav__item${isActive ? ' sidebar-nav__item--active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onNavigate(item.path)}
                    >
                      <span className="sidebar-nav__item-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Pinned footer — always visible without scrolling */}
      <div className="app-sidebar__footer">
        {onOpenShortcuts ? (
          <button
            type="button"
            className="sidebar-nav__item"
            aria-keyshortcuts="Shift+/"
            onClick={onOpenShortcuts}
          >
            <span
              className="sidebar-nav__item-icon sidebar-nav__item-icon--glyph"
              aria-hidden="true"
            >
              ?
            </span>
            <span>Shortcuts</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`sidebar-nav__item${isSettingsActive ? ' sidebar-nav__item--active' : ''}`}
          aria-current={isSettingsActive ? 'page' : undefined}
          onClick={() => onNavigate('/settings')}
        >
          <span className="sidebar-nav__item-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
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
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default BottomNavigation;
