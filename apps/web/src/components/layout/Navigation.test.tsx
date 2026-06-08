// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/CognitiveAccessibilityProvider', () => ({
  useCognitiveAccessibility: () => ({
    isSimplified: false,
    getLabel: (original: string) => original,
  }),
  SIMPLIFIED_NAV_PATHS: new Set(['/', '/dashboard', '/transactions', '/budgets', '/settings']),
}));

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'test-user', email: 'test@example.com', hasPasskey: false },
    error: null,
    logout: vi.fn(),
  }),
}));

import { BottomNavigation, SidebarNavigation } from './Navigation';
import {
  BOTTOM_NAV_PRIORITY_ITEMS,
  NAV_CONFIG,
  NAV_GROUP_LABELS,
  PINNED_NAV_ITEMS,
} from './navConfig';

describe('BottomNavigation', () => {
  const defaultProps = {
    activePath: '/dashboard',
    onNavigate: vi.fn(),
  };

  it('renders the priority destinations plus a More button', () => {
    render(<BottomNavigation {...defaultProps} />);

    // 4 priority items + 1 "More" button = 5 buttons on the bottom nav.
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(BOTTOM_NAV_PRIORITY_ITEMS.length + 1);
  });

  it('renders the four priority nav item labels', () => {
    render(<BottomNavigation {...defaultProps} />);

    for (const item of BOTTOM_NAV_PRIORITY_ITEMS) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('renders the More button with the right ARIA attributes', () => {
    render(<BottomNavigation {...defaultProps} />);

    const moreButton = screen.getByRole('button', { name: 'More destinations' });
    expect(moreButton).toBeInTheDocument();
    expect(moreButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the active item with aria-current="page"', () => {
    render(<BottomNavigation {...defaultProps} activePath="/accounts" />);

    expect(screen.getByRole('button', { name: 'Accounts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks the More button active when the current route is reachable only via the sheet', () => {
    render(<BottomNavigation {...defaultProps} activePath="/insights" />);

    expect(screen.getByRole('button', { name: 'More destinations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not set aria-current on inactive items', () => {
    render(<BottomNavigation {...defaultProps} activePath="/accounts" />);

    expect(screen.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Transactions' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('calls onNavigate with the correct path when a priority item is clicked', () => {
    const onNavigate = vi.fn();
    render(<BottomNavigation {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Transactions' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/transactions');
  });

  it('opens the More sheet when the More button is clicked', () => {
    render(<BottomNavigation {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'More destinations' }));

    // The sheet is a dialog with the title "All destinations".
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('All destinations')).toBeInTheDocument();
  });

  it('every destination not on the bottom-nav is reachable from the More sheet', () => {
    render(<BottomNavigation {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'More destinations' }));

    const dialog = screen.getByRole('dialog');
    for (const item of NAV_CONFIG) {
      if (BOTTOM_NAV_PRIORITY_ITEMS.some((p) => p.id === item.id)) continue;
      expect(within(dialog).getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('has an accessible nav label', () => {
    render(<BottomNavigation {...defaultProps} />);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});

describe('SidebarNavigation', () => {
  const defaultProps = {
    activePath: '/dashboard',
    onNavigate: vi.fn(),
  };

  it('renders the pinned destinations at the top', () => {
    render(<SidebarNavigation {...defaultProps} />);

    for (const item of PINNED_NAV_ITEMS) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('renders every navigation destination somewhere in the sidebar (groups expand on demand)', () => {
    render(<SidebarNavigation {...defaultProps} activePath="/insights" />);

    // Expand the Connect group so its items are queryable; the other
    // groups (Money, Plan) are expanded by default and Insights is forced
    // open because /insights is the active route.
    const expandConnect = screen.getByRole('button', { name: 'Connect section' });
    fireEvent.click(expandConnect);

    for (const item of NAV_CONFIG) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('renders the Settings button in the footer', () => {
    render(<SidebarNavigation {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('marks the active primary nav item with aria-current="page"', () => {
    render(<SidebarNavigation {...defaultProps} activePath="/budgets" />);

    expect(screen.getByRole('button', { name: 'Budgets' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Settings as active when activePath is /settings', () => {
    render(<SidebarNavigation {...defaultProps} activePath="/settings" />);

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not set aria-current on inactive items', () => {
    render(<SidebarNavigation {...defaultProps} activePath="/goals" />);

    expect(screen.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  it('forces the section open when one of its routes is active', () => {
    render(<SidebarNavigation {...defaultProps} activePath="/cash-flow" />);

    // /cash-flow is in the "Insights" group, which is collapsed by default.
    // Because the active route is inside it, the group must auto-expand and
    // the Cash Flow button must be visible.
    const cashFlow = screen.getByRole('button', { name: 'Cash Flow' });
    expect(cashFlow).toHaveAttribute('aria-current', 'page');
  });

  it('calls onNavigate with the correct path when a nav item is clicked', () => {
    const onNavigate = vi.fn();
    render(<SidebarNavigation {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/accounts');
  });

  it('calls onNavigate with /settings when Settings is clicked', () => {
    const onNavigate = vi.fn();
    render(<SidebarNavigation {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('displays the logo text "Finance"', () => {
    render(<SidebarNavigation {...defaultProps} />);

    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('renders a Shortcuts button when onOpenShortcuts is provided', () => {
    const onOpenShortcuts = vi.fn();
    render(<SidebarNavigation {...defaultProps} onOpenShortcuts={onOpenShortcuts} />);

    const shortcutsButton = screen.getByRole('button', { name: 'Shortcuts' });
    expect(shortcutsButton).toBeInTheDocument();
    expect(shortcutsButton).toHaveAttribute('aria-keyshortcuts', 'Shift+/');
  });

  it('calls onOpenShortcuts when the Shortcuts button is clicked', () => {
    const onOpenShortcuts = vi.fn();
    render(<SidebarNavigation {...defaultProps} onOpenShortcuts={onOpenShortcuts} />);

    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }));

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('does not render the Shortcuts button when onOpenShortcuts is not provided', () => {
    render(<SidebarNavigation {...defaultProps} />);

    expect(screen.queryByRole('button', { name: 'Shortcuts' })).not.toBeInTheDocument();
  });

  it('has a Primary nav region with accessible label', () => {
    render(<SidebarNavigation {...defaultProps} />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('renders a Sign Out button', () => {
    render(<SidebarNavigation {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('renders a section header for each nav group', () => {
    render(<SidebarNavigation {...defaultProps} />);

    for (const label of Object.values(NAV_GROUP_LABELS)) {
      expect(screen.getByRole('button', { name: `${label} section` })).toBeInTheDocument();
    }
  });

  it('toggling a group header collapses the items underneath', () => {
    render(<SidebarNavigation {...defaultProps} />);

    // Money is expanded by default and contains Accounts.
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeVisible();

    const moneyToggle = screen.getByRole('button', { name: 'Money section' });
    fireEvent.click(moneyToggle);

    // After collapsing, the parent list has `hidden` so the items are
    // still in the DOM but not accessible.
    const moneyList = document.getElementById('sidebar-group-money');
    expect(moneyList).not.toBeNull();
    expect(moneyList?.hasAttribute('hidden')).toBe(true);
    expect(moneyToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('can collapse a group that contains the currently active route (#2005)', () => {
    // Regression: previously `expanded = userExpanded || containsActive`
    // made the section permanently expanded as long as the active route was
    // inside it. Users could click the chevron and watch nothing happen.
    render(<SidebarNavigation {...defaultProps} activePath="/subscriptions" />);

    const moneyToggle = screen.getByRole('button', { name: 'Money section' });
    // Group opens on mount because it contains the active route.
    expect(moneyToggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(moneyToggle);

    expect(moneyToggle).toHaveAttribute('aria-expanded', 'false');
    const moneyList = document.getElementById('sidebar-group-money');
    expect(moneyList?.hasAttribute('hidden')).toBe(true);
  });

  it('auto-expands a group on cross-group navigation (#2005)', () => {
    // After the user collapses Money on /dashboard, navigating into a Money
    // route should re-open the group so the active item is visible.
    const { rerender } = render(<SidebarNavigation {...defaultProps} activePath="/dashboard" />);

    const moneyToggle = screen.getByRole('button', { name: 'Money section' });
    // Default-expanded; collapse it.
    fireEvent.click(moneyToggle);
    expect(moneyToggle).toHaveAttribute('aria-expanded', 'false');

    // Simulate cross-group navigation into /accounts.
    rerender(<SidebarNavigation {...defaultProps} activePath="/accounts" />);

    expect(moneyToggle).toHaveAttribute('aria-expanded', 'true');
    const moneyList = document.getElementById('sidebar-group-money');
    expect(moneyList?.hasAttribute('hidden')).toBe(false);
  });

  it('does not re-expand a group on same-group navigation after user collapsed it (#2005)', () => {
    // If the user collapses Money while on /transactions and then navigates
    // to /accounts (still in Money), the section should stay collapsed
    // because containsActive did not flip from false to true.
    const { rerender } = render(<SidebarNavigation {...defaultProps} activePath="/transactions" />);

    const moneyToggle = screen.getByRole('button', { name: 'Money section' });
    fireEvent.click(moneyToggle);
    expect(moneyToggle).toHaveAttribute('aria-expanded', 'false');

    rerender(<SidebarNavigation {...defaultProps} activePath="/accounts" />);

    // Money still contains the active route; no rising edge → stays collapsed.
    expect(moneyToggle).toHaveAttribute('aria-expanded', 'false');
  });
});
