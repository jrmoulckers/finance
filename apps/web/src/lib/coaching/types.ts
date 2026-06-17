// SPDX-License-Identifier: BUSL-1.1

import type { Account, AccountType, Budget, Transaction } from '../../kmp/bridge';

export type CoachSeverity = 'critical' | 'warning' | 'info';
export type CoachAlertType = 'cash-flow' | 'budget-velocity' | 'anomaly';
export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly';

export type BudgetWithMonthlyContext = Pick<
  Budget,
  'id' | 'categoryId' | 'name' | 'amount' | 'period' | 'startDate' | 'endDate'
>;

export interface BudgetVelocity {
  readonly id: string;
  readonly budgetId: string;
  readonly budgetName: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly budgetAmountCents: number;
  readonly spentCents: number;
  readonly remainingCents: number;
  readonly daysElapsed: number;
  readonly daysRemaining: number;
  readonly daysInMonth: number;
  readonly projectedSpendCents: number;
  readonly expectedSpendToDateCents: number;
  readonly paceGapCents: number;
  readonly recommendedDailySpendCents: number;
  readonly isOverspendRisk: boolean;
}

export interface CashFlowAccountSnapshot {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: AccountType;
  readonly balanceCents: number;
}

export interface RecurringCashFlowItem {
  readonly id: string;
  readonly label: string;
  readonly type: 'INCOME' | 'EXPENSE';
  readonly cadence: RecurrenceCadence;
  readonly averageAmountCents: number;
  readonly occurrencesRemaining: number;
  readonly nextExpectedDate: string;
  readonly projectedAmountCents: number;
  readonly sourceTransactionIds: readonly string[];
}

export interface CashFlowProjection {
  readonly currentBalanceCents: number;
  readonly projectedRecurringIncomeCents: number;
  readonly projectedRecurringExpenseCents: number;
  readonly projectedDiscretionaryExpenseCents: number;
  readonly projectedEndBalanceCents: number;
  readonly daysRemaining: number;
  readonly willOverdraft: boolean;
  readonly balanceSnapshots: readonly CashFlowAccountSnapshot[];
  readonly recurringItems: readonly RecurringCashFlowItem[];
}

export interface SpendingAnomaly {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly date: string;
  readonly todaySpendCents: number;
  readonly baselineDailySpendCents: number;
  readonly ratio: number;
  readonly transactionCount: number;
}

export interface CoachAlert {
  readonly id: string;
  readonly severity: CoachSeverity;
  readonly type: CoachAlertType;
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly actionRoute?: string;
  readonly sortValue: number;
}

export interface CoachSuggestion {
  readonly id: string;
  readonly severity: CoachSeverity;
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly actionRoute?: string;
}

export interface CoachAnalysis {
  readonly velocities: readonly BudgetVelocity[];
  readonly cashFlow: CashFlowProjection;
  readonly anomalies: readonly SpendingAnomaly[];
  readonly alerts: readonly CoachAlert[];
  readonly suggestions: readonly CoachSuggestion[];
}

export interface SpendingVelocityInput {
  readonly budgets: readonly BudgetWithMonthlyContext[];
  readonly categoriesById: ReadonlyMap<string, string>;
  readonly transactions: readonly Transaction[];
  readonly today?: string;
}

export interface CashFlowProjectionInput {
  readonly accounts: readonly Account[];
  readonly categoriesById: ReadonlyMap<string, string>;
  readonly transactions: readonly Transaction[];
  readonly today?: string;
}

export interface AnomalyDetectionInput {
  readonly categoriesById: ReadonlyMap<string, string>;
  readonly transactions: readonly Transaction[];
  readonly today?: string;
  readonly lookbackDays?: number;
}

export interface SuggestionInput {
  readonly velocities: readonly BudgetVelocity[];
  readonly cashFlow: CashFlowProjection;
  readonly anomalies: readonly SpendingAnomaly[];
}
