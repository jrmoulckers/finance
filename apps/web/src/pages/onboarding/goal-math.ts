// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure goal/date math and small predicates for the onboarding flow. Extracted
 * from `OnboardingPage.tsx` (#3712).
 */

import { LIFE_STAGE_OPTIONS } from './content';
import type { GoalDraft, LifeStageId } from './types';

export function firstOfCurrentMonthISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isLifeStageId(value: string): value is LifeStageId {
  return LIFE_STAGE_OPTIONS.some((option) => option.id === value);
}

export function calculateMonthlyContribution(draft: GoalDraft): number {
  const targetAmount = Number(draft.targetAmount) || 0;
  const startingBalance = Number(draft.startingBalance) || 0;
  const remainingAmount = Math.max(targetAmount - startingBalance, 0);

  if (!draft.targetDate) {
    return remainingAmount;
  }

  const today = new Date();
  const targetDate = new Date(`${draft.targetDate}T00:00:00`);
  const monthDelta =
    (targetDate.getFullYear() - today.getFullYear()) * 12 +
    targetDate.getMonth() -
    today.getMonth();
  const months = Math.max(monthDelta, 1);

  return Math.ceil(remainingAmount / months);
}
