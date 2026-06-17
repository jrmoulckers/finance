// SPDX-License-Identifier: BUSL-1.1

import type { Account, Category, Goal, Transaction } from '../../kmp/bridge';
import { analyzeSpendingByCategory, isLiquidAccountType } from '../insights';
import { calculateContributionPlan } from './contributionSchedule';
import type {
  ExistingSavingsGoal,
  SavingsAnalysisSnapshot,
  SpendingCategoryTrend,
  SuggestedGoalPriority,
  SuggestedGoalType,
  SuggestedSavingsGoal,
  WishlistItem,
} from './types';

const ESSENTIAL_CATEGORY_KEYWORDS = [
  'rent',
  'mortgage',
  'housing',
  'utility',
  'utilities',
  'insurance',
  'debt',
  'loan',
  'medical',
  'healthcare',
  'groceries',
  'childcare',
  'tax',
];
const EMERGENCY_GOAL_KEYWORDS = ['emergency', 'rainy day', 'runway', 'buffer'];
const RETIREMENT_GOAL_KEYWORDS = ['retirement', '401k', 'ira', 'roth', 'pension', 'nest egg'];
const DEBT_GOAL_KEYWORDS = ['debt', 'payoff', 'loan', 'credit card', 'student loan'];
const MONTHS_IN_TRAILING_AVERAGE = 3;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeAmount(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function isExpenseWithinWindow(
  transaction: Transaction,
  startDate: string,
  endDate: string,
): boolean {
  return (
    transaction.type === 'EXPENSE' && transaction.date >= startDate && transaction.date <= endDate
  );
}

function isIncomeWithinWindow(
  transaction: Transaction,
  startDate: string,
  endDate: string,
): boolean {
  return (
    transaction.type === 'INCOME' && transaction.date >= startDate && transaction.date <= endDate
  );
}

function sumTransactions(
  transactions: readonly Transaction[],
  matcher: (transaction: Transaction) => boolean,
): number {
  return transactions.reduce(
    (sum, transaction) => (matcher(transaction) ? sum + normalizeAmount(transaction) : sum),
    0,
  );
}

function classifyExistingGoal(goal: Goal): ExistingSavingsGoal['classification'] {
  const haystack = `${goal.name} ${goal.description ?? ''}`.toLowerCase();

  if (EMERGENCY_GOAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'emergency-fund';
  }

  if (RETIREMENT_GOAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'retirement';
  }

  if (DEBT_GOAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'debt-payoff';
  }

  return 'wishlist';
}

function isEssentialCategory(categoryName: string): boolean {
  const normalized = categoryName.toLowerCase();
  return ESSENTIAL_CATEGORY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function createSuggestion(args: {
  id: string;
  type: SuggestedGoalType;
  title: string;
  reason: string;
  reasoning: readonly string[];
  priority: SuggestedGoalPriority;
  targetCents: number;
  currentCents: number;
  targetDate?: string | null;
  linkedGoalId?: string | null;
  redirectCategoryNames?: readonly string[];
  monthlyCapacityCents: number;
  desiredMonthlyContributionCents: number;
}): SuggestedSavingsGoal {
  const shortfallCents = Math.max(args.targetCents - args.currentCents, 0);

  return {
    id: args.id,
    type: args.type,
    title: args.title,
    reason: args.reason,
    reasoning: args.reasoning,
    priority: args.priority,
    targetCents: args.targetCents,
    currentCents: args.currentCents,
    shortfallCents,
    targetDate: args.targetDate ?? null,
    linkedGoalId: args.linkedGoalId ?? null,
    redirectCategoryNames: [...(args.redirectCategoryNames ?? [])],
    contributionPlan: calculateContributionPlan({
      targetCents: args.targetCents,
      currentCents: args.currentCents,
      monthlyCapacityCents: args.monthlyCapacityCents,
      desiredMonthlyContributionCents: args.desiredMonthlyContributionCents,
    }),
  };
}

function getPriorityRank(priority: SuggestedGoalPriority): number {
  switch (priority) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    default:
      return 2;
  }
}

function monthsUntil(targetDate: string | null, now: Date): number | null {
  if (!targetDate) {
    return null;
  }

  const target = new Date(`${targetDate}T00:00:00`);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
}

export function buildSavingsAnalysisSnapshot(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  categories: readonly Category[],
  goals: readonly Goal[],
  now: Date = new Date(),
): SavingsAnalysisSnapshot {
  const trailingStart = toIsoDate(shiftDays(now, -89));
  const trailingEnd = toIsoDate(now);
  const currentWeekStart = toIsoDate(shiftDays(now, -6));
  const previousWeekStart = toIsoDate(shiftDays(now, -13));
  const previousWeekEnd = toIsoDate(shiftDays(now, -7));
  const startOfYear = `${now.getFullYear()}-01-01`;

  const trailingIncome = sumTransactions(transactions, (transaction) =>
    isIncomeWithinWindow(transaction, trailingStart, trailingEnd),
  );
  const trailingExpenses = sumTransactions(transactions, (transaction) =>
    isExpenseWithinWindow(transaction, trailingStart, trailingEnd),
  );
  const currentWeekIncome = sumTransactions(transactions, (transaction) =>
    isIncomeWithinWindow(transaction, currentWeekStart, trailingEnd),
  );
  const currentWeekExpenses = sumTransactions(transactions, (transaction) =>
    isExpenseWithinWindow(transaction, currentWeekStart, trailingEnd),
  );
  const previousWeekIncome = sumTransactions(transactions, (transaction) =>
    isIncomeWithinWindow(transaction, previousWeekStart, previousWeekEnd),
  );
  const previousWeekExpenses = sumTransactions(transactions, (transaction) =>
    isExpenseWithinWindow(transaction, previousWeekStart, previousWeekEnd),
  );

  const investmentAccountIds = new Set(
    accounts.filter((account) => account.type === 'INVESTMENT').map((account) => account.id),
  );
  const currentYearRetirementContributionCents = transactions.reduce((sum, transaction) => {
    const contributesToInvestment =
      transaction.date >= startOfYear &&
      ((transaction.type === 'TRANSFER' &&
        transaction.transferAccountId !== null &&
        investmentAccountIds.has(transaction.transferAccountId)) ||
        ((transaction.type === 'INCOME' || transaction.type === 'TRANSFER') &&
          investmentAccountIds.has(transaction.accountId)));

    return contributesToInvestment ? sum + normalizeAmount(transaction) : sum;
  }, 0);

  const monthlyRetirementContributionCents = Math.round(
    transactions.reduce((sum, transaction) => {
      const contributesToInvestment =
        transaction.date >= trailingStart &&
        ((transaction.type === 'TRANSFER' &&
          transaction.transferAccountId !== null &&
          investmentAccountIds.has(transaction.transferAccountId)) ||
          ((transaction.type === 'INCOME' || transaction.type === 'TRANSFER') &&
            investmentAccountIds.has(transaction.accountId)));

      return contributesToInvestment ? sum + normalizeAmount(transaction) : sum;
    }, 0) / MONTHS_IN_TRAILING_AVERAGE,
  );

  const liquidSavingsCents = accounts.reduce((sum, account) => {
    if (
      !account.isArchived &&
      account.currentBalance.amount > 0 &&
      isLiquidAccountType(account.type)
    ) {
      return sum + account.currentBalance.amount;
    }

    return sum;
  }, 0);

  const retirementSavingsCents = accounts.reduce((sum, account) => {
    if (!account.isArchived && account.type === 'INVESTMENT' && account.currentBalance.amount > 0) {
      return sum + account.currentBalance.amount;
    }

    return sum;
  }, 0);

  const debtAccounts = accounts
    .filter(
      (account) =>
        !account.isArchived &&
        (account.type === 'CREDIT_CARD' || account.type === 'LOAN') &&
        account.currentBalance.amount < 0,
    )
    .map((account) => ({
      accountId: account.id,
      name: account.name,
      balanceCents: Math.abs(account.currentBalance.amount),
    }));

  const existingGoals = goals
    .filter((goal) => goal.status !== 'CANCELLED' && goal.status !== 'COMPLETED')
    .map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetCents: goal.targetAmount.amount,
      currentCents: goal.currentAmount.amount,
      targetDate: goal.targetDate,
      classification: classifyExistingGoal(goal),
    }));

  const wishlistItems: WishlistItem[] = existingGoals
    .filter((goal) => goal.classification === 'wishlist' && goal.targetCents > goal.currentCents)
    .map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      currentCents: goal.currentCents,
      targetDate: goal.targetDate,
      linkedGoalId: goal.id,
    }));

  const spendingAnalysis = analyzeSpendingByCategory(transactions, categories, now);
  const discretionaryCategories: SpendingCategoryTrend[] = spendingAnalysis.topCategories.map(
    (category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      monthlySpendCents: category.currentAmount,
      previousMonthlySpendCents: category.previousAmount,
      shareOfSpendingPercent: category.shareOfSpending,
      essential: isEssentialCategory(category.categoryName),
    }),
  );

  const reducibleCategories = discretionaryCategories
    .filter((category) => !category.essential && category.monthlySpendCents > 0)
    .sort((left, right) => {
      if (right.monthlySpendCents !== left.monthlySpendCents) {
        return right.monthlySpendCents - left.monthlySpendCents;
      }

      return right.previousMonthlySpendCents - left.previousMonthlySpendCents;
    });

  const discretionaryRedirectCents = reducibleCategories
    .slice(0, 2)
    .reduce((sum, category) => sum + Math.round(category.monthlySpendCents * 0.15), 0);

  const monthlyIncomeCents = Math.round(trailingIncome / MONTHS_IN_TRAILING_AVERAGE);
  const monthlyExpensesCents = Math.round(trailingExpenses / MONTHS_IN_TRAILING_AVERAGE);

  return {
    currencyCode: accounts[0]?.currency.code ?? goals[0]?.currency.code ?? 'USD',
    monthlyIncomeCents,
    monthlyExpensesCents,
    monthlySurplusCents: monthlyIncomeCents - monthlyExpensesCents,
    annualizedIncomeCents: monthlyIncomeCents * 12,
    liquidSavingsCents,
    retirementSavingsCents,
    monthlyRetirementContributionCents,
    currentYearRetirementContributionCents,
    currentWeeklySavingsCents: currentWeekIncome - currentWeekExpenses,
    previousWeeklySavingsCents: previousWeekIncome - previousWeekExpenses,
    discretionaryCategories: reducibleCategories,
    discretionaryRedirectCents,
    existingGoals,
    wishlistItems,
    debtAccounts,
  };
}

