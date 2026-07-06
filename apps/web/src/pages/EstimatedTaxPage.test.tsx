// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EstimatedTaxPage } from './EstimatedTaxPage';
import { useAccounts, useTransactions } from '../hooks';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useTransactions: vi.fn(),
}));

vi.mock('../components/dashboard/DashboardTaxReserveSection', () => ({
  default: () => <div data-testid="tax-reserve-section" />,
}));

const mockUseAccounts = vi.mocked(useAccounts);
const mockUseTransactions = vi.mocked(useTransactions);

function accountsResult(overrides: Record<string, unknown> = {}): ReturnType<typeof useAccounts> {
  return {
    accounts: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAccounts>;
}

function transactionsResult(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useTransactions> {
  return {
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTransactions>;
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <EstimatedTaxPage />
    </MemoryRouter>,
  );
}

describe('EstimatedTaxPage', () => {
  beforeEach(() => {
    mockUseAccounts.mockReturnValue(accountsResult());
    mockUseTransactions.mockReturnValue(transactionsResult());
  });

  it('renders the estimated-tax heading and the reserve guidance section', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /estimated taxes/i })).toBeInTheDocument();
    expect(screen.getByTestId('tax-reserve-section')).toBeInTheDocument();
  });

  it('links to the Goals tax reserve bucket for managing the rate and payments', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /tax reserve bucket in goals/i });
    expect(link).toHaveAttribute('href', '/goals');
  });

  it('shows a loading state while accounts or transactions load', () => {
    mockUseTransactions.mockReturnValue(transactionsResult({ loading: true }));
    renderPage();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('tax-reserve-section')).not.toBeInTheDocument();
  });

  it('shows an error banner with a retry when loading fails', () => {
    mockUseAccounts.mockReturnValue(accountsResult({ error: 'Could not load accounts' }));
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load accounts');
    expect(screen.queryByTestId('tax-reserve-section')).not.toBeInTheDocument();
  });
});
