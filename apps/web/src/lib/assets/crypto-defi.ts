// SPDX-License-Identifier: BUSL-1.1

/**
 * Chain-aware crypto taxable-event processing for DeFi activity.
 *
 * Extends the crypto tax-lot engine (see ./crypto-tax) to model the three most
 * common DeFi event types with US tax treatment:
 *
 *   - SWAP    A crypto→crypto trade. A taxable disposal of the asset given up
 *             (proceeds = fair market value of the trade) plus acquisition of
 *             the asset received at a fresh cost basis equal to that FMV.
 *   - BRIDGE  A same-asset cross-chain move. Generally NON-taxable: no disposal
 *             occurs, cost basis and the original acquisition date are
 *             preserved and re-tagged to the destination chain (the holding
 *             period "tacks").
 *   - AIRDROP Tokens received. Ordinary income at FMV on the date of receipt,
 *             which also establishes the cost basis of the new lot.
 *
 * Cost basis is tracked PER CHAIN. Under IRS Rev. Proc. 2024-28 the IRS
 * requires per-wallet/per-account basis tracking (universal "pooled" basis is
 * no longer permitted from 2025), so disposals consume lots on the chain where
 * the event occurs. Lots with no chain tag form a global fallback pool and are
 * eligible on any chain.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * Assumptions / simplifications (documented for auditability):
 *   - Swap FMV is supplied by the caller (price-oracle resolution is out of
 *     scope here) and is used for BOTH the disposed-leg proceeds and the
 *     acquired-leg cost basis.
 *   - An optional swap network fee is capitalized into the acquired asset's
 *     cost basis (treated as a transaction cost), not deducted from proceeds.
 *   - Bridges are modeled as strictly non-taxable and basis-preserving; gas
 *     paid to bridge is NOT modeled as a partial disposal here. The correct
 *     treatment of self-transfer gas is genuinely unsettled — see the
 *     "Needs Decision" note in the PR description.
 *
 * References: issue #2168
 */

