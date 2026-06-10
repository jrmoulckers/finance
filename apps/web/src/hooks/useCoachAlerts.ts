// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccounts } from './useAccounts';
import { useBudgets } from './useBudgets';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';
import {
  analyzeSpendingVelocity,
  detectSpendingAnomalies,
  generateCoachSuggestions,
  projectCashFlow,
  type CoachAlert,
  type CoachAnalysis,
  type CoachSeverity,
} from '../lib/coaching';

const DISMISSED_ALERTS_STORAGE_KEY = 'finance:coach-dismissed-alerts';

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function severityRank(severity: CoachSeverity): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function loadDismissedAlertIds(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function buildCoachAlerts(
  analysis: Omit<CoachAnalysis, 'alerts' | 'suggestions'>,
  today: string,
): CoachAlert[] {
  const alerts: CoachAlert[] = [];
  const monthKey = today.slice(0, 7);

  if (analysis.cashFlow.willOverdraft) {
    const largestExpense = analysis.cashFlow.recurringItems.find((item) => item.type === 'EXPENSE');
    alerts.push({
      id: `alert:cash-flow:${monthKey}`,
      severity: 'critical',
      type: 'cash-flow',
      title: 'Cash could dip below zero before month-end',
      message: `Projected month-end balance is ${formatCents(analysis.cashFlow.projectedEndBalanceCents)}.${
        largestExpense
          ? ` Upcoming ${largestExpense.label} adds about ${formatCents(largestExpense.projectedAmountCents)}.`
          : ''
      }`,
      actionLabel: 'Open cash flow',
      actionRoute: '/cash-flow',
      sortValue: Math.abs(analysis.cashFlow.projectedEndBalanceCents),
    });
  }

  for (const velocity of analysis.velocities.filter((item) => item.isOverspendRisk).slice(0, 3)) {
    alerts.push({
      id: `alert:budget:${velocity.budgetId}:${monthKey}`,
      severity: 'warning',
      type: 'budget-velocity',
      title: `${velocity.categoryName} is ahead of budget pace`,
      message: `${velocity.budgetName} is tracking toward ${formatCents(velocity.projectedSpendCents)} this month, about ${formatCents(velocity.paceGapCents)} above plan.`,
      actionLabel: 'Review budgets',
      actionRoute: '/budgets',
      sortValue: velocity.paceGapCents,
    });
  }

  for (const anomaly of analysis.anomalies.slice(0, 3)) {
    alerts.push({
      id: `alert:anomaly:${anomaly.categoryId}:${anomaly.date}`,
      severity: 'info',
      type: 'anomaly',
      title: `${anomaly.categoryName} spending spiked today`,
      message: `${formatCents(anomaly.todaySpendCents)} spent today is ${anomaly.ratio.toFixed(1)}× your recent ${anomaly.categoryName} daily average.`,
      actionLabel: 'View transactions',
      actionRoute: '/transactions',
      sortValue: anomaly.todaySpendCents,
    });
  }

  return alerts.sort((left, right) => {
    const severityDelta = severityRank(right.severity) - severityRank(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return right.sortValue - left.sortValue;
  });
}

export interface UseCoachAlertsResult {
  readonly analysis: CoachAnalysis | null;
  readonly alerts: readonly CoachAlert[];
  readonly topAlerts: readonly CoachAlert[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly dismissAlert: (alertId: string) => void;
  readonly clearDismissedAlerts: () => void;
  readonly dismissedAlertIds: ReadonlySet<string>;
}

export function useCoachAlerts(): UseCoachAlertsResult {
  const today = useMemo(() => formatLocalDate(new Date()), []);
  const lookbackStart = useMemo(
    () => formatLocalDate(addDays(parseLocalDate(today), -120)),
    [today],
  );
  const transactionFilters = useMemo(
    () => ({ startDate: lookbackStart, endDate: today }),
    [lookbackStart, today],
  );

  const { accounts, loading: accountsLoading, error: accountsError } = useAccounts();
  const { budgets, loading: budgetsLoading, error: budgetsError } = useBudgets();
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
  } = useTransactions(transactionFilters);

  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() =>
    loadDismissedAlertIds(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        DISMISSED_ALERTS_STORAGE_KEY,
        JSON.stringify(Array.from(dismissedAlertIds.values())),
      );
    } catch {
      // localStorage is best-effort only.
    }
  }, [dismissedAlertIds]);

  const loading = accountsLoading || budgetsLoading || categoriesLoading || transactionsLoading;
  const error = accountsError ?? budgetsError ?? categoriesError ?? transactionsError ?? null;

  const analysis = useMemo<CoachAnalysis | null>(() => {
    if (loading || error !== null) {
      return null;
    }

    const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
    const velocities = analyzeSpendingVelocity({ budgets, categoriesById, transactions, today });
    const cashFlow = projectCashFlow({ accounts, categoriesById, transactions, today });
    const anomalies = detectSpendingAnomalies({ categoriesById, transactions, today });
    const alerts = buildCoachAlerts({ velocities, cashFlow, anomalies }, today);
    const suggestions = generateCoachSuggestions({ velocities, cashFlow, anomalies });

    return {
      velocities,
      cashFlow,
      anomalies,
      alerts,
      suggestions,
    };
  }, [accounts, budgets, categories, error, loading, today, transactions]);

  const activeAlerts = useMemo(
    () => analysis?.alerts.filter((alert) => !dismissedAlertIds.has(alert.id)) ?? [],
    [analysis, dismissedAlertIds],
  );

  const dismissAlert = useCallback((alertId: string) => {
    setDismissedAlertIds((currentIds) => new Set([...currentIds, alertId]));
  }, []);

  const clearDismissedAlerts = useCallback(() => {
    setDismissedAlertIds(new Set());
  }, []);

  return {
    analysis,
    alerts: activeAlerts,
    topAlerts: activeAlerts.slice(0, 3),
    loading,
    error,
    dismissAlert,
    clearDismissedAlerts,
    dismissedAlertIds,
  };
}
