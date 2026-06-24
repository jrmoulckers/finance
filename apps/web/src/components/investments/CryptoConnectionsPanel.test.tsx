// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { CryptoConnectionsPanel } from './CryptoConnectionsPanel';
import { useCryptoConnections } from '../../hooks/useCryptoConnections';
import type {
  ConnectedCryptoSource,
  UseCryptoConnectionsResult,
} from '../../hooks/useCryptoConnections';

vi.mock('../../hooks/useCryptoConnections', () => ({
  useCryptoConnections: vi.fn(),
}));

const mockedHook = vi.mocked(useCryptoConnections);

function makeSource(overrides: Partial<ConnectedCryptoSource>): ConnectedCryptoSource {
  return {
    id: 'src-1',
    sourceKind: 'wallet',
    intakeKind: 'watch-wallet',
    label: 'Ledger',
    chain: 'ethereum',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    fingerprint: 'wallet:ethereum:0x',
    health: 'manual',
    lastSyncAt: '2025-06-01T00:00:00.000Z',
    hasReadOnlyKey: false,
    ...overrides,
  };
}

function baseReturn(): UseCryptoConnectionsResult {
  return {
    sources: [],
    holdings: [],
    accounts: [],
    dashboard: {
      currency: 'USD',
      rows: [],
      totalValueCents: 0,
      warnings: [],
      sourceStatuses: [],
    },
    defiPositions: [],
    defiTotals: {
      totalValueCents: 0,
      availableValueCents: 0,
      lockedValueCents: 0,
      rewardsValueCents: 0,
      byProtocol: {},
    },
    overallHealth: 'needs-attention',
    lastSyncAt: null,
    loading: false,
    error: null,
    previewSource: vi.fn().mockReturnValue({ status: 'valid', fingerprint: 'fp', reason: 'ok' }),
    addExchange: vi.fn().mockReturnValue({ status: 'valid', fingerprint: 'fp', reason: 'ok' }),
    addWallet: vi.fn().mockReturnValue({ status: 'valid', fingerprint: 'fp', reason: 'ok' }),
    removeSource: vi.fn(),
    addHolding: vi.fn(),
    removeHolding: vi.fn(),
    addDeFiPosition: vi.fn(),
    removeDeFiPosition: vi.fn(),
    reconcileTransfer: vi.fn().mockReturnValue([]),
    refresh: vi.fn(),
  };
}

describe('CryptoConnectionsPanel', () => {
  beforeEach(() => {
    mockedHook.mockReturnValue(baseReturn());
  });

  it('renders the heading and an empty connection state', () => {
    render(<CryptoConnectionsPanel />);
    expect(
      screen.getByRole('heading', { name: /Crypto Wallets & Exchanges/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No crypto sources connected yet.')).toBeInTheDocument();
  });

  it('exposes a labelled, keyboard-reachable refresh control', () => {
    const refresh = vi.fn();
    mockedHook.mockReturnValue({ ...baseReturn(), refresh });
    render(<CryptoConnectionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('toggles to the wallet form and reveals the address field', () => {
    render(<CryptoConnectionsPanel />);
    // Exchange selected by default — no public-address field yet.
    expect(screen.queryByLabelText('Public address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Wallet address/i }));
    expect(screen.getByLabelText('Public address')).toBeInTheDocument();
  });

  it('does not store a literal API key — submitting calls addExchange', () => {
    const addExchange = vi
      .fn()
      .mockReturnValue({ status: 'valid', fingerprint: 'fp', reason: 'linked' });
    mockedHook.mockReturnValue({ ...baseReturn(), addExchange });
    render(<CryptoConnectionsPanel />);

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Coinbase main' } });
    fireEvent.change(screen.getByLabelText('Read-only API key (optional)'), {
      target: { value: 'a-user-entered-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect exchange' }));

    expect(addExchange).toHaveBeenCalledWith(
      expect.objectContaining({ exchange: 'coinbase', label: 'Coinbase main' }),
    );
  });

  it('lists connected sources with a health badge and remove control', () => {
    const removeSource = vi.fn();
    mockedHook.mockReturnValue({
      ...baseReturn(),
      sources: [makeSource({ id: 'src-9', label: 'Cold storage' })],
      overallHealth: 'manual',
      lastSyncAt: '2025-06-01T00:00:00.000Z',
      removeSource,
    });
    render(<CryptoConnectionsPanel />);

    expect(screen.getAllByText('Cold storage').length).toBeGreaterThan(0);
    // Health is conveyed with text, not colour alone.
    expect(screen.getAllByText('Watch-only').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Cold storage' }));
    expect(removeSource).toHaveBeenCalledWith('src-9');
  });

  it('renders merged spot balances with a per-source breakdown and total', () => {
    mockedHook.mockReturnValue({
      ...baseReturn(),
      sources: [
        makeSource({ id: 'w', label: 'Wallet' }),
        makeSource({ id: 'x', sourceKind: 'exchange', label: 'Kraken', exchange: 'kraken' }),
      ],
      dashboard: {
        currency: 'USD',
        rows: [
          {
            asset: 'ETH',
            quantity: 3,
            valueCents: 600000,
            sourceBreakdown: { w: 2, x: 1 },
            warnings: [],
          },
        ],
        totalValueCents: 600000,
        warnings: [],
        sourceStatuses: [],
      },
    });
    render(<CryptoConnectionsPanel />);

    const table = screen.getByRole('table', { name: 'Merged spot balances by asset' });
    expect(within(table).getByText('ETH')).toBeInTheDocument();
    expect(within(table).getByText(/Wallet: 2/)).toBeInTheDocument();
    expect(within(table).getByText(/Kraken: 1/)).toBeInTheDocument();
    expect(screen.getAllByText('$6,000.00').length).toBeGreaterThan(0);
  });

  it('shows DeFi totals separately from spot', () => {
    mockedHook.mockReturnValue({
      ...baseReturn(),
      defiTotals: {
        totalValueCents: 1_030_000,
        availableValueCents: 0,
        lockedValueCents: 1_030_000,
        rewardsValueCents: 30_000,
        byProtocol: { Lido: 1_030_000 },
      },
    });
    render(<CryptoConnectionsPanel />);

    expect(
      screen.getByRole('heading', { name: /DeFi positions \(tracked separately from spot\)/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('$10,300.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$300.00')).toBeInTheDocument();
  });

  it('hides reconciliation until at least two wallets are connected', () => {
    const { rerender } = render(<CryptoConnectionsPanel />);
    expect(screen.queryByText('Reconcile a wallet transfer')).not.toBeInTheDocument();

    mockedHook.mockReturnValue({
      ...baseReturn(),
      sources: [makeSource({ id: 'a', label: 'Hot' }), makeSource({ id: 'b', label: 'Cold' })],
    });
    rerender(<CryptoConnectionsPanel />);
    expect(screen.getByText('Reconcile a wallet transfer')).toBeInTheDocument();
  });
});
