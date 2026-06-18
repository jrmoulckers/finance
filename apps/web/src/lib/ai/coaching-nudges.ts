// SPDX-License-Identifier: BUSL-1.1

export type CoachingTone = 'supportive' | 'celebratory' | 'protective';
export type NudgeSensitivity = 'low' | 'normal' | 'high';

export interface CoachingCategoryInput {
  readonly id: string;
  readonly name: string;
  readonly amountCents: number;
  readonly previousAmountCents?: number;
  readonly budgetCents?: number;
}

export interface CoachingGoalInput {
  readonly id: string;
  readonly name: string;
  readonly probability?: number;
  readonly monthlyGapCents?: number;
}

export interface DismissedNudge {
  readonly id: string;
  readonly until?: string;
}

export interface CoachingNudgeInput {
  readonly totalIncomeCents: number;
  readonly totalSpendingCents: number;
  readonly savingsRatePercent: number;
  readonly projectedCashFlowCents?: number;
  readonly categories?: readonly CoachingCategoryInput[];
  readonly goals?: readonly CoachingGoalInput[];
  readonly quietUntil?: string;
  readonly asOfDate?: string;
  readonly dismissedNudges?: readonly DismissedNudge[];
  readonly sensitivity?: NudgeSensitivity;
}

export interface CoachingNudge {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly expectedImpact: string;
  readonly suggestedAction: string;
  readonly priority: number;
  readonly tone: CoachingTone;
  readonly linkTarget: 'dashboard' | 'insights' | 'budgets' | 'goals' | 'transactions';
}

function formatDollars(cents: number): string {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

function isSuppressed(id: string, input: CoachingNudgeInput): boolean {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  if (input.quietUntil && input.quietUntil >= asOfDate) return true;
  return (input.dismissedNudges ?? []).some(
    (dismissed) =>
      dismissed.id === id && (dismissed.until === undefined || dismissed.until >= asOfDate),
  );
}

function sensitivityMultiplier(sensitivity: NudgeSensitivity | undefined): number {
  if (sensitivity === 'low') return 0.8;
  if (sensitivity === 'high') return 1.15;
  return 1;
}

function addNudge(nudges: CoachingNudge[], input: CoachingNudgeInput, nudge: CoachingNudge): void {
  if (isSuppressed(nudge.id, input)) return;
  if (nudges.some((existing) => existing.id === nudge.id)) return;
  nudges.push(nudge);
}

export function generateCoachingNudges(input: CoachingNudgeInput): readonly CoachingNudge[] {
  const nudges: CoachingNudge[] = [];
  const multiplier = sensitivityMultiplier(input.sensitivity);
  const netCashFlow = input.totalIncomeCents - input.totalSpendingCents;
  const projectedCashFlow = input.projectedCashFlowCents ?? netCashFlow;

  if (projectedCashFlow < 0) {
    addNudge(nudges, input, {
      id: 'protect-cash-flow',
      title: 'Protect this month’s cash flow',
      rationale: `Your projected cash flow is negative by ${formatDollars(projectedCashFlow)}.`,
      expectedImpact: `Finding ${formatDollars(Math.min(Math.abs(projectedCashFlow), 20_000))} of flexibility can reduce overdraft risk.`,
      suggestedAction:
        'Review the next three discretionary transactions before making new purchases.',
      priority: Math.round((95 + Math.min(30, Math.abs(projectedCashFlow) / 10_000)) * multiplier),
      tone: 'protective',
      linkTarget: 'dashboard',
    });
  }

  if (input.savingsRatePercent >= 25 && netCashFlow > 0) {
    addNudge(nudges, input, {
      id: 'reinforce-savings-momentum',
      title: 'Keep your savings momentum',
      rationale: `You are saving about ${input.savingsRatePercent}% of income this period.`,
      expectedImpact: 'Repeating this pattern can make future goal funding easier.',
      suggestedAction: 'Schedule a small automatic transfer while cash flow is positive.',
      priority: Math.round(72 * multiplier),
      tone: 'celebratory',
      linkTarget: 'goals',
    });
  } else if (input.totalIncomeCents > 0 && input.savingsRatePercent < 10) {
    addNudge(nudges, input, {
      id: 'start-small-savings-step',
      title: 'Try a small savings step',
      rationale: `Your current savings rate is ${input.savingsRatePercent}%, below a 10% starter target.`,
      expectedImpact: `A ${formatDollars(Math.max(2_500, input.totalIncomeCents * 0.02))} transfer would build momentum without a large change.`,
      suggestedAction: 'Move a small amount after your next paycheck clears.',
      priority: Math.round(78 * multiplier),
      tone: 'supportive',
      linkTarget: 'goals',
    });
  }

  const categories = [...(input.categories ?? [])].sort(
    (left, right) => right.amountCents - left.amountCents,
  );
  const overBudget = categories.find(
    (category) =>
      category.budgetCents !== undefined && category.amountCents > category.budgetCents * 1.1,
  );
  if (overBudget) {
    addNudge(nudges, input, {
      id: `budget-${overBudget.id}`,
      title: `Check ${overBudget.name} before the next purchase`,
      rationale: `${overBudget.name} is ${formatDollars(overBudget.amountCents - (overBudget.budgetCents ?? 0))} above its current budget.`,
      expectedImpact: `Pausing one planned ${overBudget.name.toLowerCase()} purchase could bring the category closer to plan.`,
      suggestedAction: `Open the ${overBudget.name} category and mark one upcoming expense as optional.`,
      priority: Math.round(82 * multiplier),
      tone: 'supportive',
      linkTarget: 'budgets',
    });
  }

  const growingCategory = categories.find(
    (category) =>
      category.previousAmountCents !== undefined &&
      category.previousAmountCents > 0 &&
      category.amountCents > category.previousAmountCents * 1.35,
  );
  if (growingCategory) {
    addNudge(nudges, input, {
      id: `category-growth-${growingCategory.id}`,
      title: `${growingCategory.name} is growing`,
      rationale: `${growingCategory.name} is up compared with your recent baseline.`,
      expectedImpact: `Reducing this category by 10% would free about ${formatDollars(growingCategory.amountCents * 0.1)}.`,
      suggestedAction: `Review the largest ${growingCategory.name.toLowerCase()} transaction this week.`,
      priority: Math.round(68 * multiplier),
      tone: 'supportive',
      linkTarget: 'insights',
    });
  }

  const goalAtRisk = (input.goals ?? [])
    .filter((goal) => goal.probability !== undefined && goal.probability < 0.6)
    .sort((left, right) => (left.probability ?? 1) - (right.probability ?? 1))[0];
  if (goalAtRisk) {
    addNudge(nudges, input, {
      id: `goal-${goalAtRisk.id}`,
      title: `Give ${goalAtRisk.name} a small boost`,
      rationale: `${goalAtRisk.name} is tracking below your preferred confidence level.`,
      expectedImpact: `Adding ${formatDollars(goalAtRisk.monthlyGapCents ?? 2_500)} this month can improve the path.`,
      suggestedAction:
        'Choose one smaller recurring contribution rather than a large one-time move.',
      priority: Math.round(76 * multiplier),
      tone: 'supportive',
      linkTarget: 'goals',
    });
  }

  return nudges.sort((left, right) => right.priority - left.priority).slice(0, 5);
}
