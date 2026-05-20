// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the DebtPage component.
 *
 * Follows web testing conventions: mock hooks, test loading/empty/error
 * states, and verify accessible markup.
 *
 * References: issues #1662, #1685, #1690, #1681, #1761, #1569
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock common components to avoid provider dependencies
vi.mock('../components/common', () => ({
  CurrencyDisplay: ({ amount, _context }: { amount: number; _context?: string }) => (
    <span data-testid="currency">{amount}</span>
  ),
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  ),
  ErrorBanner: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  LoadingSpinner: () => <div role="status">Loading…</div>,
}));

// We need to import after mocks
import { DebtPage } from './DebtPage';

describe('DebtPage', () => {
  it('renders the page title', () => {
    render(<DebtPage />);
    expect(screen.getByText('Debt Management')).toBeDefined();
  });

  it('renders all four tabs', () => {
    render(<DebtPage />);
    expect(screen.getByText('Payoff Planner')).toBeDefined();
    expect(screen.getByText('BNPL Dashboard')).toBeDefined();
    expect(screen.getByText('Student Loans')).toBeDefined();
    expect(screen.getByText('Credit Cards')).toBeDefined();
  });

  it('shows Payoff Planner tab by default', () => {
    render(<DebtPage />);
    const payoffTab = screen.getByRole('tab', { name: 'Payoff Planner' });
    expect(payoffTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows empty state when no debts exist', () => {
    render(<DebtPage />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('No debts added')).toBeDefined();
  });

  it('switches tabs on click', () => {
    render(<DebtPage />);
    const bnplTab = screen.getByRole('tab', { name: 'BNPL Dashboard' });
    fireEvent.click(bnplTab);
    expect(bnplTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('No BNPL obligations')).toBeDefined();
  });

  it('renders Student Loans empty state', () => {
    render(<DebtPage />);
    const tab = screen.getByRole('tab', { name: 'Student Loans' });
    fireEvent.click(tab);
    expect(screen.getByText('No student loans')).toBeDefined();
  });

  it('renders Credit Cards empty state', () => {
    render(<DebtPage />);
    const tab = screen.getByRole('tab', { name: 'Credit Cards' });
    fireEvent.click(tab);
    expect(screen.getByText('No credit cards')).toBeDefined();
  });

  it('has proper ARIA tab structure', () => {
    render(<DebtPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toBeDefined();
  });

  it('tab panel is labeled by its tab', () => {
    render(<DebtPage />);
    const tabpanel = screen.getByRole('tabpanel');
    const labelledBy = tabpanel.getAttribute('aria-labelledby');
    expect(labelledBy).toBe('debt-tab-payoff');
  });
});
