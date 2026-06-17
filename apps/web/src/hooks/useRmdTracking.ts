// SPDX-License-Identifier: BUSL-1.1

import { useMemo } from 'react';
import { calculateRmdStatuses, type RmdAccountStatus } from '../lib/rmd';
import { useAccounts } from './useAccounts';
import { useTransactions } from './useTransactions';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export interface UseRmdTrackingResult {
  statuses: RmdAccountStatus[];
  reminders: RmdAccountStatus[];
  dueCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRmdTracking(currentAge: number): UseRmdTrackingResult {
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts();
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const yearFilters = useMemo(
    () => ({
      startDate: formatLocalDate(new Date(currentYear, 0, 1)),
      endDate: formatLocalDate(new Date(currentYear, 11, 31)),
    }),
    [currentYear],
  );
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions(yearFilters);

  const statuses = useMemo(
    () => calculateRmdStatuses(accounts, transactions, currentAge, today),
    [accounts, transactions, currentAge, today],
  );
  const reminders = useMemo(
    () =>
      statuses.filter((status) => status.urgency === 'due-soon' || status.urgency === 'overdue'),
    [statuses],
  );

  return {
    statuses,
    reminders,
    dueCount: statuses.filter((status) => !status.isSatisfied).length,
    loading: accountsLoading || transactionsLoading,
    error: accountsError ?? transactionsError,
    refresh: () => {
      refreshAccounts();
      refreshTransactions();
    },
  };
}
