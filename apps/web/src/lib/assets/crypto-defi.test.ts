// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  processCryptoEvent,
  processCryptoEvents,
  summarizeCryptoEvents,
  toAirdropIncome,
} from './crypto-defi';
import type { CryptoAirdropEvent, CryptoBridgeEvent, CryptoSwapEvent, CryptoTaxLot } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** $1,000.00 of ETH acquired long ago on Ethereum (long-term when disposed). */
const ethLotLongTerm: CryptoTaxLot = {
  id: 'eth-1',
  symbol: 'ETH',
  quantity: 1,
  acquisitionDate: '2021-01-01',
  costBasisCents: 100000,
  source: 'WALLET',
  chain: 'ethereum',
};

// ---------------------------------------------------------------------------
// Swaps — taxable disposal + acquisition
// ---------------------------------------------------------------------------

describe('processCryptoEvent — SWAP', () => {
  it('treats a swap as a taxable disposal with a long-term gain', () => {
    const swap: CryptoSwapEvent = {
      id: 'swap-1',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 2000,
      fairMarketValueCents: 200000, // $2,000 proceeds
    };

    const { eventResult, lots } = processCryptoEvent([ethLotLongTerm], swap, 'FIFO');

    expect(eventResult.taxable).toBe(true);
    expect(eventResult.disposal).not.toBeNull();
    // gain = 200000 proceeds - 100000 basis = 100000, all long-term
    expect(eventResult.realizedGainLossCents).toBe(100000);
    expect(eventResult.longTermGainLossCents).toBe(100000);
    expect(eventResult.shortTermGainLossCents).toBe(0);
    expect(eventResult.disposal?.matchedLots[0].chain).toBe('ethereum');

    // ETH lot consumed; new USDC lot acquired at FMV basis
    expect(eventResult.consumedLotIds).toEqual(['eth-1']);
    const usdc = lots.find((l) => l.symbol === 'USDC');
    expect(usdc?.costBasisCents).toBe(200000);
    expect(usdc?.quantity).toBe(2000);
    expect(usdc?.chain).toBe('ethereum');
    expect(lots.some((l) => l.symbol === 'ETH')).toBe(false);
  });

  it('records a realized loss when FMV is below basis', () => {
    const swap: CryptoSwapEvent = {
      id: 'swap-loss',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'DAI',
      toQuantity: 600,
      fairMarketValueCents: 60000, // $600 proceeds, below $1,000 basis
    };

    const { eventResult } = processCryptoEvent([ethLotLongTerm], swap, 'FIFO');
    expect(eventResult.realizedGainLossCents).toBe(-40000);
    expect(eventResult.longTermGainLossCents).toBe(-40000);
  });

  it('classifies a short-term gain when held one year or less', () => {
    const shortLot: CryptoTaxLot = {
      ...ethLotLongTerm,
      id: 'eth-short',
      acquisitionDate: '2024-01-01',
    };
    const swap: CryptoSwapEvent = {
      id: 'swap-short',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 1500,
      fairMarketValueCents: 150000,
    };

    const { eventResult } = processCryptoEvent([shortLot], swap, 'FIFO');
    expect(eventResult.shortTermGainLossCents).toBe(50000);
    expect(eventResult.longTermGainLossCents).toBe(0);
    expect(eventResult.disposal?.matchedLots[0].isLongTerm).toBe(false);
  });

  it('capitalizes a network fee into the acquired asset basis', () => {
    const swap: CryptoSwapEvent = {
      id: 'swap-fee',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 2000,
      fairMarketValueCents: 200000,
      feeCents: 1500, // $15 gas
    };

    const { lots } = processCryptoEvent([ethLotLongTerm], swap, 'FIFO');
    const usdc = lots.find((l) => l.symbol === 'USDC');
    expect(usdc?.costBasisCents).toBe(201500);
  });

  it('consumes multiple lots (FIFO) on a partial-lot disposal', () => {
    const lotA: CryptoTaxLot = {
      id: 'a',
      symbol: 'ETH',
      quantity: 1,
      acquisitionDate: '2021-01-01', // long-term
      costBasisCents: 100000,
      source: 'WALLET',
      chain: 'ethereum',
    };
    const lotB: CryptoTaxLot = {
      id: 'b',
      symbol: 'ETH',
      quantity: 1,
      acquisitionDate: '2024-03-01', // short-term
      costBasisCents: 100000,
      source: 'WALLET',
      chain: 'ethereum',
    };

    const swap: CryptoSwapEvent = {
      id: 'swap-multi',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1.5,
      toSymbol: 'USDC',
      toQuantity: 3000,
      fairMarketValueCents: 300000, // $2,000/ETH
    };

    const { eventResult, lots } = processCryptoEvent([lotA, lotB], swap, 'FIFO');

    expect(eventResult.disposal?.matchedLots).toHaveLength(2);
    // lotA fully used (long-term): proceeds 200000 - basis 100000 = 100000
    expect(eventResult.longTermGainLossCents).toBe(100000);
    // lotB 0.5 used (short-term): proceeds 100000 - basis 50000 = 50000
    expect(eventResult.shortTermGainLossCents).toBe(50000);
    expect(eventResult.realizedGainLossCents).toBe(150000);

    // lotA gone, lotB reduced to 0.5 with halved basis
    expect(eventResult.consumedLotIds).toEqual(['a']);
    const leftover = lots.find((l) => l.id === 'b');
    expect(leftover?.quantity).toBeCloseTo(0.5, 9);
    expect(leftover?.costBasisCents).toBe(50000);
  });

  it('selects the highest-cost lot first under HIFO', () => {
    const cheap: CryptoTaxLot = {
      id: 'cheap',
      symbol: 'ETH',
      quantity: 1,
      acquisitionDate: '2021-01-01',
      costBasisCents: 50000,
      source: 'WALLET',
      chain: 'ethereum',
    };
    const pricey: CryptoTaxLot = {
      id: 'pricey',
      symbol: 'ETH',
      quantity: 1,
      acquisitionDate: '2022-01-01',
      costBasisCents: 150000,
      source: 'WALLET',
      chain: 'ethereum',
    };
    const swap: CryptoSwapEvent = {
      id: 'swap-hifo',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 1000,
      fairMarketValueCents: 100000,
    };

    const { eventResult } = processCryptoEvent([cheap, pricey], swap, 'HIFO');
    expect(eventResult.consumedLotIds).toEqual(['pricey']);
    // 100000 proceeds - 150000 basis = -50000 (HIFO harvests the loss)
    expect(eventResult.realizedGainLossCents).toBe(-50000);
  });

  it('only disposes lots on the swap chain (chain-aware basis)', () => {
    const onEth: CryptoTaxLot = {
      id: 'eth',
      symbol: 'USDC',
      quantity: 1000,
      acquisitionDate: '2023-01-01',
      costBasisCents: 100000,
      source: 'WALLET',
      chain: 'ethereum',
    };
    const onArb: CryptoTaxLot = {
      id: 'arb',
      symbol: 'USDC',
      quantity: 1000,
      acquisitionDate: '2023-01-01',
      costBasisCents: 100000,
      source: 'WALLET',
      chain: 'arbitrum',
    };
    const swap: CryptoSwapEvent = {
      id: 'swap-chain',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'arbitrum',
      fromSymbol: 'USDC',
      fromQuantity: 1000,
      toSymbol: 'ETH',
      toQuantity: 0.4,
      fairMarketValueCents: 110000,
    };

    const { eventResult, lots } = processCryptoEvent([onEth, onArb], swap, 'FIFO');

    // Only the Arbitrum lot is consumed; the Ethereum lot is untouched.
    expect(eventResult.consumedLotIds).toEqual(['arb']);
    expect(lots.find((l) => l.id === 'eth')).toBeDefined();
    expect(lots.some((l) => l.symbol === 'ETH' && l.chain === 'arbitrum')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bridges — non-taxable, basis & holding-period preserving
// ---------------------------------------------------------------------------

describe('processCryptoEvent — BRIDGE', () => {
  it('moves an asset cross-chain without a taxable event, preserving basis and date', () => {
    const bridge: CryptoBridgeEvent = {
      id: 'bridge-1',
      type: 'BRIDGE',
      date: '2024-06-01',
      symbol: 'ETH',
      quantity: 1,
      fromChain: 'ethereum',
      toChain: 'arbitrum',
    };

    const { eventResult, lots } = processCryptoEvent([ethLotLongTerm], bridge, 'FIFO');

    expect(eventResult.taxable).toBe(false);
    expect(eventResult.disposal).toBeNull();
    expect(eventResult.realizedGainLossCents).toBe(0);
    expect(eventResult.ordinaryIncomeCents).toBe(0);

    // Source lot removed; destination lot keeps the SAME basis and date.
    expect(lots.some((l) => l.chain === 'ethereum')).toBe(false);
    const moved = lots.find((l) => l.chain === 'arbitrum');
    expect(moved?.costBasisCents).toBe(100000);
    expect(moved?.acquisitionDate).toBe('2021-01-01');
    expect(moved?.quantity).toBe(1);
  });

  it('preserves the holding period so a later swap stays long-term', () => {
    const bridge: CryptoBridgeEvent = {
      id: 'bridge-2',
      type: 'BRIDGE',
      date: '2024-05-01',
      symbol: 'ETH',
      quantity: 1,
      fromChain: 'ethereum',
      toChain: 'optimism',
    };
    const swap: CryptoSwapEvent = {
      id: 'swap-after-bridge',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'optimism',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 2500,
      fairMarketValueCents: 250000,
    };

    const batch = processCryptoEvents([ethLotLongTerm], [bridge, swap], 'FIFO');
    const swapResult = batch.events.find((e) => e.eventId === 'swap-after-bridge');
    // Original acquisition was 2021 → still long-term despite the 2024 bridge.
    expect(swapResult?.longTermGainLossCents).toBe(150000);
    expect(swapResult?.shortTermGainLossCents).toBe(0);
  });

  it('splits across the bridged lots when multiple lots are consumed', () => {
    const lotA: CryptoTaxLot = {
      id: 'a',
      symbol: 'ETH',
      quantity: 1,
      acquisitionDate: '2021-01-01',
      costBasisCents: 100000,
      source: 'WALLET',
      chain: 'ethereum',
    };
    const lotB: CryptoTaxLot = {
      id: 'b',
      symbol: 'ETH',
      quantity: 1,
      acquisitionDate: '2022-01-01',
      costBasisCents: 200000,
      source: 'WALLET',
      chain: 'ethereum',
    };
    const bridge: CryptoBridgeEvent = {
      id: 'bridge-multi',
      type: 'BRIDGE',
      date: '2024-06-01',
      symbol: 'ETH',
      quantity: 2,
      fromChain: 'ethereum',
      toChain: 'base',
    };

    const { eventResult, lots } = processCryptoEvent([lotA, lotB], bridge, 'FIFO');
    expect(eventResult.acquiredLots).toHaveLength(2);
    const totalBasis = lots
      .filter((l) => l.chain === 'base')
      .reduce((sum, l) => sum + l.costBasisCents, 0);
    expect(totalBasis).toBe(300000); // basis conserved across the move
  });
});

// ---------------------------------------------------------------------------
// Airdrops — ordinary income at FMV that also establishes basis
// ---------------------------------------------------------------------------

describe('processCryptoEvent — AIRDROP', () => {
  it('recognizes ordinary income at FMV and creates a lot at that basis', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air-1',
      type: 'AIRDROP',
      date: '2024-06-01',
      chain: 'optimism',
      symbol: 'OP',
      quantity: 100,
      fairMarketValueCents: 50000, // $500 FMV
    };

    const { eventResult, lots } = processCryptoEvent([], airdrop, 'FIFO');

    expect(eventResult.taxable).toBe(true);
    expect(eventResult.ordinaryIncomeCents).toBe(50000);
    expect(eventResult.realizedGainLossCents).toBe(0);

    const lot = lots.find((l) => l.symbol === 'OP');
    expect(lot?.costBasisCents).toBe(50000);
    expect(lot?.acquisitionDate).toBe('2024-06-01');
    expect(lot?.chain).toBe('optimism');
  });

  it('uses the airdrop basis when the tokens are later swapped', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air-2',
      type: 'AIRDROP',
      date: '2024-01-01',
      chain: 'optimism',
      symbol: 'OP',
      quantity: 100,
      fairMarketValueCents: 50000,
    };
    const swap: CryptoSwapEvent = {
      id: 'swap-air',
      type: 'SWAP',
      date: '2024-03-01',
      chain: 'optimism',
      fromSymbol: 'OP',
      fromQuantity: 100,
      toSymbol: 'USDC',
      toQuantity: 800,
      fairMarketValueCents: 80000, // $800 proceeds
    };

    const batch = processCryptoEvents([], [airdrop, swap], 'FIFO');
    expect(batch.totalOrdinaryIncomeCents).toBe(50000);
    // Capital gain on disposal = 80000 - 50000 basis = 30000 (short-term)
    const swapResult = batch.events.find((e) => e.eventId === 'swap-air');
    expect(swapResult?.shortTermGainLossCents).toBe(30000);
  });

  it('maps an airdrop event to an income record', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air-3',
      type: 'AIRDROP',
      date: '2024-06-01',
      chain: 'ethereum',
      symbol: 'ARB',
      quantity: 250,
      fairMarketValueCents: 30000,
    };
    expect(toAirdropIncome(airdrop)).toEqual({
      id: 'air-3',
      symbol: 'ARB',
      quantity: 250,
      fairMarketValueCents: 30000,
      dateReceived: '2024-06-01',
      type: 'AIRDROP',
    });
  });
});

