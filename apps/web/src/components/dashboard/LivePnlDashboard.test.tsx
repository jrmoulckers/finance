// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for LivePnlDashboard.
 *
 * Verifies live-update rendering (re-render reflects new prices) and that
 * gain/loss is never conveyed by colour alone (glyph + sign + text label).
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LivePnlDashboard } from './LivePnlDashboard';
import { buildLivePnlView } from '../../lib/investment';
import type { BaseAccountBalance, IntradayPosition, QuoteSnapshot } from '../../lib/investment';

const NOW = '2026-01-02T15:00:00.000Z';
const nowMs = () => new Date(NOW).getTime();

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

function quote(priceCents: number, asOf = '2026-01-02T14:59:50.000Z'): QuoteSnapshot {
  return {
    symbol: 'VTI',
    assetKind: 'equity',
    priceCents,
    currency: 'USD',
    asOf,
    source: 'manual',
    marketSession: 'open',
  };
}

function viewFor(priceCents: number, lastUpdated = NOW) {
  return buildLivePnlView({
    positions,
    quotes: [quote(priceCents)],
    baseAccounts,
    now: NOW,
    currency: 'USD',
    lastUpdated,
  });
}

describe('LivePnlDashboard', () => {
  it('renders headline metrics and cross-broker breakdown tables', () => {
    render(<LivePnlDashboard view={viewFor(110_00)} isLive onRefresh={() => {}} now={nowMs} />);

    expect(screen.getByRole('heading', { name: /Live P&L & Net Worth/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Total net worth')).toBeInTheDocument();
    expect(screen.getByLabelText("Today's profit and loss")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'By Brokerage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'By Asset Class' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'By Symbol' })).toBeInTheDocument();
    // Table semantics with scoped headers.
    expect(screen.getAllByRole('columnheader', { name: 'Day P&L' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('rowheader', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('conveys gain/loss with text + glyph, not colour alone', () => {
    const { container } = render(
      <LivePnlDashboard view={viewFor(110_00)} isLive onRefresh={() => {}} now={nowMs} />,
    );
    // Direction text tag is present on the headline figures.
    expect(screen.getAllByText('gain').length).toBeGreaterThan(0);
    // Shape glyph rendered as redundant cue.
    expect(container.textContent).toContain('▲');
    // Accessible direction label exists.
    expect(screen.getByLabelText("today's profit and loss: up")).toBeInTheDocument();
  });

  it('updates rendered P&L when a new view (live price) arrives', () => {
    const { rerender } = render(
      <LivePnlDashboard view={viewFor(110_00)} isLive onRefresh={() => {}} now={nowMs} />,
    );
    const dayCard = screen.getByLabelText("Today's profit and loss");
    expect(within(dayCard).getByText('gain')).toBeInTheDocument();

    // Price drops below previous close → loss.
    rerender(<LivePnlDashboard view={viewFor(95_00)} isLive onRefresh={() => {}} now={nowMs} />);
    expect(within(dayCard).getByText('loss')).toBeInTheDocument();
  });

  it('shows the freshness status and last-updated time', () => {
    render(<LivePnlDashboard view={viewFor(110_00)} isLive onRefresh={() => {}} now={nowMs} />);
    expect(screen.getByRole('status', { name: /Market data status: Live/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Updated/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Streaming')).toBeInTheDocument();
  });

  it('flags stale symbols in the breakdown table', () => {
    const staleView = buildLivePnlView({
      positions,
      quotes: [quote(110_00, '2026-01-02T12:00:00.000Z')], // hours old → stale
      baseAccounts,
      now: NOW,
      currency: 'USD',
      lastUpdated: NOW,
    });
    render(<LivePnlDashboard view={staleView} isLive onRefresh={() => {}} now={nowMs} />);
    expect(screen.getByText(/⚠ stale/)).toBeInTheDocument();
  });

  it('invokes onRefresh when the refresh button is pressed', () => {
    const onRefresh = vi.fn();
    render(<LivePnlDashboard view={viewFor(110_00)} isLive onRefresh={onRefresh} now={nowMs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders an error alert and a paused indicator when not live', () => {
    render(
      <LivePnlDashboard
        view={viewFor(110_00)}
        isLive={false}
        error="feed down"
        onRefresh={() => {}}
        now={nowMs}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('feed down');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});
