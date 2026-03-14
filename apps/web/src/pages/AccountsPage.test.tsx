// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AccountsPage } from './AccountsPage';

describe('AccountsPage', () => {
  it('renders without crashing', () => {
    render(<AccountsPage />);
    expect(screen.getByText('Accounts')).toBeInTheDocument();
  });

  it('displays account categories', () => {
    render(<AccountsPage />);
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('Savings')).toBeInTheDocument();
    expect(screen.getByText('Credit Cards')).toBeInTheDocument();
    expect(screen.getByText('Investments')).toBeInTheDocument();
  });

  it('displays individual accounts', () => {
    render(<AccountsPage />);
    expect(screen.getByText('Primary Checking')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText('Travel Card')).toBeInTheDocument();
    expect(screen.getByText('Brokerage')).toBeInTheDocument();
  });

  it('shows net worth text', () => {
    render(<AccountsPage />);
    expect(screen.getByText(/net worth/i)).toBeInTheDocument();
  });
});
