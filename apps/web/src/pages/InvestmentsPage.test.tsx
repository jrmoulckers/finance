// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useInvestments } from '../hooks';
import { InvestmentsPage } from './InvestmentsPage';

vi.mock('../hooks', () => ({
  useInvestments: vi.fn(),
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
});
