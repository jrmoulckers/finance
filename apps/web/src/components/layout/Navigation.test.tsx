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

import { BottomNavigation, SidebarNavigation, NAV_ITEMS } from './Navigation';

describe('BottomNavigation', () => {
  const defaultProps = {
    activePath: '/',
    onNavigate: vi.fn(),
  };

  it('renders 5 navigation items', () => {
    render(<BottomNavigation {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('renders all expected nav item labels', () => {
    render(<BottomNavigation {...defaultProps} />);

    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('marks the active item with aria-current="page"', () => {
    render(<BottomNavigation {...defaultProps} activePath="/accounts" />);

    expect(screen.getByRole('button', { name: 'Accounts' })).toHaveAttribute(
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

  it('calls onNavigate with the correct path when a nav item is clicked', () => {
    const onNavigate = vi.fn();
    render(<BottomNavigation {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Transactions' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/transactions');
  });

  it('has an accessible nav label', () => {
    render(<BottomNavigation {...defaultProps} />);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});

describe('SidebarNavigation', () => {
  const defaultProps = {
    activePath: '/',
    onNavigate: vi.fn(),
  };

  it('renders all primary nav items', () => {
    render(<SidebarNavigation {...defaultProps} />);

    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('renders the Settings button', () => {
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

  it('has a nav region with accessible label', () => {
    render(<SidebarNavigation {...defaultProps} />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('renders nav items in a list', () => {
    render(<SidebarNavigation {...defaultProps} />);

    const list = screen.getByRole('list');
    const listItems = within(list).getAllByRole('listitem');
    expect(listItems).toHaveLength(NAV_ITEMS.length);
  });
});
