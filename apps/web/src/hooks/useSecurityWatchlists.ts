// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing security/ticker watchlists with price-move alerts
 * (issue #3260).
 *
 * A security watch tracks a ticker against a reference price. Current prices are
 * sourced from the user's own holdings (`useInvestments`) — the same prices that
 * the live-P&L / market-data pipeline keeps up to date — so a watched symbol
 * that is also held reflects its latest observed price. When a symbol's move
 * from its reference reaches the entry's threshold, a price-move alert is
 * emitted for the UI to render.
 *
 * Watch entries persist in localStorage for offline-first support.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useInvestments } from './useInvestments';
import {
  computeSecurityAlerts,
  normalizeSymbol,
  type CreateSecurityWatchInput,
  type SecurityAlert,
  type SecurityWatch,
} from '../lib/investment/security-watchlist';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by {@link useSecurityWatchlists}. */
export interface UseSecurityWatchlistsResult {
  /** All configured security watches. */
  watches: SecurityWatch[];
  /** Active price-move alerts. */
  alerts: SecurityAlert[];
  /** Latest known price per share (cents) keyed by normalized symbol. */
  priceBySymbolCents: Map<string, number>;
  /** Add a new security watch. Returns the created entry. */
  addWatch: (input: CreateSecurityWatchInput) => SecurityWatch;
  /** Remove a watch by ID. */
  removeWatch: (watchId: string) => void;
  /** Toggle alerts for a watch. */
  toggleAlerts: (watchId: string) => void;
  /** Reset a watch's reference price to the latest observed price (re-baseline). */
  resetReferencePrice: (watchId: string) => void;
  /** Dismiss an alert until the next refresh. */
  dismissAlert: (watchId: string) => void;
  /** Clear dismissals so alerts re-evaluate. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance-security-watchlists';

function normalizeWatches(watches: readonly SecurityWatch[]): SecurityWatch[] {
  return [...watches]
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((watch, index) => ({ ...watch, sortOrder: index }));
}

function loadWatches(): SecurityWatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeWatches(JSON.parse(raw) as SecurityWatch[]);
  } catch {
    return [];
  }
}

function saveWatches(watches: SecurityWatch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWatches(watches)));
  } catch {
    // Storage may be unavailable.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSecurityWatchlists(): UseSecurityWatchlistsResult {
  const { investments } = useInvestments();
  const [watches, setWatches] = useState<SecurityWatch[]>(loadWatches);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    saveWatches(watches);
  }, [watches]);

  // Latest price per symbol from the user's holdings (cents).
  const priceBySymbolCents = useMemo(() => {
    const map = new Map<string, number>();
    for (const investment of investments) {
      map.set(normalizeSymbol(investment.symbol), investment.currentPricePerShare.amount);
    }
    return map;
  }, [investments]);

  const alerts = useMemo<SecurityAlert[]>(() => {
    const active = watches.filter((watch) => !dismissedIds.has(watch.id));
    return computeSecurityAlerts(active, priceBySymbolCents);
  }, [watches, priceBySymbolCents, dismissedIds]);

  const addWatch = useCallback(
    (input: CreateSecurityWatchInput): SecurityWatch => {
      const newWatch: SecurityWatch = {
        id: crypto.randomUUID(),
        symbol: normalizeSymbol(input.symbol),
        name: input.name?.trim() ?? '',
        referencePriceCents: Math.max(0, Math.round(input.referencePriceCents)),
        alertThresholdPercent: Math.max(0, input.alertThresholdPercent),
        alertsEnabled: input.alertsEnabled ?? true,
        createdAt: new Date().toISOString(),
        sortOrder: watches.length,
      };
      setWatches((prev) => normalizeWatches([...prev, newWatch]));
      return newWatch;
    },
    [watches.length],
  );

  const removeWatch = useCallback((watchId: string) => {
    setWatches((prev) => normalizeWatches(prev.filter((watch) => watch.id !== watchId)));
  }, []);

  const toggleAlerts = useCallback((watchId: string) => {
    setWatches((prev) =>
      normalizeWatches(
        prev.map((watch) =>
          watch.id === watchId ? { ...watch, alertsEnabled: !watch.alertsEnabled } : watch,
        ),
      ),
    );
  }, []);

  const resetReferencePrice = useCallback(
    (watchId: string) => {
      setWatches((prev) =>
        normalizeWatches(
          prev.map((watch) => {
            if (watch.id !== watchId) return watch;
            const latest = priceBySymbolCents.get(normalizeSymbol(watch.symbol));
            return latest === undefined ? watch : { ...watch, referencePriceCents: latest };
          }),
        ),
      );
    },
    [priceBySymbolCents],
  );

  const dismissAlert = useCallback((watchId: string) => {
    setDismissedIds((prev) => new Set([...prev, watchId]));
  }, []);

  const refresh = useCallback(() => {
    setDismissedIds(new Set());
  }, []);

  return {
    watches,
    alerts,
    priceBySymbolCents,
    addWatch,
    removeWatch,
    toggleAlerts,
    resetReferencePrice,
    dismissAlert,
    refresh,
  };
}
