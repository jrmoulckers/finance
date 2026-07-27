// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for grouping cash-flow income into gig-platform earnings.
 *
 * Combines:
 *   - user-managed mapping rules (persisted in localStorage, seeded with
 *     built-in defaults for Uber/DoorDash/Instacart/Lyft/Grubhub),
 *   - expected-payout reconciliation targets (localStorage), and
 *   - local transaction + account data (read through repositories) to compute
 *     today / this week / this month earnings per platform.
 *
 * All aggregation is delegated to the pure {@link computePlatformEarnings}
 * engine so the data path stays testable and float-free.
 *
 * References: issue #2133
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDatabase } from '../db/DatabaseProvider';
import { getAllAccounts } from '../db/repositories/accounts';
import { getTransactionsByDateRange } from '../db/repositories/transactions';
import type { Transaction } from '../kmp/bridge';
import { computePeriodBounds, computePlatformEarnings } from '../lib/gig/platform-earnings';
import {
  createGigPlatformRule,
  deleteGigPlatformRule,
  loadExpectedPayouts,
  loadGigPlatformRules,
  setExpectedPayout as persistExpectedPayout,
  toggleGigPlatformRule,
  type CreateGigRuleInput,
} from '../lib/gig/platform-rules-storage';
import type { GigPlatformRule, PlatformEarningsResult } from '../lib/gig/platform-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const EMPTY_RESULT: PlatformEarningsResult = {
  platforms: [],
  combined: { today: 0, week: 0, month: 0 },
  combinedCounts: { today: 0, week: 0, month: 0 },
};

/** Shape returned by {@link useGigPlatformEarnings}. */
export interface UseGigPlatformEarningsResult {
  /** Per-platform earnings + combined totals for today/week/month. */
  readonly earnings: PlatformEarningsResult;
  /** All mapping rules (user rules first, then built-ins). */
  readonly rules: GigPlatformRule[];
  /** Map of platform → expected payout (cents) for reconciliation. */
  readonly expectedPayouts: Record<string, number>;
  /** Distinct platform names known from rules (for filtering UIs). */
  readonly knownPlatforms: string[];
  /** True while data is being computed. */
  readonly loading: boolean;
  /** Human-readable error message, or null. */
  readonly error: string | null;
  /** Recompute earnings and reload rules/targets. */
  readonly refresh: () => void;
  /** Create a custom mapping rule. Returns the rule or null on error. */
  readonly addRule: (input: CreateGigRuleInput) => GigPlatformRule | null;
  /** Toggle a rule's enabled state. */
  readonly toggleRule: (id: string) => void;
  /** Remove a rule by id. Returns true when removed. */
  readonly removeRule: (id: string) => boolean;
  /** Set (or clear, with 0) the expected payout for a platform, in cents. */
  readonly setExpectedPayout: (platform: string, cents: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLocalDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Computes gig-platform earnings from local transactions and user rules.
 */
export function useGigPlatformEarnings(): UseGigPlatformEarningsResult {
  const db = useDatabase();

  const [earnings, setEarnings] = useState<PlatformEarningsResult>(EMPTY_RESULT);
  const [rules, setRules] = useState<GigPlatformRule[]>([]);
  const [expectedPayouts, setExpectedPayouts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const loadedRules = loadGigPlatformRules();
        const loadedExpected = loadExpectedPayouts();

        // Query window: from the earliest of (start of week, start of month) up
        // to today — this covers all three earnings buckets in one read.
        const now = new Date();
        const bounds = computePeriodBounds(now, 1);
        const startTs = Math.min(bounds.weekStart, bounds.monthStart);
        const startDate = formatLocalDate(startTs);
        const endDate = formatLocalDate(bounds.todayStart);

        const transactions: Transaction[] = await getTransactionsByDateRange(
          db,
          startDate,
          endDate,
        );
        const accounts = await getAllAccounts(db);
        const accountNames = new Map<string, string>();
        for (const acct of accounts) accountNames.set(acct.id, acct.name);

        const result = computePlatformEarnings(transactions, loadedRules, {
          referenceDate: now,
          weekStartsOn: 1,
          accountNames,
        });

        setRules(loadedRules);
        setExpectedPayouts(loadedExpected);
        setEarnings(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to compute gig-platform earnings.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [db, refreshToken]);

  const addRule = useCallback(
    (input: CreateGigRuleInput): GigPlatformRule | null => {
      try {
        const rule = createGigPlatformRule(input);
        refresh();
        return rule;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create rule.');
        return null;
      }
    },
    [refresh],
  );

  const toggleRule = useCallback(
    (id: string): void => {
      toggleGigPlatformRule(id);
      refresh();
    },
    [refresh],
  );

  const removeRule = useCallback(
    (id: string): boolean => {
      const removed = deleteGigPlatformRule(id);
      if (removed) refresh();
      return removed;
    },
    [refresh],
  );

  const setExpectedPayout = useCallback((platform: string, cents: number): void => {
    const next = persistExpectedPayout(platform, cents);
    setExpectedPayouts({ ...next });
  }, []);

  const knownPlatforms = useMemo(() => {
    const names = new Set<string>();
    for (const rule of rules) names.add(rule.platform);
    for (const p of earnings.platforms) names.add(p.platform);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [rules, earnings.platforms]);

  return {
    earnings,
    rules,
    expectedPayouts,
    knownPlatforms,
    loading,
    error,
    refresh,
    addRule,
    toggleRule,
    removeRule,
    setExpectedPayout,
  };
}
