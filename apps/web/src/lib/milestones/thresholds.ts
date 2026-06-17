// SPDX-License-Identifier: BUSL-1.1

import type {
  DebtReductionThreshold,
  GoalProgressThreshold,
  NetWorthThreshold,
  SavingsStreakThreshold,
} from './types';

export const NET_WORTH_THRESHOLDS: readonly NetWorthThreshold[] = [
  { thresholdCents: 1_000_000, title: 'Net worth milestone!', icon: 'wallet', confetti: true },
  { thresholdCents: 2_500_000, title: 'Net worth milestone!', icon: 'wallet', confetti: true },
  { thresholdCents: 5_000_000, title: 'Net worth milestone!', icon: 'wallet', confetti: true },
  { thresholdCents: 10_000_000, title: 'Six figures unlocked!', icon: 'trophy', confetti: true },
  { thresholdCents: 25_000_000, title: 'Quarter-million club!', icon: 'medal', confetti: true },
  { thresholdCents: 50_000_000, title: 'Half-million milestone!', icon: 'medal', confetti: true },
  { thresholdCents: 100_000_000, title: 'Millionaire milestone!', icon: 'trophy', confetti: true },
] as const;

export const GOAL_PROGRESS_THRESHOLDS: readonly GoalProgressThreshold[] = [
  { percent: 25, title: 'Goal progress update', icon: 'target', confetti: false },
  { percent: 50, title: 'Halfway there!', icon: 'chart-bar', confetti: false },
  { percent: 75, title: 'Almost there!', icon: 'sparkles', confetti: true },
  { percent: 100, title: 'Goal achieved!', icon: 'trophy', confetti: true },
] as const;

export const SAVINGS_STREAK_THRESHOLDS: readonly SavingsStreakThreshold[] = [
  { months: 3, title: 'Savings streak started!', icon: 'flame', confetti: false },
  { months: 6, title: 'Savings streak milestone!', icon: 'flame', confetti: true },
  { months: 12, title: 'One year of positive savings!', icon: 'trophy', confetti: true },
] as const;

export const DEBT_REDUCTION_THRESHOLDS: readonly DebtReductionThreshold[] = [
  { percent: 25, title: 'Debt balance dropping!', icon: 'trending-down', confetti: false },
  { percent: 50, title: 'Debt cut in half!', icon: 'medal', confetti: true },
  { percent: 75, title: 'Debt nearly gone!', icon: 'sparkles', confetti: true },
  { percent: 100, title: 'Debt free!', icon: 'trophy', confetti: true },
] as const;
