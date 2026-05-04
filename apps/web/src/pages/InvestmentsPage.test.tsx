// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useInvestments } from '../hooks';
import { InvestmentsPage } from './InvestmentsPage';

vi.mock('../hooks', () => ({
  useInvestments: vi.fn(),
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
  beforeEach(() => {
    mockedUseInvestments.mockReturnValue({
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
    });
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

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('VTI')).toBeInTheDocument();
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

  it('renders loading state', () => {
    mockedUseInvestments.mockReturnValue({
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: true,
      error: null,
      refresh: vi.fn(),
      createInvestment: vi.fn(),
      updateInvestment: vi.fn(),
      deleteInvestment: vi.fn(),
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
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: false,
      error: 'Failed to load investments.',
      refresh,
      createInvestment: vi.fn(),
      updateInvestment: vi.fn(),
      deleteInvestment: vi.fn(),
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
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: false,
      error: null,
      refresh: vi.fn(),
      createInvestment: vi.fn(),
      updateInvestment: vi.fn(),
      deleteInvestment: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InvestmentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No investments yet')).toBeInTheDocument();
  });
});
