// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('renders without crashing', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays financial summary cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Net Worth')).toBeInTheDocument();
    expect(screen.getByText('Spent This Month')).toBeInTheDocument();
    expect(screen.getByText('Budget Health')).toBeInTheDocument();
  });

  it('displays recent transactions section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
  });

  it('has accessible landmarks', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('region', { name: /financial summary/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /recent transactions/i })).toBeInTheDocument();
  });
});
