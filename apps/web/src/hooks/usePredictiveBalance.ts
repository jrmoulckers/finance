// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for predictive end-of-month balance.
 *
 * Computes predictions from local SQLite data and exposes them
 * for dashboard display.
 *
 * Usage:
 * ```tsx
 * const { prediction, loading, error, refresh } = usePredictiveBalance();
 * ```
 *
 * References: issue #324
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getAllAccounts } from '../db/repositories/accounts';
import { getAllTransactions } from '../db/repositories/transactions';
import { generatePredictions, type PredictionSummary } from '../lib/predictiveBalance';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UsePredictiveBalanceResult {
  /** Prediction data, or null if not yet computed. */
  prediction: PredictionSummary | null;
  /** True while computing predictions. */
  loading: boolean;
  /** Error message, or null. */
  error: string | null;
  /** Trigger a re-computation. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePredictiveBalance(lookbackMonths = 3): UsePredictiveBalanceResult {
  const db = useDatabase();
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
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

    try {
      const accounts = getAllAccounts(db);
      const transactions = getAllTransactions(db);
      const result = generatePredictions(accounts, transactions, lookbackMonths);
      setPrediction(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute predictions.');
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken, lookbackMonths]);

  return { prediction, loading, error, refresh };
}
