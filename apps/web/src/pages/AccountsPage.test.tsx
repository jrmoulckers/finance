// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyModeProvider } from '../contexts/PrivacyModeContext';
import { useAccounts } from '../hooks';
import { evaluatePrivacyScreenCoverage } from '../lib/security/privacy-screen';
import { auditPrivacySurfaceCoverage, privacySurface } from '../lib/security/privacy-coverage';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import type { Account } from '../kmp/bridge';
import { AccountsPage } from './AccountsPage';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
}));

vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({
    rates: {},
    loading: false,
    error: null,
    lastUpdated: null,
    providerName: 'Static Rates',
    isOffline: false,
    convert: vi.fn().mockResolvedValue(0),
    getRate: vi.fn(),
    setOverride: vi.fn(),
    removeOverride: vi.fn(),
    overrides: {},
    clearOverrides: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// AccountForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  AccountForm: () => null,
}));

const mockedUseAccounts = vi.mocked(useAccounts);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

/** Builds a minimal Account for net-worth rendering assertions. */
function makeMockAccount(overrides: {
  id: string;
  name: string;
  type: Account['type'];
  balance: number;
  purpose?: Account['purpose'];
  currency?: Account['currency'];
  isArchived?: boolean;
}): Account {
  return {
    id: overrides.id,
    householdId: 'household-1',
    name: overrides.name,
    type: overrides.type,
    currency: overrides.currency ?? { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: overrides.balance },
    purpose: overrides.purpose ?? 'personal',
    isArchived: overrides.isArchived ?? false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...syncMetadata,
  } as Account;
}

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
          purpose: 'personal',
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
          purpose: 'business',
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
          purpose: 'both',
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
          purpose: 'personal',
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

  it('exposes a labelled read-aloud control for total net worth when "Read amounts aloud" is enabled (#3278)', () => {
    render(
      <AccessibilityProvider initialSettings={{ speakAmounts: true }}>
        <MemoryRouter>
          <AccountsPage />
        </MemoryRouter>
      </AccessibilityProvider>,
    );

    expect(screen.getByRole('button', { name: 'Read aloud: total net worth' })).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Accounts')).toBeInTheDocument();
  });

  it('shows a content-shaped skeleton while accounts load (#3798)', () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    const skeleton = container.querySelector('.skeleton-page--accounts');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });

  it('groups accounts by purpose', () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '🏠 Personal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '💼 Business' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '🏠💼 Both' })).toBeInTheDocument();
  });

  it('displays badges for account purposes', () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Primary Checking')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText('Travel Card')).toBeInTheDocument();
    expect(screen.getAllByText('🏠 Personal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('💼 Business').length).toBeGreaterThan(0);
    expect(screen.getAllByText('🏠💼 Both').length).toBeGreaterThan(0);
  });

  it('shows net worth text', () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/net worth/i)).toBeInTheDocument();
  });

  it('computes net worth as assets minus liabilities within one workspace (issue #3202)', () => {
    // Live /accounts data from the bug report: three assets + one positive
    // credit-card balance, all in the same workspace. The top-level "Net worth"
    // total and the single workspace subtotal must both equal assets - liability.
    mockedUseAccounts.mockReturnValue({
      accounts: [
        makeMockAccount({ id: 'a-checking', name: 'Checking', type: 'CHECKING', balance: 956405 }),
        makeMockAccount({ id: 'a-savings', name: 'Savings', type: 'SAVINGS', balance: 1200000 }),
        makeMockAccount({ id: 'a-cash', name: 'Cash', type: 'CASH', balance: 7375 }),
        makeMockAccount({
          id: 'a-card',
          name: 'Credit Card',
          type: 'CREDIT_CARD',
          balance: 67299,
        }),
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });

    render(
      <PrivacyModeProvider initialValue={false}>
        <MemoryRouter>
          <AccountsPage />
        </MemoryRouter>
      </PrivacyModeProvider>,
    );

    // 9,564.05 + 12,000.00 + 73.75 - 672.99 = $20,964.81 (matches /net-worth).
    // Appears for the top-level total and the single workspace subtotal.
    expect(screen.getAllByText('$20,964.81').length).toBeGreaterThanOrEqual(2);
    // The old sign-blind sum ($22,310.79 = assets + liability) must never appear.
    expect(screen.queryByText('$22,310.79')).not.toBeInTheDocument();
  });

  it('nets liabilities across workspaces while keeping per-workspace subtotals correct', () => {
    // Assets in Personal, the credit card in Business — verifies the top-level
    // aggregate nets across workspaces and each subtotal is liability-aware.
    mockedUseAccounts.mockReturnValue({
      accounts: [
        makeMockAccount({
          id: 'a-checking',
          name: 'Checking',
          type: 'CHECKING',
          balance: 956405,
          purpose: 'personal',
        }),
        makeMockAccount({
          id: 'a-savings',
          name: 'Savings',
          type: 'SAVINGS',
          balance: 1200000,
          purpose: 'personal',
        }),
        makeMockAccount({
          id: 'a-cash',
          name: 'Cash',
          type: 'CASH',
          balance: 7375,
          purpose: 'personal',
        }),
        makeMockAccount({
          id: 'a-card',
          name: 'Credit Card',
          type: 'CREDIT_CARD',
          balance: 67299,
          purpose: 'business',
        }),
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });

    render(
      <PrivacyModeProvider initialValue={false}>
        <MemoryRouter>
          <AccountsPage />
        </MemoryRouter>
      </PrivacyModeProvider>,
    );

    // Top-level net worth still nets to $20,964.81.
    expect(screen.getByText('$20,964.81')).toBeInTheDocument();
    // Personal subtotal = 9,564.05 + 12,000.00 + 73.75 = $21,637.80 (assets only).
    expect(screen.getByText('$21,637.80')).toBeInTheDocument();
    // Business subtotal is the lone credit card, shown as a negative contribution.
    expect(screen.getByText('-$672.99')).toBeInTheDocument();
    // The inflated figure must never appear anywhere on the page.
    expect(screen.queryByText('$22,310.79')).not.toBeInTheDocument();
  });

  it('shows multi-currency indicator when accounts have different currencies', async () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-usd',
          householdId: 'household-1',
          name: 'USD Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 150000 },
          purpose: 'personal',
          isArchived: false,
          sortOrder: 1,
          icon: null,
          color: null,
          ...syncMetadata,
        },
        {
          id: 'account-eur',
          householdId: 'household-1',
          name: 'EUR Savings',
          type: 'CHECKING',
          currency: { code: 'EUR', decimalPlaces: 2 },
          currentBalance: { amount: 120000 },
          purpose: 'business',
          isArchived: false,
          sortOrder: 2,
          icon: null,
          color: null,
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

    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getAllByText(/multiple currencies/i).length).toBeGreaterThan(0),
    );
  });

  it('does not show multi-currency indicator when all accounts use the same currency', () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/multiple currencies/i)).not.toBeInTheDocument();
  });

  it('covers account balances and net worth when privacy screen is active and reveals them when inactive', async () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-usd',
          householdId: 'household-1',
          name: 'USD Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 150000 },
          purpose: 'personal',
          isArchived: false,
          sortOrder: 1,
          icon: null,
          color: null,
          ...syncMetadata,
        },
        {
          id: 'account-eur',
          householdId: 'household-1',
          name: 'EUR Savings',
          type: 'CHECKING',
          currency: { code: 'EUR', decimalPlaces: 2 },
          currentBalance: { amount: 120000 },
          purpose: 'business',
          isArchived: false,
          sortOrder: 2,
          icon: null,
          color: null,
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

    const renderAccounts = (initialValue: boolean) =>
      render(
        <PrivacyModeProvider initialValue={initialValue}>
          <MemoryRouter>
            <AccountsPage />
          </MemoryRouter>
        </PrivacyModeProvider>,
      );

    const active = renderAccounts(true);
    const activeText = document.body.textContent ?? '';
    const screenCoverage = evaluatePrivacyScreenCoverage([
      {
        id: 'accounts.net-worth-mixed-currency',
        categories: ['net-worth'],
        masked: !activeText.includes('$1,500.00') && !activeText.includes('€1,200.00'),
      },
      {
        id: 'accounts.account-balances',
        categories: ['balance'],
        masked: !activeText.includes('$1,500.00') && !activeText.includes('€1,200.00'),
      },
    ]);
    const manifestCoverage = auditPrivacySurfaceCoverage(
      [
        privacySurface('accounts.net-worth', 'dashboard', ['net-worth'], 'masked'),
        privacySurface('accounts.account-balances', 'detail', ['balance'], 'masked'),
      ],
      ['dashboard', 'detail'],
    );

    await waitFor(() =>
      expect(screen.getAllByText(/multiple currencies/i).length).toBeGreaterThan(0),
    );

    expect(screenCoverage.safe).toBe(true);
    expect(manifestCoverage.complete).toBe(true);
    expect(screen.getAllByLabelText('Amount hidden').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByLabelText('Total: Amount hidden').length).toBeGreaterThan(0);

    active.unmount();
    window.localStorage.clear();

    renderAccounts(false);
    await waitFor(() =>
      expect(screen.getAllByText(/multiple currencies/i).length).toBeGreaterThan(0),
    );
    expect(document.body).toHaveTextContent('$1,500.00');
    expect(document.body).toHaveTextContent('€1,200.00');
  });
});
