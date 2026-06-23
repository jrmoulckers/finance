// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for LivePnlPage. Mocks the useLivePnl hook (not repositories) per
 * project conventions.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LivePnlPage } from './LivePnlPage';
import { buildLivePnlView } from '../lib/investment';
import type { BaseAccountBalance, IntradayPosition, QuoteSnapshot } from '../lib/investment';

vi.mock('../hooks/useLivePnl', () => ({ useLivePnl: vi.fn() }));

import { useLivePnl } from '../hooks/useLivePnl';

const mockUseLivePnl = vi.mocked(useLivePnl);

const NOW = '2026-01-02T15:00:00.000Z';

const positions: IntradayPosition[] = [
  {
    accountId: 'acct-a',
    brokerage: 'Alpha',
    symbol: 'VTI',
    assetClass: 'equity',
    quantity: 10,
    previousCloseCents: 100_00,
    costBasisCents: 900_00,
    currency: 'USD',
  },
];
const baseAccounts: BaseAccountBalance[] = [
  {
    accountId: 'cash-1',
    label: 'Checking',
    assetClass: 'cash',
    balanceCents: 2000_00,
    currency: 'USD',
  },
];
const quote: QuoteSnapshot = {
  symbol: 'VTI',
  assetKind: 'equity',
  priceCents: 110_00,
  currency: 'USD',
  asOf: NOW,
  source: 'manual',
  marketSession: 'open',
};

const sampleView = buildLivePnlView({
  positions,
  quotes: [quote],
  baseAccounts,
  now: NOW,
  currency: 'USD',
  lastUpdated: NOW,
});

describe('LivePnlPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while data loads', () => {
    mockUseLivePnl.mockReturnValue({
      view: null,
      loading: true,
      error: null,
      isLive: false,
      lastUpdated: null,
      refresh: vi.fn(),
    });
    render(<LivePnlPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an empty state when there are no positions', () => {
    mockUseLivePnl.mockReturnValue({
      view: null,
      loading: false,
      error: null,
      isLive: false,
      lastUpdated: null,
      refresh: vi.fn(),
    });
    render(<LivePnlPage />);
    expect(screen.getByText('No positions to track')).toBeInTheDocument();
  });

  it('renders the dashboard when a view is available', () => {
    mockUseLivePnl.mockReturnValue({
      view: sampleView,
      loading: false,
      error: null,
      isLive: true,
      lastUpdated: NOW,
      refresh: vi.fn(),
    });
    render(<LivePnlPage />);
    expect(screen.getByRole('heading', { name: /Live P&L & Net Worth/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Total net worth')).toBeInTheDocument();
  });
});
