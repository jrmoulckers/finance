// SPDX-License-Identifier: BUSL-1.1

import type { IconName } from '../../components/icons';

export type MilestoneCategory =
  | 'net-worth'
  | 'goal-progress'
  | 'savings-streak'
  | 'debt-reduction'
  | 'debt-payoff';

export interface GoalSnapshot {
  readonly goalId: string;
  readonly goalName: string;
  readonly currentAmountCents: number;
  readonly targetAmountCents: number;
  readonly progressPercent: number;
}

export interface LiabilitySnapshot {
  readonly accountId: string;
  readonly accountName: string;
  readonly balanceCents: number;
}

export interface MilestoneSnapshot {
  readonly netWorthCents: number;
  readonly totalDebtCents: number;
  readonly savingsStreakMonths: number;
  readonly goals: Readonly<Record<string, GoalSnapshot>>;
  readonly liabilities: Readonly<Record<string, LiabilitySnapshot>>;
}

export interface DebtBaselineState {
  readonly totalDebtCents: number;
  readonly accountBaselines: Readonly<Record<string, number>>;
}

export interface MilestoneStorageState {
  readonly snapshot: MilestoneSnapshot | null;
  readonly shownMilestoneIds: readonly string[];
  readonly debtBaselines: DebtBaselineState;
}

export interface DetectedMilestone {
  readonly id: string;
  readonly category: MilestoneCategory;
  readonly title: string;
  readonly message: string;
  readonly icon: IconName;
  readonly badge: string;
  readonly confetti: boolean;
  readonly createdAt: string;
}

export interface NetWorthThreshold {
  readonly thresholdCents: number;
  readonly title: string;
  readonly icon: IconName;
  readonly confetti: boolean;
}

export interface GoalProgressThreshold {
  readonly percent: 25 | 50 | 75 | 100;
  readonly title: string;
  readonly icon: IconName;
  readonly confetti: boolean;
}

export interface SavingsStreakThreshold {
  readonly months: number;
  readonly title: string;
  readonly icon: IconName;
  readonly confetti: boolean;
}

export interface DebtReductionThreshold {
  readonly percent: 25 | 50 | 75 | 100;
  readonly title: string;
  readonly icon: IconName;
  readonly confetti: boolean;
}

export interface DetectMilestonesInput {
  readonly previous: MilestoneSnapshot;
  readonly current: MilestoneSnapshot;
  readonly shownMilestoneIds: ReadonlySet<string>;
  readonly debtBaselines: DebtBaselineState;
  readonly now: string;
}
