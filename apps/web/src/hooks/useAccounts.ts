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

import { useCallback, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createAccount as repoCreateAccount,
  deleteAccount as repoDeleteAccount,
  mapAccount,
  updateAccount as repoUpdateAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '../db/repositories/accounts';
import type { Row } from '../db/sqlite-wasm';
import type { Account, SyncId } from '../kmp/bridge';
import { useRealtimeTable } from './useRealtimeTable';

export interface UseAccountsResult {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createAccount: (input: CreateAccountInput) => Account | null;
  updateAccount: (accountId: SyncId, updates: UpdateAccountInput) => Account | null;
  deleteAccount: (accountId: SyncId) => boolean;
}

export function useAccounts(): UseAccountsResult {
  const db = useDatabase();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const {
    rows,
    loading,
    error: liveError,
    refresh,
  } = useRealtimeTable<Row>('account', {
    where: 'deleted_at IS NULL',
    orderBy: 'sort_order ASC, name ASC',
  });

  const accounts = useMemo(() => rows.map((row) => mapAccount(row)), [rows]);
  const error = mutationError ?? liveError;

  const createAccount = useCallback(
    (input: CreateAccountInput): Account | null => {
      try {
        setMutationError(null);
        return repoCreateAccount(db, input);
      } catch (accountError) {
        setMutationError(
          accountError instanceof Error ? accountError.message : 'Failed to create account.',
        );
        return null;
      }
    },
    [db],
  );

  const updateAccount = useCallback(
    (accountId: SyncId, updates: UpdateAccountInput): Account | null => {
      try {
        setMutationError(null);
        return repoUpdateAccount(db, accountId, updates);
      } catch (accountError) {
        setMutationError(
          accountError instanceof Error ? accountError.message : 'Failed to update account.',
        );
        return null;
      }
    },
    [db],
  );

  const deleteAccount = useCallback(
    (accountId: SyncId): boolean => {
      try {
        setMutationError(null);
        return repoDeleteAccount(db, accountId);
      } catch (accountError) {
        setMutationError(
          accountError instanceof Error ? accountError.message : 'Failed to delete account.',
        );
        return false;
      }
    },
    [db],
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
