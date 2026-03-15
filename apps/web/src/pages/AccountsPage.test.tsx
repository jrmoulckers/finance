// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccounts } from '../hooks';
import { AccountsPage } from './AccountsPage';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
}));

const mockedUseAccounts = vi.mocked(useAccounts);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('AccountsPage', () => {
  beforeEach(() => {
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Primary Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 452000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
        {
          id: 'account-2',
          householdId: 'household-1',
          name: 'Emergency Fund',
          type: 'SAVINGS',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 1500000 },
          isArchived: false,
          sortOrder: 2,
          icon: 'piggy-bank',
          color: '#059669',
          ...syncMetadata,
        },
        {
          id: 'account-3',
          householdId: 'household-1',
          name: 'Travel Card',
          type: 'CREDIT_CARD',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: -125000 },
          isArchived: false,
          sortOrder: 3,
          icon: 'credit-card',
          color: '#DC2626',
          ...syncMetadata,
        },
        {
          id: 'account-4',
          householdId: 'household-1',
          name: 'Brokerage',
          type: 'INVESTMENT',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 1250000 },
          isArchived: false,
          sortOrder: 4,
          icon: 'chart',
          color: '#7C3AED',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });
  });

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
