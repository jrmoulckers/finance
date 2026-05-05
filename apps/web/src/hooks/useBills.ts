// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating bill reminder data.
 *
 * Reads from the local SQLite-WASM database via the bills repository.
 * All operations are synchronous against the local DB; errors are captured
 * in state rather than thrown so callers can render gracefully.
 *
 * Includes browser notification support for bill reminders.
 *
 * Usage:
 * ```tsx
 * const { bills, loading, error, createBill, markPaid, refresh } = useBills();
 * ```
 *
 * References: issue #1123
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createBill as repoCreateBill,
  deleteBill as repoDeleteBill,
  getAllBills,
  markBillPaid as repoMarkBillPaid,
  updateBill as repoUpdateBill,
  type CreateBillInput,
  type UpdateBillInput,
} from '../db/repositories/bills';
import type { Bill, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Computed bill summary statistics. */
export interface BillsSummary {
  /** Total number of upcoming bills. */
  upcomingCount: number;
  /** Total number of overdue bills. */
  overdueCount: number;
  /** Total amount due for upcoming bills in cents. */
  totalUpcoming: number;
  /** Total amount of overdue bills in cents. */
  totalOverdue: number;
}

/** Shape returned by {@link useBills}. */
export interface UseBillsResult {
  /** All non-deleted bills ordered by due date. */
  bills: Bill[];
  /** Computed bill summary statistics. */
  summary: BillsSummary;
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Current notification permission state. */
  notificationPermission: NotificationPermission | 'unsupported';
  /** Trigger a re-fetch of all bills from the local database. */
  refresh: () => void;
  /**
   * Create a new bill and automatically refresh the list.
   * @returns The created bill, or `null` if creation failed.
   */
  createBill: (input: CreateBillInput) => Bill | null;
  /**
   * Update an existing bill and automatically refresh the list.
   * @returns The updated bill, or `null` if the bill was not found or update failed.
   */
  updateBill: (billId: SyncId, updates: UpdateBillInput) => Bill | null;
  /**
   * Soft-delete a bill and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteBill: (billId: SyncId) => boolean;
  /**
   * Mark a bill as paid and automatically refresh the list.
   * @returns The updated bill, or `null` if the bill was not found.
   */
  markPaid: (billId: SyncId) => Bill | null;
  /**
   * Request browser notification permission for bill reminders.
   * @returns The resulting permission state.
   */
  requestNotificationPermission: () => Promise<NotificationPermission | 'unsupported'>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute bill summary from a list of bills. */
function computeBillsSummary(bills: Bill[]): BillsSummary {
  let upcomingCount = 0;
  let overdueCount = 0;
  let totalUpcoming = 0;
  let totalOverdue = 0;

  for (const bill of bills) {
    if (bill.status === 'UPCOMING') {
      upcomingCount++;
      totalUpcoming += bill.amount.amount;
    } else if (bill.status === 'OVERDUE') {
      overdueCount++;
      totalOverdue += bill.amount.amount;
    }
  }

  return { upcomingCount, overdueCount, totalUpcoming, totalOverdue };
}

/** Check if the Notification API is available. */
function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Get the current notification permission. */
function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all bills from the local database and expose CRUD operations. */
export function useBills(): UseBillsResult {
  const db = useDatabase();

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission());

  /** Trigger a re-fetch of all bills. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const result = getAllBills(db);
      setBills(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bills.');
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const summary = computeBillsSummary(bills);

  const createBill = useCallback(
    (input: CreateBillInput): Bill | null => {
      try {
        const created = repoCreateBill(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create bill.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateBill = useCallback(
    (billId: SyncId, updates: UpdateBillInput): Bill | null => {
      try {
        const updated = repoUpdateBill(db, billId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update bill.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteBill = useCallback(
    (billId: SyncId): boolean => {
      try {
        const deleted = repoDeleteBill(db, billId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete bill.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  const markPaid = useCallback(
    (billId: SyncId): Bill | null => {
      try {
        const updated = repoMarkBillPaid(db, billId);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark bill as paid.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const requestNotificationPermission = useCallback(async (): Promise<
    NotificationPermission | 'unsupported'
  > => {
    if (!isNotificationSupported()) {
      return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  }, []);

  return {
    bills,
    summary,
    loading,
    error,
    notificationPermission,
    refresh,
    createBill,
    updateBill,
    deleteBill,
    markPaid,
    requestNotificationPermission,
  };
}