export function suggestSavingsGoals(
  snapshot: SavingsAnalysisSnapshot,
  now: Date = new Date(),
): SuggestedSavingsGoal[] {
  const suggestions: SuggestedSavingsGoal[] = [];
  const redirectNames = snapshot.discretionaryCategories
    .slice(0, 2)
    .map((category) => category.categoryName);
  const totalDebtCents = snapshot.debtAccounts.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const availableCapacityCents =
    Math.max(snapshot.monthlySurplusCents, 0) + snapshot.discretionaryRedirectCents;
  const emergencyGoal = snapshot.existingGoals.find(
    (goal) => goal.classification === 'emergency-fund',
  );
  const retirementGoal = snapshot.existingGoals.find(
    (goal) => goal.classification === 'retirement',
  );
  const emergencyFundFloorCents = snapshot.monthlyExpensesCents * 3;
  const emergencyFundStretchCents = snapshot.monthlyExpensesCents * 6;
  const currentRunwayMonths =
    snapshot.monthlyExpensesCents > 0
      ? snapshot.liquidSavingsCents / snapshot.monthlyExpensesCents
      : Number.POSITIVE_INFINITY;

  if (
    snapshot.monthlyExpensesCents > 0 &&
    snapshot.liquidSavingsCents < emergencyFundStretchCents
  ) {
    const emergencyTargetCents =
      snapshot.liquidSavingsCents < emergencyFundFloorCents
        ? emergencyFundFloorCents
        : emergencyFundStretchCents;
    const emergencyGapCents = Math.max(emergencyTargetCents - snapshot.liquidSavingsCents, 0);

    suggestions.push(
      createSuggestion({
        id: emergencyGoal?.id ?? 'suggested-emergency-fund',
        type: 'emergency-fund',
        title: emergencyGoal?.name ?? 'Build your emergency fund',
        reason:
          currentRunwayMonths < 3
            ? 'Your current cash buffer is below the typical 3-month safety baseline.'
            : 'You have a starter buffer — stretching to 6 months increases resilience.',
        reasoning: [
          `Your liquid accounts cover about ${currentRunwayMonths.toFixed(1)} months of expenses today.`,
          `A ${snapshot.liquidSavingsCents < emergencyFundFloorCents ? '3' : '6'}-month emergency buffer is about $${(emergencyTargetCents / 100).toLocaleString()}.`,
          redirectNames.length > 0
            ? `Redirecting a slice of ${redirectNames.join(' and ')} can accelerate this without touching essentials.`
            : 'Even small, automatic transfers can rebuild this buffer over time.',
        ],
        priority: currentRunwayMonths < 3 ? 'high' : 'medium',
        targetCents: emergencyTargetCents,
        currentCents: snapshot.liquidSavingsCents,
        linkedGoalId: emergencyGoal?.id ?? null,
        redirectCategoryNames: redirectNames,
        monthlyCapacityCents: Math.max(availableCapacityCents, Math.ceil(emergencyGapCents / 18)),
        desiredMonthlyContributionCents:
          currentRunwayMonths < 3
            ? Math.max(Math.ceil(emergencyGapCents / 12), Math.round(availableCapacityCents * 0.45))
            : Math.max(Math.ceil(emergencyGapCents / 18), Math.round(availableCapacityCents * 0.3)),
      }),
    );
  }

  if (snapshot.discretionaryCategories.length > 0 && snapshot.discretionaryRedirectCents > 0) {
    suggestions.push(
      createSuggestion({
        id: 'suggested-discretionary-buffer',
        type: 'discretionary-savings',
        title: `Redirect ${redirectNames.join(' and ')} into a flex savings bucket`,
        reason:
          'A small redirect from discretionary categories can create extra savings without changing essentials.',
        reasoning: [
          `${redirectNames.join(' and ')} make up ${snapshot.discretionaryCategories.slice(0, 2).reduce((sum, category) => sum + category.shareOfSpendingPercent, 0)}% of your visible monthly spending.`,
          `Moving about 15% of those categories would free roughly $${(snapshot.discretionaryRedirectCents / 100).toLocaleString()} each month.`,
          'Use this bucket for planned splurges or to cover surprise expenses without dipping into essentials.',
        ],
        priority:
          snapshot.monthlySurplusCents < snapshot.discretionaryRedirectCents ? 'high' : 'medium',
        targetCents: snapshot.discretionaryRedirectCents * 6,
        currentCents: 0,
        redirectCategoryNames: redirectNames,
        monthlyCapacityCents: Math.max(snapshot.discretionaryRedirectCents, availableCapacityCents),
        desiredMonthlyContributionCents: snapshot.discretionaryRedirectCents,
      }),
    );
  }

  for (const wishlistItem of snapshot.wishlistItems.slice(0, 2)) {
    const monthsToWishlistDate = monthsUntil(wishlistItem.targetDate, now);
    const remainingCents = Math.max(wishlistItem.targetCents - wishlistItem.currentCents, 0);
    suggestions.push(
      createSuggestion({
        id: `wishlist-${wishlistItem.id}`,
        type: 'big-purchase',
        title: `Finish funding ${wishlistItem.name}`,
        reason:
          'Your existing wishlist goal becomes easier to hit with a steady monthly contribution instead of ad-hoc transfers.',
        reasoning: [
          `You still need $${(remainingCents / 100).toLocaleString()} to reach ${wishlistItem.name}.`,
          wishlistItem.targetDate
            ? `At your selected pace, aim to finish before ${new Date(
                `${wishlistItem.targetDate}T00:00:00`,
              ).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              })}.`
            : 'Adding a target month can make the timeline more concrete.',
          redirectNames.length > 0
            ? `${redirectNames[0]} alone could cover a meaningful slice of this each month.`
            : 'A recurring transfer keeps the goal moving even in variable-spend months.',
        ],
        priority: monthsToWishlistDate !== null && monthsToWishlistDate <= 6 ? 'high' : 'medium',
        targetCents: wishlistItem.targetCents,
        currentCents: wishlistItem.currentCents,
        targetDate: wishlistItem.targetDate,
        linkedGoalId: wishlistItem.linkedGoalId,
        redirectCategoryNames: redirectNames,
        monthlyCapacityCents: Math.max(availableCapacityCents, Math.ceil(remainingCents / 12)),
        desiredMonthlyContributionCents:
          monthsToWishlistDate !== null
            ? Math.ceil(remainingCents / monthsToWishlistDate)
            : Math.ceil(remainingCents / 12),
      }),
    );
  }

  if (snapshot.monthlyIncomeCents > 0) {
    const recommendedRetirementRate = 0.15;
    const recommendedMonthlyRetirementCents = Math.round(
      snapshot.monthlyIncomeCents * recommendedRetirementRate,
    );
    const currentRetirementRate =
      snapshot.monthlyIncomeCents > 0
        ? Math.round(
            (snapshot.monthlyRetirementContributionCents / snapshot.monthlyIncomeCents) * 1000,
          ) / 10
        : 0;
    const retirementTargetDate = `${now.getFullYear()}-12-31`;

    if (currentRetirementRate < 15) {
      suggestions.push(
        createSuggestion({
          id: retirementGoal?.id ?? 'suggested-retirement',
          type: 'retirement',
          title: retirementGoal?.name ?? 'Increase retirement contributions',
          reason:
            'A 15% retirement savings rate is a strong baseline for long-term wealth building.',
          reasoning: [
            `Based on your recent income, about $${(recommendedMonthlyRetirementCents / 100).toLocaleString()} per month would put you near a 15% retirement savings rate.`,
            currentRetirementRate > 0
              ? `You are currently contributing about ${currentRetirementRate}% of income toward retirement.`
              : 'No recurring retirement contribution pattern is visible yet in your local data.',
            `You already have $${(snapshot.retirementSavingsCents / 100).toLocaleString()} in retirement accounts — keep compounding on your side.`,
          ],
          priority: currentRetirementRate < 8 ? 'high' : 'medium',
          targetCents: Math.round(snapshot.annualizedIncomeCents * recommendedRetirementRate),
          currentCents: snapshot.currentYearRetirementContributionCents,
          targetDate: retirementTargetDate,
          linkedGoalId: retirementGoal?.id ?? null,
          monthlyCapacityCents: Math.max(availableCapacityCents, recommendedMonthlyRetirementCents),
          desiredMonthlyContributionCents: recommendedMonthlyRetirementCents,
        }),
      );
    }
  }

  if (totalDebtCents > 0) {
    suggestions.push(
      createSuggestion({
        id: 'suggested-debt-payoff',
        type: 'debt-payoff',
        title: 'Accelerate your debt payoff',
        reason:
          'Redirecting even part of your monthly surplus can shorten the time you carry high-cost balances.',
        reasoning: [
          `You have about $${(totalDebtCents / 100).toLocaleString()} in credit card or loan balances.`,
          snapshot.monthlySurplusCents > 0
            ? `Using half of your recent monthly surplus would add momentum without committing every spare dollar.`
            : 'A small redirect from discretionary spending can still create a meaningful extra payment.',
          redirectNames.length > 0
            ? `${redirectNames.join(' and ')} are the clearest categories to trim first if you want an extra debt payment.`
            : 'Start with a fixed extra payment so progress feels predictable month to month.',
        ],
        priority: totalDebtCents > snapshot.monthlyIncomeCents * 0.5 ? 'high' : 'medium',
        targetCents: totalDebtCents,
        currentCents: 0,
        redirectCategoryNames: redirectNames,
        monthlyCapacityCents: Math.max(availableCapacityCents, Math.ceil(totalDebtCents / 18)),
        desiredMonthlyContributionCents: Math.max(
          Math.round(Math.max(snapshot.monthlySurplusCents, 0) * 0.5),
          Math.ceil(totalDebtCents / 18),
        ),
      }),
    );
  }

  return suggestions.sort((left, right) => {
    if (getPriorityRank(left.priority) !== getPriorityRank(right.priority)) {
      return getPriorityRank(left.priority) - getPriorityRank(right.priority);
    }

    if (left.linkedGoalId !== right.linkedGoalId) {
      return left.linkedGoalId === null ? -1 : 1;
    }

    return left.shortfallCents - right.shortfallCents;
  });
}