// ---------------------------------------------------------------------------
// Batch processing & summary integration
// ---------------------------------------------------------------------------

describe('processCryptoEvents', () => {
  it('applies events in chronological order regardless of input order', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air',
      type: 'AIRDROP',
      date: '2024-01-01',
      chain: 'optimism',
      symbol: 'OP',
      quantity: 100,
      fairMarketValueCents: 50000,
    };
    const swap: CryptoSwapEvent = {
      id: 'swap',
      type: 'SWAP',
      date: '2024-03-01',
      chain: 'optimism',
      fromSymbol: 'OP',
      fromQuantity: 100,
      toSymbol: 'USDC',
      toQuantity: 700,
      fairMarketValueCents: 70000,
    };

    // Pass out of order; the engine must sort the airdrop before the swap.
    const batch = processCryptoEvents([], [swap, airdrop], 'FIFO');
    expect(batch.events.map((e) => e.eventId)).toEqual(['air', 'swap']);
    expect(batch.taxableEventCount).toBe(2);
  });

  it('aggregates totals across a mixed batch', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air',
      type: 'AIRDROP',
      date: '2024-01-01',
      chain: 'ethereum',
      symbol: 'ENS',
      quantity: 10,
      fairMarketValueCents: 40000,
    };
    const bridge: CryptoBridgeEvent = {
      id: 'bridge',
      type: 'BRIDGE',
      date: '2024-02-01',
      symbol: 'ETH',
      quantity: 1,
      fromChain: 'ethereum',
      toChain: 'arbitrum',
    };
    const swap: CryptoSwapEvent = {
      id: 'swap',
      type: 'SWAP',
      date: '2024-03-01',
      chain: 'arbitrum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 3000,
      fairMarketValueCents: 300000,
    };

    const batch = processCryptoEvents([ethLotLongTerm], [airdrop, bridge, swap], 'FIFO');

    expect(batch.totalOrdinaryIncomeCents).toBe(40000);
    // ETH basis 100000 bridged then sold for 300000 → 200000 long-term gain
    expect(batch.totalLongTermGainLossCents).toBe(200000);
    expect(batch.totalRealizedGainLossCents).toBe(200000);
    expect(batch.disposals).toHaveLength(1);
    expect(batch.incomeRecords).toHaveLength(1);
    expect(batch.taxableEventCount).toBe(2); // airdrop + swap (bridge is not taxable)
  });

  it('returns an empty, zeroed result for no events', () => {
    const batch = processCryptoEvents([ethLotLongTerm], [], 'FIFO');
    expect(batch.events).toHaveLength(0);
    expect(batch.finalLots).toHaveLength(1);
    expect(batch.totalRealizedGainLossCents).toBe(0);
    expect(batch.taxableEventCount).toBe(0);
  });
});

describe('summarizeCryptoEvents', () => {
  it('rolls swap gains and airdrop income into the annual summary', () => {
    const airdrop: CryptoAirdropEvent = {
      id: 'air',
      type: 'AIRDROP',
      date: '2024-01-01',
      chain: 'optimism',
      symbol: 'OP',
      quantity: 100,
      fairMarketValueCents: 50000,
    };
    const swap: CryptoSwapEvent = {
      id: 'swap',
      type: 'SWAP',
      date: '2024-06-01',
      chain: 'ethereum',
      fromSymbol: 'ETH',
      fromQuantity: 1,
      toSymbol: 'USDC',
      toQuantity: 2500,
      fairMarketValueCents: 250000,
    };

    const batch = processCryptoEvents([ethLotLongTerm], [airdrop, swap], 'FIFO');
    const summary = summarizeCryptoEvents(2024, batch);

    expect(summary.taxYear).toBe(2024);
    expect(summary.ordinaryIncomeCents).toBe(50000);
    expect(summary.longTermGainLossCents).toBe(150000);
    expect(summary.totalGainLossCents).toBe(
      summary.shortTermGainLossCents + summary.longTermGainLossCents,
    );
    expect(summary.totalDisposals).toBe(1);
  });
});
