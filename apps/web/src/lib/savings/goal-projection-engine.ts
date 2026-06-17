// SPDX-License-Identifier: BUSL-1.1

export type GoalProjectionState = 'behind' | 'on-track' | 'ahead' | 'complete';

export interface GoalProjectionInput {
  readonly startCents: number;
  readonly currentCents: number;
  readonly targetCents: number;
  readonly startDate: string;
  readonly dueDate: string;
  readonly today: string;
  readonly paychecksRemaining: number;
}

export interface GoalProjectionSummary {
  readonly remainingCents: number;
  readonly weeklyTargetCents: number;
  readonly paycheckTargetCents: number;
  readonly milestonePercent: number;
  readonly state: GoalProjectionState;
  readonly messageToken: string;
}

function days(start: string, end: string): number {
  return Math.max(0, Math.ceil((Date.parse(end) - Date.parse(start)) / 86_400_000));
}

export function projectGoalMilestones(input: GoalProjectionInput): GoalProjectionSummary {
  const remainingCents = Math.max(0, input.targetCents - input.currentCents);
  const weeksRemaining = Math.max(1, Math.ceil(days(input.today, input.dueDate) / 7));
  const totalDays = Math.max(1, days(input.startDate, input.dueDate));
  const elapsedDays = days(input.startDate, input.today);
  const expectedCents = input.startCents + Math.round((Math.max(0, input.targetCents - input.startCents) * elapsedDays) / totalDays);
  const milestonePercent = input.targetCents === 0 ? 100 : Math.min(100, Math.round((input.currentCents / input.targetCents) * 100));
  const state: GoalProjectionState = remainingCents === 0 ? 'complete' : input.currentCents + 500_00 < expectedCents ? 'behind' : input.currentCents > expectedCents + 500_00 ? 'ahead' : 'on-track';
  return {
    remainingCents,
    weeklyTargetCents: Math.ceil(remainingCents / weeksRemaining),
    paycheckTargetCents: Math.ceil(remainingCents / Math.max(1, input.paychecksRemaining)),
    milestonePercent,
    state,
    messageToken: `goal.${state}`,
  };
}
