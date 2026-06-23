// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook powering the live cross-broker P&L + net-worth dashboard.
 *
 * Data access stays hooks-only: positions come from {@link useInvestments} and
 * balances from {@link useAccounts}. The hook subscribes to a pluggable
 * {@link PriceSource} (default: an offline {@link SimulatedMarketDataProvider}
 * polled on an interval — no network, no API keys) and recomputes a
 * {@link LivePnlView} every time fresh quotes arrive or a staleness tick fires.
 *
 * A caller may inject its own `source` (e.g. a vendor websocket adapter, or a
 * {@link ManualPriceSource} in tests) without changing the data path.
 *
 * References: issue #2124
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccounts } from './useAccounts';
import { useInvestments } from './useInvestments';
import {
  buildLivePnlView,
  PollingPriceSource,
  SimulatedMarketDataProvider,
} from '../lib/investment';
import type {
  BaseAccountBalance,
  LivePnlView,
  PnlAssetClass,
  PriceSource,
  PriceUpdate,
  QuoteRequest,
  QuoteSnapshot,
  SimulatedSeed,
} from '../lib/investment';
import type { Account, Investment, InvestmentType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Options for {@link useLivePnl}. */
export interface UseLivePnlOptions {
  /** Inject a custom price source (default: polled offline simulation). */
  readonly source?: PriceSource;
  /** Poll cadence for the default source, in ms (default: 15s). */
  readonly intervalMs?: number;
  /** Start the source automatically on mount (default: true). */
  readonly autoStart?: boolean;
  /** Reporting currency (default: `'USD'`). */
  readonly baseCurrency?: string;
  /** Clock injection for deterministic tests. */
  readonly now?: () => string;
  /** Staleness re-evaluation cadence, in ms (default: 5s). */
  readonly stalenessTickMs?: number;
}

/** Shape returned by {@link useLivePnl}. */
export interface UseLivePnlResult {
  /** The computed live view, or `null` when there is nothing to show. */
  view: LivePnlView | null;
  /** `true` while underlying investment/account data is loading. */
  loading: boolean;
  /** Last price-source error message, or `null`. */
  error: string | null;
  /** Whether the price source is currently emitting updates. */
  isLive: boolean;
  /** ISO timestamp of the most recent price update, or `null`. */
  lastUpdated: string | null;
  /** Force an immediate price refresh. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Mapping helpers (exported for unit testing)
// ---------------------------------------------------------------------------

const INVESTMENT_PNL_CLASS: Record<InvestmentType, PnlAssetClass> = {
  STOCK: 'equity',
  ETF: 'equity',
  MUTUAL_FUND: 'equity',
  BOND: 'other',
  CRYPTO: 'crypto',
  REAL_ESTATE: 'other',
  COMMODITY: 'other',
  OTHER: 'other',
};

const INVESTMENT_QUOTE_KIND: Record<InvestmentType, QuoteRequest['assetKind']> = {
  STOCK: 'equity',
  ETF: 'equity',
  MUTUAL_FUND: 'equity',
  BOND: 'other',
  CRYPTO: 'crypto',
  REAL_ESTATE: 'other',
  COMMODITY: 'other',
  OTHER: 'other',
};

/**
 * Investment-type accounts are valued from live positions, so their stored
 * balance is excluded from the "base" (non-market) net-worth roll-up to avoid
 * double-counting.
 */
function isInvestmentAccount(type: Account['type']): boolean {
  return type === 'INVESTMENT';
}

/** Build intraday positions from investments, resolving the brokerage label. */
export function buildLivePositions(
  investments: readonly Investment[],
  accounts: readonly Account[],
) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  return investments.map((inv) => {
    const account = inv.accountId ? accountsById.get(inv.accountId) : undefined;
    const priceCents = inv.currentPricePerShare.amount;
    return {
      accountId: inv.accountId ?? 'unassigned',
      brokerage: account?.name ?? 'Unassigned',
      symbol: inv.symbol,
      assetClass: INVESTMENT_PNL_CLASS[inv.type],
      quantity: inv.shares,
      // Stored current price is the intraday baseline; live quotes drive change.
      previousCloseCents: priceCents,
      costBasisCents: Math.round(inv.shares * inv.costBasisPerShare.amount),
      currency: inv.currency.code,
    };
  });
}

/** Build de-duplicated quote requests for the tracked symbols. */
export function buildQuoteRequests(investments: readonly Investment[]): QuoteRequest[] {
  const seen = new Map<string, QuoteRequest>();
  for (const inv of investments) {
    const symbol = inv.symbol.toUpperCase();
    if (!seen.has(symbol)) {
      seen.set(symbol, { symbol: inv.symbol, assetKind: INVESTMENT_QUOTE_KIND[inv.type] });
    }
  }
  return [...seen.values()];
}

/** Build simulated price seeds from stored current prices. */
export function buildSimulatedSeeds(investments: readonly Investment[]): SimulatedSeed[] {
  const seen = new Map<string, SimulatedSeed>();
  for (const inv of investments) {
    const symbol = inv.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    const isCrypto = inv.type === 'CRYPTO';
    seen.set(symbol, {
      symbol: inv.symbol,
      assetKind: INVESTMENT_QUOTE_KIND[inv.type],
      basePriceCents: inv.currentPricePerShare.amount,
      currency: inv.currency.code,
      marketSession: isCrypto ? '24x7' : 'open',
      // Crypto is more volatile than equities in the simulation.
      volatilityBps: isCrypto ? 150 : 50,
    });
  }
  return [...seen.values()];
}

/** Build base (non-market) account balances that complete total net worth. */
export function buildBaseAccountBalances(
  accounts: readonly Account[],
  currency: string,
): BaseAccountBalance[] {
  return accounts
    .filter((account) => !account.isArchived && !isInvestmentAccount(account.type))
    .filter((account) => account.currency.code === currency)
    .map((account) => ({
      accountId: account.id,
      label: account.name,
      assetClass:
        account.type === 'CASH' || account.type === 'CHECKING' || account.type === 'SAVINGS'
          ? 'cash'
          : 'other',
      balanceCents: account.currentBalance.amount,
      currency: account.currency.code,
    }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Live cross-broker P&L + net-worth view derived from local data + quotes. */
export function useLivePnl(options: UseLivePnlOptions = {}): UseLivePnlResult {
  const {
    source: injectedSource,
    intervalMs = 15_000,
    autoStart = true,
    baseCurrency = 'USD',
    stalenessTickMs = 5_000,
  } = options;

  const { investments, loading: investmentsLoading } = useInvestments();
  const { accounts, loading: accountsLoading } = useAccounts();

  const nowFn = useMemo(() => options.now ?? (() => new Date().toISOString()), [options.now]);

  const positions = useMemo(
    () => buildLivePositions(investments, accounts),
    [investments, accounts],
  );
  const baseAccounts = useMemo(
    () => buildBaseAccountBalances(accounts, baseCurrency),
    [accounts, baseCurrency],
  );
  const requests = useMemo(() => buildQuoteRequests(investments), [investments]);
  const seeds = useMemo(() => buildSimulatedSeeds(investments), [investments]);

  // Stable signature so the default source is only recreated when symbols change.
  const requestSignature = useMemo(
    () =>
      requests
        .map((request) => request.symbol.toUpperCase())
        .sort()
        .join(','),
    [requests],
  );

  const [quotes, setQuotes] = useState<ReadonlyMap<string, QuoteSnapshot>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [nowTick, setNowTick] = useState(() => nowFn());

  const activeSourceRef = useRef<PriceSource | null>(null);

  const handleUpdate = useCallback(
    (update: PriceUpdate) => {
      setError(update.error ?? null);
      if (update.quotes.length > 0) {
        setQuotes((prev) => {
          const next = new Map(prev);
          for (const quote of update.quotes) next.set(quote.symbol.toUpperCase(), quote);
          return next;
        });
      }
      setLastUpdated(update.receivedAt);
      setNowTick(nowFn());
    },
    [nowFn],
  );

  // Re-evaluate staleness on a slow tick even when no new quotes arrive.
  useEffect(() => {
    const id = setInterval(() => setNowTick(nowFn()), Math.max(1_000, stalenessTickMs));
    return () => clearInterval(id);
  }, [nowFn, stalenessTickMs]);

  // Subscribe to (and, for the default source, own the lifecycle of) the source.
  useEffect(() => {
    const ownsSource = !injectedSource;
    const source =
      injectedSource ??
      new PollingPriceSource(new SimulatedMarketDataProvider(seeds, { now: nowFn }), requests, {
        intervalMs,
        now: nowFn,
      });
    activeSourceRef.current = source;
    const unsubscribe = source.subscribe(handleUpdate);
    if (autoStart) {
      source.start();
      setIsLive(true);
    }
    return () => {
      unsubscribe();
      if (ownsSource) source.stop();
      setIsLive(false);
      if (activeSourceRef.current === source) activeSourceRef.current = null;
    };
    // `requestSignature` captures symbol-set changes so the default source is
    // only recreated when the tracked symbols change (seeds/requests are read
    // fresh inside the effect at that point).
  }, [injectedSource, requestSignature, intervalMs, autoStart, handleUpdate, nowFn]);

  const refresh = useCallback(() => {
    void activeSourceRef.current?.refreshNow();
  }, []);

  const view = useMemo<LivePnlView | null>(() => {
    if (positions.length === 0 && baseAccounts.length === 0) return null;
    return buildLivePnlView({
      positions,
      quotes: [...quotes.values()],
      baseAccounts,
      now: nowTick,
      currency: baseCurrency,
      lastUpdated,
    });
  }, [positions, baseAccounts, quotes, nowTick, baseCurrency, lastUpdated]);

  return {
    view,
    loading: investmentsLoading || accountsLoading,
    error,
    isLive,
    lastUpdated,
    refresh,
  };
}
