// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating account data.
 *
 * Reads from the local SQLite-WASM database via the accounts repository.
 * All operations are synchronous against the local DB; errors are captured
 * in state rather than thrown so callers can render gracefully.
 *
 * Usage:
 * ```tsx
 * const { accounts, loading, error, createAccount, refresh } = useAccounts();
 * ```
 *
 * References: issue #443
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createAccount as repoCreateAccount,
  deleteAccount as repoDeleteAccount,
  getAllAccounts,
  updateAccount as repoUpdateAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '../db/repositories/accounts';
import type { Account, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useAccounts}. */
export interface UseAccountsResult {
  /** All non-deleted accounts ordered by sort order and name. */
  accounts: Account[];
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Trigger a re-fetch of all accounts from the local database. */
  refresh: () => void;
  /**
   * Create a new account and automatically refresh the list.
   * @returns The created account, or `null` if creation failed.
   */
  createAccount: (input: CreateAccountInput) => Account | null;
  /**
   * Update an existing account and automatically refresh the list.
   * @returns The updated account, or `null` if the account was not found or update failed.
   */
  updateAccount: (accountId: SyncId, updates: UpdateAccountInput) => Account | null;
  /**
   * Soft-delete an account and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteAccount: (accountId: SyncId) => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all accounts from the local database and expose CRUD operations. */
export function useAccounts(): UseAccountsResult {
  const db = useDatabase();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Increment the refresh token to trigger a data re-fetch. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const result = getAllAccounts(db);
      setAccounts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts.');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const createAccount = useCallback(
    (input: CreateAccountInput): Account | null => {
      try {
        const created = repoCreateAccount(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create account.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateAccount = useCallback(
    (accountId: SyncId, updates: UpdateAccountInput): Account | null => {
      try {
        const updated = repoUpdateAccount(db, accountId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update account.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteAccount = useCallback(
    (accountId: SyncId): boolean => {
      try {
        const deleted = repoDeleteAccount(db, accountId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete account.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  return {
    accounts,
    loading,
    error,
    refresh,
    createAccount,
    updateAccount,
    deleteAccount,
  };
}
