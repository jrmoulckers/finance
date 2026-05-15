// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResponsiveNav, type NavItem } from './ResponsiveNav';

// ---------------------------------------------------------------------------
// Mock useBreakpoint
// ---------------------------------------------------------------------------

const mockUseBreakpoint = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const testItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: <span>📊</span> },
  {
    id: 'accounts',
    label: 'Accounts',
    href: '/accounts',
    icon: <span>🏦</span>,
  },
  {
    id: 'transactions',
    label: 'Transactions',
    href: '/transactions',
    icon: <span>💰</span>,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResponsiveNav', () => {
  it('renders navigation with items', () => {
    mockUseBreakpoint.mockReturnValue({
      breakpoint: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    render(<ResponsiveNav items={testItems} activePath="/" onNavigate={vi.fn()} />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('marks active item with aria-current=page', () => {
    mockUseBreakpoint.mockReturnValue({
      breakpoint: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    render(<ResponsiveNav items={testItems} activePath="/accounts" onNavigate={vi.fn()} />);

    const activeLink = screen.getByText('Accounts').closest('button');
    expect(activeLink).toHaveAttribute('aria-current', 'page');

    const inactiveLink = screen.getByText('Dashboard').closest('button');
    expect(inactiveLink).not.toHaveAttribute('aria-current');
  });

  it('calls onNavigate when an item is clicked', () => {
    mockUseBreakpoint.mockReturnValue({
      breakpoint: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    const onNavigate = vi.fn();
    render(<ResponsiveNav items={testItems} activePath="/" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Accounts'));
    expect(onNavigate).toHaveBeenCalledWith('/accounts');
  });

  it('shows toggle button on tablet breakpoint', () => {
    mockUseBreakpoint.mockReturnValue({
      breakpoint: 'tablet',
      isMobile: false,
      isTablet: true,
      isDesktop: false,
    });

    render(<ResponsiveNav items={testItems} activePath="/" onNavigate={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /expand navigation/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles expanded state on tablet', () => {
    mockUseBreakpoint.mockReturnValue({
      breakpoint: 'tablet',
      isMobile: false,
      isTablet: true,
      isDesktop: false,
    });

    render(<ResponsiveNav items={testItems} activePath="/" onNavigate={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /expand navigation/i });
    fireEvent.click(toggle);

    const collapseBtn = screen.getByRole('button', {
      name: /collapse navigation/i,
    });
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('uses custom aria-label', () => {
    mockUseBreakpoint.mockReturnValue({
      breakpoint: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    render(
      <ResponsiveNav
        items={testItems}
        activePath="/"
        onNavigate={vi.fn()}
        ariaLabel="App navigation"
      />,
    );

    expect(screen.getByRole('navigation', { name: 'App navigation' })).toBeInTheDocument();
  });
});
