// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CryptoTaxableEventsReport } from './CryptoTaxableEventsReport';
import type {
  CryptoAirdropEvent,
  CryptoBridgeEvent,
  CryptoSwapEvent,
  CryptoTaxLot,
} from '../../lib/assets';

const ethLot: CryptoTaxLot = {
  id: 'eth-1',
  symbol: 'ETH',
  quantity: 1,
  acquisitionDate: '2021-01-01',
  costBasisCents: 100000, // $1,000 basis
  source: 'WALLET',
  chain: 'ethereum',
};

describe('CryptoTaxableEventsReport', () => {
  it('renders an empty state when there are no events', () => {
    render(<CryptoTaxableEventsReport events={[]} />);
    expect(screen.getByText(/no swaps, bridges, or airdrops recorded yet/i)).toBeInTheDocument();
  });

  it('shows a swap as a taxable event with a realized gain', () => {
    const swap: CryptoSwapEvent = {
      id: 'swap-1',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 2000,
      fairMarketValueCents: 200000, // $2,000 proceeds → $1,000 gain
    };

    render(<CryptoTaxableEventsReport events={[swap]} openingLots={[ethLot]} />);

    expect(screen.getByText('Crypto taxable events (FIFO)')).toBeInTheDocument();
    expect(screen.getByText('Swap')).toBeInTheDocument();
    expect(screen.getByText('Taxable')).toBeInTheDocument();
    expect(screen.getByText('ethereum')).toBeInTheDocument();
    // $1,000.00 gain appears in the summary and the event row.
    expect(screen.getAllByText(/1,000\.00/).length).toBeGreaterThan(0);
  });

  it('labels a bridge as non-taxable', () => {
    const bridge: CryptoBridgeEvent = {
      id: 'bridge-1',
      type: 'BRIDGE',
      date: '2024-06-01',
      symbol: 'ETH',
      quantity: 1,
      fromChain: 'ethereum',
      toChain: 'arbitrum',
    };

    render(<CryptoTaxableEventsReport events={[bridge]} openingLots={[ethLot]} />);

    expect(screen.getByText('Bridge')).toBeInTheDocument();
    expect(screen.getByText('Non-taxable')).toBeInTheDocument();
    expect(screen.getByText('arbitrum')).toBeInTheDocument();
  });

  it('shows airdrop ordinary income', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air-1',
      type: 'AIRDROP',
      date: '2024-06-01',
      chain: 'optimism',
      symbol: 'OP',
      quantity: 100,
      fairMarketValueCents: 50000, // $500 FMV income
    };

    render(<CryptoTaxableEventsReport events={[airdrop]} />);

    expect(screen.getByText('Airdrop')).toBeInTheDocument();
    expect(screen.getByText('Taxable')).toBeInTheDocument();
    expect(screen.getAllByText(/500\.00/).length).toBeGreaterThan(0);
  });

  it('reflects the lot-matching method in the heading', () => {
    const swap: CryptoSwapEvent = {
      id: 'swap-hifo',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 2000,
      fairMarketValueCents: 200000,
    };

    render(<CryptoTaxableEventsReport events={[swap]} openingLots={[ethLot]} method="HIFO" />);
    expect(screen.getByText('Crypto taxable events (HIFO)')).toBeInTheDocument();
  });
});
