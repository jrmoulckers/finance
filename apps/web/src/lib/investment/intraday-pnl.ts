// SPDX-License-Identifier: BUSL-1.1

/** Cross-broker intraday P&L calculation engine over provided data. References: issue #2638 */
import { evaluateQuoteFreshness } from './market-data';
import type { QuoteFreshness, QuoteSnapshot } from './market-data';

export type PnlAssetClass = 'equity' | 'option' | 'crypto' | 'cash' | 'other';

export interface IntradayPosition {
  readonly accountId: string;
  readonly brokerage: string;
  readonly symbol: string;
  readonly assetClass: PnlAssetClass;
  readonly quantity: number;
  readonly previousCloseCents?: number;
  readonly costBasisCents?: number;
  readonly currency: string;
}

export interface RealizedPnlEvent {
  readonly accountId: string;
  readonly brokerage: string;
  readonly symbol: string;
  readonly realizedPnlCents: number;
  readonly currency: string;
}

export interface CashMovement {
  readonly accountId: string;
  readonly brokerage: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly kind: 'deposit' | 'withdrawal' | 'fee' | 'dividend' | 'interest' | 'transfer';
}

export interface PnlBreakdown {
  readonly key: string;
  readonly marketValueCents: number;
  readonly dayPnlCents: number;
  readonly unrealizedPnlCents: number;
  readonly realizedPnlCents: number;
  readonly netWorthDeltaCents: number;
}

export interface IntradayPnlReport {
  readonly currency: string;
  readonly totalMarketValueCents: number;
  readonly dayPnlCents: number;
  readonly unrealizedPnlCents: number;
  readonly realizedPnlCents: number;
  readonly cashMovementCents: number;
  readonly netWorthDeltaCents: number;
  readonly staleSymbols: readonly string[];
  readonly missingBasisSymbols: readonly string[];
  readonly breakdowns: {
    readonly byAccount: readonly PnlBreakdown[];
    readonly byBrokerage: readonly PnlBreakdown[];
    readonly bySymbol: readonly PnlBreakdown[];
    readonly byAssetClass: readonly PnlBreakdown[];
  };
}

export interface IntradayPnlInput {
  readonly positions: readonly IntradayPosition[];
  readonly quotes: readonly QuoteSnapshot[];
  readonly realizedEvents?: readonly RealizedPnlEvent[];
  readonly cashMovements?: readonly CashMovement[];
  readonly now: string;
  readonly currency: string;
}

interface MutableBreakdown {
  marketValueCents: number;
  dayPnlCents: number;
  unrealizedPnlCents: number;
  realizedPnlCents: number;
  netWorthDeltaCents: number;
}

function emptyBreakdown(): MutableBreakdown {
  return {
    marketValueCents: 0,
    dayPnlCents: 0,
    unrealizedPnlCents: 0,
    realizedPnlCents: 0,
    netWorthDeltaCents: 0,
  };
}

function add(map: Map<string, MutableBreakdown>, key: string, delta: MutableBreakdown): void {
  const current = map.get(key) ?? emptyBreakdown();
  current.marketValueCents += delta.marketValueCents;
  current.dayPnlCents += delta.dayPnlCents;
  current.unrealizedPnlCents += delta.unrealizedPnlCents;
  current.realizedPnlCents += delta.realizedPnlCents;
  current.netWorthDeltaCents += delta.netWorthDeltaCents;
  map.set(key, current);
}

function finalize(map: Map<string, MutableBreakdown>): readonly PnlBreakdown[] {
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function isProblemFreshness(freshness: QuoteFreshness): boolean {
  return freshness === 'stale' || freshness === 'missing' || freshness === 'failed';
}

export function computeIntradayPnl(input: IntradayPnlInput): IntradayPnlReport {
  const quotesBySymbol = new Map(input.quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  const byAccount = new Map<string, MutableBreakdown>();
  const byBrokerage = new Map<string, MutableBreakdown>();
  const bySymbol = new Map<string, MutableBreakdown>();
  const byAssetClass = new Map<string, MutableBreakdown>();
  const staleSymbols = new Set<string>();
  const missingBasisSymbols = new Set<string>();
  let totalMarketValueCents = 0;
  let dayPnlCents = 0;
  let unrealizedPnlCents = 0;

  for (const position of input.positions) {
    if (position.currency !== input.currency) continue;
    const symbol = position.symbol.toUpperCase();
    const quote = quotesBySymbol.get(symbol);
    if (isProblemFreshness(evaluateQuoteFreshness(quote, input.now).freshness))
      staleSymbols.add(symbol);
    const priceCents = quote?.priceCents ?? position.previousCloseCents ?? 0;
    const marketValueCents = Math.round(position.quantity * priceCents);
    const positionDayPnl =
      position.previousCloseCents === undefined
        ? 0
        : Math.round(position.quantity * (priceCents - position.previousCloseCents));
    const positionUnrealized =
      position.costBasisCents === undefined ? 0 : marketValueCents - position.costBasisCents;
    if (position.costBasisCents === undefined && position.assetClass !== 'cash')
      missingBasisSymbols.add(symbol);
    const delta = {
      marketValueCents,
      dayPnlCents: positionDayPnl,
      unrealizedPnlCents: positionUnrealized,
      realizedPnlCents: 0,
      netWorthDeltaCents: positionDayPnl,
    };
    totalMarketValueCents += marketValueCents;
    dayPnlCents += positionDayPnl;
    unrealizedPnlCents += positionUnrealized;
    add(byAccount, position.accountId, delta);
    add(byBrokerage, position.brokerage, delta);
    add(bySymbol, symbol, delta);
    add(byAssetClass, position.assetClass, delta);
  }

  let realizedPnlCents = 0;
  for (const event of input.realizedEvents ?? []) {
    if (event.currency !== input.currency) continue;
    realizedPnlCents += event.realizedPnlCents;
    const delta = {
      marketValueCents: 0,
      dayPnlCents: 0,
      unrealizedPnlCents: 0,
      realizedPnlCents: event.realizedPnlCents,
      netWorthDeltaCents: event.realizedPnlCents,
    };
    add(byAccount, event.accountId, delta);
    add(byBrokerage, event.brokerage, delta);
    add(bySymbol, event.symbol.toUpperCase(), delta);
  }

  const cashMovementCents = (input.cashMovements ?? [])
    .filter((movement) => movement.currency === input.currency)
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  return {
    currency: input.currency,
    totalMarketValueCents,
    dayPnlCents,
    unrealizedPnlCents,
    realizedPnlCents,
    cashMovementCents,
    netWorthDeltaCents: dayPnlCents + realizedPnlCents + cashMovementCents,
    staleSymbols: [...staleSymbols].sort(),
    missingBasisSymbols: [...missingBasisSymbols].sort(),
    breakdowns: {
      byAccount: finalize(byAccount),
      byBrokerage: finalize(byBrokerage),
      bySymbol: finalize(bySymbol),
      byAssetClass: finalize(byAssetClass),
    },
  };
}