import { bankersRound, safeDivide } from './crypto-portfolio';
import { computeCryptoTaxSummary, sortLots } from './crypto-tax';
import type {
  ChainId,
  CryptoAirdropEvent,
  CryptoBridgeEvent,
  CryptoDisposalResult,
  CryptoEventBatchResult,
  CryptoEventResult,
  CryptoLotMethod,
  CryptoSource,
  CryptoSwapEvent,
  CryptoTaxableEvent,
  CryptoTaxLot,
  CryptoTaxSummary,
  LocalDate,
  MatchedLot,
  StakingIncome,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tolerance for fractional-quantity comparisons (crypto allows many decimals). */
const QUANTITY_EPSILON = 1e-9;

/** Parse an ISO-8601 date string to a Date object (UTC midnight). */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

/** Number of whole days between two ISO date strings. */
function daysBetween(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Whether a lot is eligible to be consumed by an event on the given chain.
 *
 * A tagged lot must match the event chain exactly. Untagged lots (no `chain`)
 * act as a global fallback pool and are eligible on any chain.
 */
function lotMatchesChain(lot: CryptoTaxLot, chain: ChainId | undefined): boolean {
  if (chain === undefined) return true;
  return lot.chain === undefined || lot.chain === chain;
}

/** A portion of a lot consumed by a disposal or bridge. */
interface ConsumedPortion {
  readonly lotId: string;
  readonly symbol: string;
  readonly quantityUsed: number;
  readonly costBasisCents: number;
  readonly acquisitionDate: LocalDate;
  readonly source: CryptoSource;
  readonly chain?: ChainId;
  /** Whether the entire originating lot was used (and thus removed). */
  readonly fullyConsumed: boolean;
}

// ---------------------------------------------------------------------------
// Lot-book consumption
// ---------------------------------------------------------------------------

/**
 * Consume `quantity` units of `symbol` (optionally restricted to `chain`) from
 * the lot book, returning the consumed portions plus the remaining lot book.
 *
 * Partially-used lots are reduced in place (quantity and cost basis scaled so
 * total basis is conserved). Cost basis per consumed portion is computed with
 * banker's rounding to stay in integer cents.
 *
 * @returns The consumed portions (in matching order) and the updated lot book.
 */
function consumeLots(
  lots: readonly CryptoTaxLot[],
  symbol: string,
  chain: ChainId | undefined,
  quantity: number,
  method: CryptoLotMethod,
): { consumed: ConsumedPortion[]; remaining: CryptoTaxLot[] } {
  const eligible: CryptoTaxLot[] = [];
  const remaining: CryptoTaxLot[] = [];

  for (const lot of lots) {
    if (lot.symbol === symbol && lotMatchesChain(lot, chain)) {
      eligible.push(lot);
    } else {
      remaining.push(lot);
    }
  }

  const sorted = sortLots(eligible, method);
  const consumed: ConsumedPortion[] = [];
  let need = quantity;

  for (const lot of sorted) {
    if (need <= QUANTITY_EPSILON) {
      remaining.push(lot);
      continue;
    }

    const use = Math.min(need, lot.quantity);
    const costForUse = bankersRound(safeDivide(lot.costBasisCents, lot.quantity) * use);
    const leftoverQty = lot.quantity - use;
    const fullyConsumed = leftoverQty <= QUANTITY_EPSILON;

    consumed.push({
      lotId: lot.id,
      symbol: lot.symbol,
      quantityUsed: use,
      costBasisCents: costForUse,
      acquisitionDate: lot.acquisitionDate,
      source: lot.source,
      chain: lot.chain,
      fullyConsumed,
    });

    if (!fullyConsumed) {
      remaining.push({
        ...lot,
        quantity: leftoverQty,
        costBasisCents: lot.costBasisCents - costForUse,
      });
    }

    need -= use;
  }

  return { consumed, remaining };
}

/** Outcome of disposing of an asset from the lot book. */
interface DisposalOutcome {
  readonly result: CryptoDisposalResult;
  readonly remaining: CryptoTaxLot[];
  readonly consumedLotIds: string[];
}

/**
 * Dispose of `quantity` units of `symbol` on `chain` for `proceedsCents`,
 * computing the realized short/long-term gain or loss per matched lot.
 *
 * Proceeds are allocated to each consumed portion proportionally to the
 * quantity used. Holdings of more than 365 days are long-term.
 */
function disposeFromLots(
  lots: readonly CryptoTaxLot[],
  symbol: string,
  chain: ChainId | undefined,
  quantity: number,
  proceedsCents: number,
  disposalDate: LocalDate,
  method: CryptoLotMethod,
): DisposalOutcome {
  const { consumed, remaining } = consumeLots(lots, symbol, chain, quantity, method);

  const matchedLots: MatchedLot[] = [];
  let totalCostBasis = 0;
  let shortTerm = 0;
  let longTerm = 0;
  const consumedLotIds: string[] = [];

  for (const portion of consumed) {
    const proceedsForUse = bankersRound(safeDivide(proceedsCents, quantity) * portion.quantityUsed);
    const gainLoss = proceedsForUse - portion.costBasisCents;
    const holdingDays = daysBetween(portion.acquisitionDate, disposalDate);
    const isLongTerm = holdingDays > 365;

    if (isLongTerm) {
      longTerm += gainLoss;
    } else {
      shortTerm += gainLoss;
    }

    totalCostBasis += portion.costBasisCents;

    matchedLots.push({
      lotId: portion.lotId,
      symbol: portion.symbol,
      quantityUsed: portion.quantityUsed,
      costBasisCents: portion.costBasisCents,
      isLongTerm,
      holdingDays,
      gainLossCents: gainLoss,
      chain: portion.chain,
    });

    if (portion.fullyConsumed) {
      consumedLotIds.push(portion.lotId);
    }
  }

  const result: CryptoDisposalResult = {
    disposalDate,
    proceedsCents,
    totalCostBasisCents: totalCostBasis,
    gainLossCents: proceedsCents - totalCostBasis,
    shortTermGainLossCents: shortTerm,
    longTermGainLossCents: longTerm,
    matchedLots,
  };

  return { result, remaining, consumedLotIds };
}

// ---------------------------------------------------------------------------
// Per-event processors
// ---------------------------------------------------------------------------

/** A single processed event plus the resulting lot book. */
interface ProcessedEvent {
  readonly eventResult: CryptoEventResult;
  readonly lots: CryptoTaxLot[];
}

/** Process a swap: taxable disposal of one asset + acquisition of another. */
function processSwap(
  lots: readonly CryptoTaxLot[],
  event: CryptoSwapEvent,
  method: CryptoLotMethod,
): ProcessedEvent {
  const feeCents = event.feeCents ?? 0;
  const { result, remaining, consumedLotIds } = disposeFromLots(
    lots,
    event.fromSymbol,
    event.chain,
    event.fromQuantity,
    event.fairMarketValueCents,
    event.date,
    method,
  );

  const acquiredLot: CryptoTaxLot = {
    id: `${event.id}-acq`,
    symbol: event.toSymbol,
    quantity: event.toQuantity,
    acquisitionDate: event.date,
    costBasisCents: event.fairMarketValueCents + feeCents,
    source: 'DEFI',
    chain: event.toChain ?? event.chain,
  };

  const realized = result.shortTermGainLossCents + result.longTermGainLossCents;

  const eventResult: CryptoEventResult = {
    eventId: event.id,
    eventType: 'SWAP',
    date: event.date,
    chain: event.chain,
    taxable: true,
    disposal: result,
    acquiredLots: [acquiredLot],
    consumedLotIds,
    ordinaryIncomeCents: 0,
    realizedGainLossCents: realized,
    shortTermGainLossCents: result.shortTermGainLossCents,
    longTermGainLossCents: result.longTermGainLossCents,
    note: `Taxable swap on ${event.chain}: disposed ${event.fromQuantity} ${event.fromSymbol}, acquired ${event.toQuantity} ${event.toSymbol} at fair market value.`,
  };

  return { eventResult, lots: [...remaining, acquiredLot] };
}

/** Process a bridge: non-taxable, basis- and holding-period-preserving move. */
function processBridge(
  lots: readonly CryptoTaxLot[],
  event: CryptoBridgeEvent,
  method: CryptoLotMethod,
): ProcessedEvent {
  const { consumed, remaining } = consumeLots(
    lots,
    event.symbol,
    event.fromChain,
    event.quantity,
    method,
  );

  // One destination lot per consumed portion, preserving acquisition date and
  // cost basis so the holding period "tacks" across the chain boundary.
  const bridgedLots: CryptoTaxLot[] = consumed.map((portion, index) => ({
    id: `${event.id}-${index}`,
    symbol: portion.symbol,
    quantity: portion.quantityUsed,
    acquisitionDate: portion.acquisitionDate,
    costBasisCents: portion.costBasisCents,
    source: portion.source,
    chain: event.toChain,
  }));

  const consumedLotIds = consumed.filter((p) => p.fullyConsumed).map((p) => p.lotId);

  const eventResult: CryptoEventResult = {
    eventId: event.id,
    eventType: 'BRIDGE',
    date: event.date,
    chain: event.toChain,
    taxable: false,
    disposal: null,
    acquiredLots: bridgedLots,
    consumedLotIds,
    ordinaryIncomeCents: 0,
    realizedGainLossCents: 0,
    shortTermGainLossCents: 0,
    longTermGainLossCents: 0,
    note: `Non-taxable bridge: moved ${event.quantity} ${event.symbol} from ${event.fromChain} to ${event.toChain}; cost basis and holding period preserved.`,
  };

  return { eventResult, lots: [...remaining, ...bridgedLots] };
}

/** Process an airdrop: ordinary income at FMV which establishes cost basis. */
function processAirdrop(lots: readonly CryptoTaxLot[], event: CryptoAirdropEvent): ProcessedEvent {
  const airdropLot: CryptoTaxLot = {
    id: `${event.id}-acq`,
    symbol: event.symbol,
    quantity: event.quantity,
    acquisitionDate: event.date,
    costBasisCents: event.fairMarketValueCents,
    source: 'DEFI',
    chain: event.chain,
  };

  const eventResult: CryptoEventResult = {
    eventId: event.id,
    eventType: 'AIRDROP',
    date: event.date,
    chain: event.chain,
    taxable: true,
    disposal: null,
    acquiredLots: [airdropLot],
    consumedLotIds: [],
    ordinaryIncomeCents: event.fairMarketValueCents,
    realizedGainLossCents: 0,
    shortTermGainLossCents: 0,
    longTermGainLossCents: 0,
    note: `Airdrop income on ${event.chain}: received ${event.quantity} ${event.symbol} at fair market value (ordinary income; establishes cost basis).`,
  };

  return { eventResult, lots: [...lots, airdropLot] };
}

/** Convert an airdrop event into a staking/DeFi income record (FMV at receipt). */
export function toAirdropIncome(event: CryptoAirdropEvent): StakingIncome {
  return {
    id: event.id,
    symbol: event.symbol,
    quantity: event.quantity,
    fairMarketValueCents: event.fairMarketValueCents,
    dateReceived: event.date,
    type: 'AIRDROP',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a single chain-aware crypto taxable event against a lot book.
 *
 * @param lots - The current lot book.
 * @param event - The swap, bridge, or airdrop to apply.
 * @param method - Lot-matching method for disposals (default FIFO).
 * @returns The event result and the updated lot book.
 */
export function processCryptoEvent(
  lots: readonly CryptoTaxLot[],
  event: CryptoTaxableEvent,
  method: CryptoLotMethod = 'FIFO',
): ProcessedEvent {
  switch (event.type) {
    case 'SWAP':
      return processSwap(lots, event, method);
    case 'BRIDGE':
      return processBridge(lots, event, method);
    case 'AIRDROP':
      return processAirdrop(lots, event);
  }
}

/**
 * Process a chronological batch of chain-aware crypto taxable events.
 *
 * Events are applied in date order (stable for same-day events) against a
 * running lot book. Returns per-event results, the final lot book, taxable
 * disposals, airdrop income records, and aggregate totals.
 *
 * @param initialLots - Opening lot book.
 * @param events - Events to apply (any order; sorted internally by date).
 * @param method - Lot-matching method for disposals (default FIFO).
 * @returns Aggregate batch result.
 */
export function processCryptoEvents(
  initialLots: readonly CryptoTaxLot[],
  events: readonly CryptoTaxableEvent[],
  method: CryptoLotMethod = 'FIFO',
): CryptoEventBatchResult {
  const ordered = [...events].sort(
    (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
  );

  let lots: CryptoTaxLot[] = [...initialLots];
  const results: CryptoEventResult[] = [];
  const disposals: CryptoDisposalResult[] = [];
  const incomeRecords: StakingIncome[] = [];

  let totalRealized = 0;
  let totalShort = 0;
  let totalLong = 0;
  let totalIncome = 0;
  let taxableCount = 0;

  for (const event of ordered) {
    const processed = processCryptoEvent(lots, event, method);
    lots = processed.lots;
    results.push(processed.eventResult);

    totalRealized += processed.eventResult.realizedGainLossCents;
    totalShort += processed.eventResult.shortTermGainLossCents;
    totalLong += processed.eventResult.longTermGainLossCents;
    totalIncome += processed.eventResult.ordinaryIncomeCents;
    if (processed.eventResult.taxable) taxableCount += 1;

    if (processed.eventResult.disposal) {
      disposals.push(processed.eventResult.disposal);
    }
    if (event.type === 'AIRDROP') {
      incomeRecords.push(toAirdropIncome(event));
    }
  }

  return {
    events: results,
    finalLots: lots,
    disposals,
    incomeRecords,
    totalRealizedGainLossCents: totalRealized,
    totalShortTermGainLossCents: totalShort,
    totalLongTermGainLossCents: totalLong,
    totalOrdinaryIncomeCents: totalIncome,
    taxableEventCount: taxableCount,
  };
}

/**
 * Build an annual crypto tax summary that incorporates DeFi taxable events.
 *
 * Wires a processed event batch into the existing {@link computeCryptoTaxSummary}
 * so swap disposals and airdrop income flow into the same annual rollup as
 * ordinary sales and staking income.
 *
 * @param taxYear - The tax year to summarize.
 * @param batch - A batch result from {@link processCryptoEvents}.
 * @param allLots - All lots (for wash-sale detection); defaults to final lots.
 * @returns Annual crypto tax summary.
 */
export function summarizeCryptoEvents(
  taxYear: number,
  batch: CryptoEventBatchResult,
  allLots: readonly CryptoTaxLot[] = batch.finalLots,
): CryptoTaxSummary {
  return computeCryptoTaxSummary(taxYear, batch.disposals, batch.incomeRecords, allLots);
}
