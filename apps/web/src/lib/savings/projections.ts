// SPDX-License-Identifier: BUSL-1.1

import type {
  SuggestedGoalProjection,
  SuggestedGoalProjectionPoint,
  SuggestedSavingsGoal,
} from './types';

const MILESTONES = [25, 50, 75, 100];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function projectSuggestedGoal(
  suggestion: Pick<SuggestedSavingsGoal, 'targetCents' | 'currentCents' | 'targetDate'>,
  monthlyContributionCents: number,
  now: Date = new Date(),
): SuggestedGoalProjection {
  const currentCents = Math.max(suggestion.currentCents, 0);
  const targetCents = Math.max(suggestion.targetCents, 0);
  const shortfallCents = Math.max(targetCents - currentCents, 0);
  const completionPercent =
    targetCents > 0 ? Math.min(100, Math.round((currentCents / targetCents) * 100)) : 100;

  if (shortfallCents === 0) {
    const today = toIsoDate(now);
    return {
      projectedCompletionDate: today,
      monthsToGoal: 0,
      completionPercent: 100,
      onTrack: true,
      milestoneDates: MILESTONES.map((percent) => ({ label: `${percent}%`, date: today })),
      trajectory: [{ date: today, amountCents: targetCents }],
    };
  }

  if (monthlyContributionCents <= 0) {
    return {
      projectedCompletionDate: null,
      monthsToGoal: null,
      completionPercent,
      onTrack: false,
      milestoneDates: MILESTONES.map((percent) => ({ label: `${percent}%`, date: null })),
      trajectory: [{ date: toIsoDate(now), amountCents: currentCents }],
    };
  }

  const monthsToGoal = Math.ceil(shortfallCents / monthlyContributionCents);
  const projectedCompletionDate = toIsoDate(addMonths(now, monthsToGoal));
  const onTrack =
    suggestion.targetDate === null
      ? true
      : new Date(`${projectedCompletionDate}T00:00:00`).getTime() <=
        new Date(`${suggestion.targetDate}T00:00:00`).getTime();

  const trajectory: SuggestedGoalProjectionPoint[] = [
    { date: toIsoDate(now), amountCents: currentCents },
  ];
  for (let month = 1; month <= Math.min(monthsToGoal, 12); month += 1) {
    trajectory.push({
      date: toIsoDate(addMonths(now, month)),
      amountCents: Math.min(targetCents, currentCents + monthlyContributionCents * month),
    });
  }

  if (trajectory.at(-1)?.amountCents !== targetCents) {
    trajectory.push({ date: projectedCompletionDate, amountCents: targetCents });
  }

  return {
    projectedCompletionDate,
    monthsToGoal,
    completionPercent,
    onTrack,
    milestoneDates: MILESTONES.map((percent) => {
      const milestoneAmount = Math.ceil((targetCents * percent) / 100);
      if (milestoneAmount <= currentCents) {
        return { label: `${percent}%`, date: toIsoDate(now) };
      }

      const monthsUntilMilestone = Math.ceil(
        (milestoneAmount - currentCents) / monthlyContributionCents,
      );
      return {
        label: `${percent}%`,
        date: toIsoDate(addMonths(now, monthsUntilMilestone)),
      };
    }),
    trajectory,
  };
}
