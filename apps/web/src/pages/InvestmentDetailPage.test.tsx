// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useInvestments } from '../hooks';
import { InvestmentDetailPage } from './InvestmentDetailPage';

vi.mock('../hooks', () => ({
  useInvestments: vi.fn(),
}));

const mockedUseInvestments = vi.mocked(useInvestments);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const mockInvestment = {
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
};

function renderWithRoute(investmentId: string) {
  return render(
    <MemoryRouter initialEntries={[`/investments/${investmentId}`]}>
      <Routes>
        <Route path="/investments/:id" element={<InvestmentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InvestmentDetailPage', () => {
  beforeEach(() => {
    mockedUseInvestments.mockReturnValue({
      investments: [mockInvestment],
      summary: {
        totalValue: 195000,
        totalCostBasis: 150000,
        totalGainLoss: 45000,
        totalGainLossPercent: 30,
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
      createInvestment: vi.fn(),
      updateInvestment: vi.fn(),
      deleteInvestment: vi.fn(),
    });
  });

  it('renders investment details with symbol and name', () => {
    renderWithRoute('inv-1');

    expect(screen.getByRole('heading', { name: /AAPL/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Apple Inc./ })).toBeInTheDocument();
  });

  it('renders key metrics section', () => {
    renderWithRoute('inv-1');

    expect(screen.getByText('Market Value')).toBeInTheDocument();
    expect(screen.getByText('Cost Basis')).toBeInTheDocument();
    expect(screen.getByText('Shares')).toBeInTheDocument();
    expect(screen.getByText('Current Price')).toBeInTheDocument();
  });

  it('renders not found when investment does not exist', () => {
    renderWithRoute('inv-nonexistent');

    expect(screen.getByText('Investment not found.')).toBeInTheDocument();
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

    renderWithRoute('inv-1');

    expect(screen.getByRole('status', { name: 'Loading investment details' })).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockedUseInvestments.mockReturnValue({
      investments: [],
      summary: { totalValue: 0, totalCostBasis: 0, totalGainLoss: 0, totalGainLossPercent: 0 },
      loading: false,
      error: 'Database error',
      refresh: vi.fn(),
      createInvestment: vi.fn(),
      updateInvestment: vi.fn(),
      deleteInvestment: vi.fn(),
    });

    renderWithRoute('inv-1');

    expect(screen.getByText('Database error')).toBeInTheDocument();
  });
});
