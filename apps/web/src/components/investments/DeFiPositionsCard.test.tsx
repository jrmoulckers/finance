// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DeFiPositionsCard } from './DeFiPositionsCard';
import type { DefiPositionEntry } from '../../lib/assets/defi-positions-types';

const TEST_KEY = 'test.defiPositions';

/** Stub matchMedia so any prefers-* checks in child components don't throw. */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

const lockedStaking: DefiPositionEntry = {
  id: 'lido-1',
  protocol: 'Lido',
  chain: 'ethereum',
  kind: 'STAKING',
  label: 'stETH staking',
  principalValueCents: 1_000_000,
  lockState: 'LOCKED',
  apyPercent: 4.2,
  rewards: [{ token: 'stETH', quantity: 0.1, valueCents: 30_000 }],
  valuationAsOf: '2025-06-01',
};

describe('DeFiPositionsCard', () => {
  it('renders the heading and an empty state when there are no positions', () => {
    render(<DeFiPositionsCard spotLiquidValueCents={0} storageKey={TEST_KEY} />);

    expect(screen.getByRole('heading', { name: /DeFi & Locked Positions/i })).toBeInTheDocument();
    expect(screen.getByText('No DeFi positions yet')).toBeInTheDocument();
    // The add form is always available.
    expect(screen.getByRole('button', { name: 'Add position' })).toBeInTheDocument();
  });

  it('shows a liquid-vs-locked split blending spot holdings with DeFi positions', () => {
    render(
      <DeFiPositionsCard
        spotLiquidValueCents={0}
        storageKey={TEST_KEY}
        initialPositions={[lockedStaking]}
      />,
    );

    // 0 spot + a single locked position => 100% locked, 0% liquid.
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    // Total locked value = principal 1,000,000 + rewards 30,000 = 1,030,000 cents.
    expect(screen.getAllByText('$10,300.00').length).toBeGreaterThan(0);
  });

  it('renders the position with protocol, chain, type, lock state, APY, and rewards', () => {
    render(
      <DeFiPositionsCard
        spotLiquidValueCents={2_000_000}
        storageKey={TEST_KEY}
        initialPositions={[lockedStaking]}
      />,
    );

    expect(screen.getByText('stETH staking')).toBeInTheDocument();
    expect(screen.getAllByText('Lido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Staking').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
    expect(screen.getByText('4.2%')).toBeInTheDocument();
    // By-protocol and by-chain rollups render as captioned tables.
    expect(screen.getByText('Exposure by protocol')).toBeInTheDocument();
    expect(screen.getByText('Exposure by chain')).toBeInTheDocument();
  });

  it('flags pending reward value for income / tax classification', () => {
    render(
      <DeFiPositionsCard
        spotLiquidValueCents={0}
        storageKey={TEST_KEY}
        initialPositions={[lockedStaking]}
      />,
    );

    expect(screen.getByText(/flagged for income \/ tax classification/i)).toBeInTheDocument();
    expect(screen.getByText(/ordinary income at fair-market value/i)).toBeInTheDocument();
  });

  it('adds a position through the accessible form', () => {
    render(<DeFiPositionsCard spotLiquidValueCents={0} storageKey={TEST_KEY} />);

    fireEvent.change(screen.getByLabelText('Protocol'), { target: { value: 'Aave' } });
    fireEvent.change(screen.getByLabelText('Principal value ($)'), {
      target: { value: '5000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add position' }));

    // Default label becomes "<protocol> <kind label>" => "Aave Staking".
    expect(screen.getByText('Aave Staking')).toBeInTheDocument();
    expect(screen.queryByText('No DeFi positions yet')).not.toBeInTheDocument();
  });

  it('persists added positions to localStorage under the provided key', () => {
    render(<DeFiPositionsCard spotLiquidValueCents={0} storageKey={TEST_KEY} />);

    fireEvent.change(screen.getByLabelText('Protocol'), { target: { value: 'Curve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add position' }));

    const raw = window.localStorage.getItem(TEST_KEY);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw ?? '[]') as DefiPositionEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0].protocol).toBe('Curve');
  });

  it('removes a position with its labelled remove button', () => {
    render(
      <DeFiPositionsCard
        spotLiquidValueCents={0}
        storageKey={TEST_KEY}
        initialPositions={[lockedStaking]}
      />,
    );

    expect(screen.getByText('stETH staking')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove stETH staking on Lido' }));

    expect(screen.queryByText('stETH staking')).not.toBeInTheDocument();
    expect(screen.getByText('No DeFi positions yet')).toBeInTheDocument();
  });

  it('exposes accessible table captions and a positions table', () => {
    render(
      <DeFiPositionsCard
        spotLiquidValueCents={0}
        storageKey={TEST_KEY}
        initialPositions={[lockedStaking]}
      />,
    );

    const positionsTable = screen
      .getByText(/DeFi positions with protocol, chain, type/i)
      .closest('table');
    expect(positionsTable).not.toBeNull();
    if (positionsTable) {
      expect(within(positionsTable).getByText('stETH staking')).toBeInTheDocument();
    }
  });
});
