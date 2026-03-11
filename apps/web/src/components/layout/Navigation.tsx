// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
export interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}
export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    path: '/accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    path: '/transactions',
    label: 'Transactions',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    path: '/budgets',
    label: 'Budgets',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
      </svg>
    ),
  },
  {
    path: '/goals',
    label: 'Goals',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];
export interface NavigationProps {
  activePath: string;
  onNavigate: (path: string) => void;
}
export const BottomNavigation: React.FC<NavigationProps> = ({ activePath, onNavigate }) => (
  <nav className="bottom-nav" aria-label="Main navigation">
    {NAV_ITEMS.map((item) => {
      const a = activePath === item.path;
      return (
        <button
          key={item.path}
          type="button"
          className={`nav-item${a ? ' nav-item--active' : ''}`}
          aria-current={a ? 'page' : undefined}
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
export const SidebarNavigation: React.FC<NavigationProps> = ({ activePath, onNavigate }) => {
  const sa = activePath === '/settings';
  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="app-sidebar__header">
        <span className="app-sidebar__logo">Finance</span>
      </div>
      <nav className="app-sidebar__nav" aria-label="Primary">
        <ul className="sidebar-nav__list" role="list">
          {NAV_ITEMS.map((item) => {
            const a = activePath === item.path;
            return (
              <li key={item.path} role="listitem">
                <button
                  type="button"
                  className={`sidebar-nav__item${a ? ' sidebar-nav__item--active' : ''}`}
                  aria-current={a ? 'page' : undefined}
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
      <div className="app-sidebar__footer">
        <button
          type="button"
          className={`sidebar-nav__item${sa ? ' sidebar-nav__item--active' : ''}`}
          aria-current={sa ? 'page' : undefined}
          onClick={() => onNavigate('/settings')}
        >
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
export default BottomNavigation;
