// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useInvestments, useAccounts } from '../hooks';
import { InvestmentsPage } from './InvestmentsPage';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';

vi.mock('../hooks', () => ({
  useInvestments: vi.fn(),
  useAccounts: vi.fn(() => ({ accounts: [] })),
  useDisplayCurrency: vi.fn(() => ({
    displayCurrency: 'USD',
    setDisplayCurrency: vi.fn(),
    supportedCurrencies: [],
  })),
}));

vi.mock('../components/DataExport', () => ({
  DataExport: () => <div data-testid="data-export" />,
}));

vi.mock('../components/investments/InvestmentProjections', () => ({
  InvestmentProjections: () => <div data-testid="investment-projections" />,
}));

// Recharts uses DOM measurements that aren't available in jsdom.
// Stub it out to avoid rendering errors.
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

const mockedUseInvestments = vi.mocked(useInvestments);
const mockedUseAccounts = vi.mocked(useAccounts);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const mockInvestments = [
  {
    id: 'inv-1',
    householdId: 'household-1',
    accountId: 'account-1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    type: 'STOCK' as const,
    shares: 10,
    costBasisPerShare: { amount: 15000 },
    currentPricePerShare: { amount: 19500 },
    currency: { code: 'USD', decimalPlaces: 2 },
    lastPriceUpdate: '2025-01-15T10:00:00Z',
    ...syncMetadata,
  },
  {
    id: 'inv-2',
    householdId: 'household-1',
    accountId: 'account-1',
    symbol: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    type: 'ETF' as const,
    shares: 25,
    costBasisPerShare: { amount: 22000 },
    currentPricePerShare: { amount: 24500 },
    currency: { code: 'USD', decimalPlaces: 2 },
    lastPriceUpdate: '2025-01-15T10:00:00Z',
    ...syncMetadata,
  },
];

describe('InvestmentsPage', () => {
  const baseMockReturn = {
    investments: mockInvestments,
    summary: {
      totalValue: 807500,
      totalCostBasis: 700000,
      totalGainLoss: 107500,
      totalGainLossPercent: 15.36,
    },
    displayCurrency: 'USD',
    isConverted: false,
    hasStaleRates: false,
    unconvertedCurrencies: [],
    conversionDisclosure: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createInvestment: vi.fn(),
    updateInvestment: vi.fn(),
    deleteInvestment: vi.fn(),
    getLots: vi.fn().mockReturnValue([]),
    createLot: vi.fn(),
    updateLot: vi.fn(),
    deleteLot: vi.fn(),
    computeAllocationAnalysis: vi.fn().mockReturnValue({
      totalPortfolioValue: 807500,
      comparisons: [],
      isTargetValid: true,
    }),
    computeFeeAnalysis: vi.fn().mockReturnValue({
      summary: { totalValue: 0, weightedExpenseRatioBps: 0, totalAnnualFees: 0, fundFees: [] },
      projections: [],
      comparisons: [],
    }),
  };

  beforeEach(() => {
    window.localStorage.clear();
    mockedUseInvestments.mockReturnValue(baseMockReturn);
    mockedUseAccounts.mockReturnValue({ accounts: [] } as unknown as ReturnType<typeof useAccounts>);
  });

  it('exposes a labelled read-aloud control for total portfolio value when "Read amounts aloud" is enabled (#3278)', () => {
    render(
      <AccessibilityProvider initialSettings={{ speakAmounts: true }}>
        <MemoryRouter>
          <InvestmentsPage />
        </MemoryRouter>
      </AccessibilityProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Read aloud: total portfolio value' }),
    ).toBeInTheDocument();
  });

  it('renders portfolio summary with total value', () => {
    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Investments')).toBeInTheDocument();
    expect(screen.getByText('Total Value')).toBeInTheDocument();
    expect(screen.getByText('Cost Basis')).toBeInTheDocument();
    expect(screen.getByText('Holdings')).toBeInTheDocument();
  });

  it('converts the summary into the display currency and discloses the conversion (#3239)', () => {
    mockedUseInvestments.mockReturnValue({
      ...baseMockReturn,
      summary: {
        totalValue: 500000,
        totalCostBasis: 400000,
        totalGainLoss: 100000,
        totalGainLossPercent: 25,
      },
      displayCurrency: 'EUR',
      isConverted: true,
      conversionDisclosure: 'Converted GBP to EUR. Some rates may be stale or offline.',
    });

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    // The summary total renders in the display currency (EUR), never hardcoded USD.
    expect(screen.getByText('€5,000.00')).toBeInTheDocument();
    expect(
      screen.getByText('Converted GBP to EUR. Some rates may be stale or offline.'),
    ).toBeInTheDocument();
  });

  it('omits the conversion disclosure for a single-currency portfolio', () => {
    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Converted /)).not.toBeInTheDocument();
  });

  it('renders holdings table with investment symbols', () => {
    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getAllByText('VTI').length).toBeGreaterThan(0);
    expect(screen.getByText('Vanguard Total Stock Market ETF')).toBeInTheDocument();
  });

  it('renders the asset allocation section', () => {
    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Asset Allocation')).toBeInTheDocument();
  });

  it('renders the compound-growth projection section', () => {
    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('investment-projections')).toBeInTheDocument();
  });

  it('renders investing beta sections with accessible table fallbacks', () => {
    window.localStorage.setItem(
      'finance.investingBeta.cashAvailableCents.v1',
      JSON.stringify(100000),
    );

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Investing Beta Toolkit')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'By asset class' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Rebalancing suggestions' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Manual dividend assumptions' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Lot-level cost basis' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Expense ratio inputs and comparison' }),
    ).toBeInTheDocument();
  });

  it('hydrates investing beta inputs from local storage', () => {
    window.localStorage.setItem(
      'finance.investingBeta.cashAvailableCents.v1',
      JSON.stringify(100000),
    );

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('New cash available')).toHaveValue(1000);
  });

  it('renders loading state', () => {
    mockedUseInvestments.mockReturnValue({
      ...baseMockReturn,
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Loading investments' })).toBeInTheDocument();
  });

  it('renders error state with retry', () => {
    const refresh = vi.fn();
    mockedUseInvestments.mockReturnValue({
      ...baseMockReturn,
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: false,
      error: 'Failed to load investments.',
      refresh,
    });

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Failed to load investments.')).toBeInTheDocument();
  });

  it('renders empty state when no investments exist', () => {
    mockedUseInvestments.mockReturnValue({
      ...baseMockReturn,
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No investments yet')).toBeInTheDocument();
  });

  it('attributes holdings to their owning account/brokerage (#3262)', () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [
        { id: 'account-1', name: 'Fidelity Brokerage' },
      ],
    } as unknown as ReturnType<typeof useAccounts>);

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('columnheader', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getAllByText('Fidelity Brokerage').length).toBeGreaterThan(0);
  });

  it('rolls holdings up across accounts when grouping by symbol (#3262)', () => {
    mockedUseInvestments.mockReturnValue({
      ...baseMockReturn,
      investments: [
        { ...mockInvestments[0], id: 'inv-1', accountId: 'account-1' },
        { ...mockInvestments[0], id: 'inv-3', accountId: 'account-2' },
      ],
    });

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    // Two AAPL positions in separate accounts render as two detail rows first.
    expect(screen.getAllByTestId('holding-row')).toHaveLength(2);

    fireEvent.click(screen.getByLabelText(/group by symbol/i));

    // After rolling up, a single consolidated AAPL line remains.
    const rows = screen.getAllByTestId('holding-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByText('2 accounts')).toBeInTheDocument();
  });
});
