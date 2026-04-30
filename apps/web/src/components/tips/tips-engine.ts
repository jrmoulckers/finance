// SPDX-License-Identifier: BUSL-1.1

/**
 * Contextual financial tips engine.
 *
 * Generates relevant financial advice based on the user's current financial
 * data. Tips are scored by relevance and returned in priority order.
 *
 * All monetary values are in cents (integers).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The context/page where a tip is relevant. */
export type TipContext =
  | 'dashboard'
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'goals'
  | 'general';

/** Severity/importance of a tip. */
export type TipSeverity = 'info' | 'warning' | 'success' | 'critical';

/** A single contextual financial tip. */
export interface FinancialTip {
  /** Unique identifier for the tip. */
  readonly id: string;
  /** Short headline for the tip. */
  readonly title: string;
  /** Detailed advice text. */
  readonly description: string;
  /** Which page/context this tip applies to. */
  readonly context: TipContext;
  /** Visual severity indicator. */
  readonly severity: TipSeverity;
  /** Relevance score (higher = more relevant). Used for sorting. */
  readonly score: number;
  /** Optional action label (e.g., "View Budgets"). */
  readonly actionLabel?: string;
  /** Optional route to navigate to when action is clicked. */
  readonly actionRoute?: string;
}

/** Financial data snapshot used to generate contextual tips. */
export interface TipGeneratorInput {
  /** Total net worth in cents. */
  netWorth: number;
  /** Total spending this month in cents. */
  spentThisMonth: number;
  /** Total income this month in cents. */
  incomeThisMonth: number;
  /** Total budgeted amount in cents. */
  monthlyBudget: number;
  /** Amount spent against budgets in cents. */
  budgetSpent: number;
  /** Number of accounts the user has. */
  accountCount: number;
  /** Number of active budgets. */
  budgetCount: number;
  /** Number of active savings goals. */
  goalCount: number;
  /** Number of transactions this month. */
  transactionCount: number;
  /** Number of goals that have been reached (100%+). */
  goalsReached: number;
  /** Average goal progress percentage (0-100). */
  averageGoalProgress: number;
  /** Day of month (1-31). */
  dayOfMonth: number;
}

// ---------------------------------------------------------------------------
// Tip generators
// ---------------------------------------------------------------------------

/** Generate budget-related tips based on spending patterns. */
function generateBudgetTips(input: TipGeneratorInput): FinancialTip[] {
  const tips: FinancialTip[] = [];

  if (input.budgetCount === 0) {
    tips.push({
      id: 'budget-create-first',
      title: 'Set up your first budget',
      description:
        'Creating a budget helps you track spending and stay on target. Start with your largest expense category.',
      context: 'budgets',
      severity: 'info',
      score: 80,
      actionLabel: 'Create Budget',
      actionRoute: '/budgets',
    });
  }

  if (input.monthlyBudget > 0 && input.budgetSpent > 0) {
    const budgetUsagePercent = Math.round((input.budgetSpent / input.monthlyBudget) * 100);
    const monthProgress = Math.round((input.dayOfMonth / 30) * 100);

    if (budgetUsagePercent > 90) {
      tips.push({
        id: 'budget-nearly-exceeded',
        title: 'Budget almost exhausted',
        description: `You've used ${budgetUsagePercent}% of your monthly budget. Consider slowing down discretionary spending for the rest of the month.`,
        context: 'budgets',
        severity: 'critical',
        score: 95,
        actionLabel: 'View Budgets',
        actionRoute: '/budgets',
      });
    } else if (budgetUsagePercent > 75 && monthProgress < 75) {
      tips.push({
        id: 'budget-ahead-of-pace',
        title: 'Spending ahead of pace',
        description: `You're ${budgetUsagePercent}% through your budget but only ${monthProgress}% through the month. Try to pace your spending more evenly.`,
        context: 'budgets',
        severity: 'warning',
        score: 85,
        actionLabel: 'View Budgets',
        actionRoute: '/budgets',
      });
    } else if (budgetUsagePercent < 50 && monthProgress > 50) {
      tips.push({
        id: 'budget-under-pace',
        title: 'Great budget discipline!',
        description: `You've only used ${budgetUsagePercent}% of your budget past the halfway point. Keep up the great work!`,
        context: 'budgets',
        severity: 'success',
        score: 60,
      });
    }
  }

  return tips;
}

/** Generate savings-goal-related tips. */
function generateGoalTips(input: TipGeneratorInput): FinancialTip[] {
  const tips: FinancialTip[] = [];

  if (input.goalCount === 0) {
    tips.push({
      id: 'goal-create-first',
      title: 'Start a savings goal',
      description:
        'Setting a specific savings goal makes you 42% more likely to save successfully. Try starting with an emergency fund.',
      context: 'goals',
      severity: 'info',
      score: 70,
      actionLabel: 'Create Goal',
      actionRoute: '/goals',
    });
  }

  if (input.goalsReached > 0) {
    tips.push({
      id: 'goal-congratulations',
      title: `Congratulations on reaching ${input.goalsReached} goal${input.goalsReached > 1 ? 's' : ''}!`,
      description:
        'You hit your savings target — consider setting a new, more ambitious goal to keep the momentum going.',
      context: 'goals',
      severity: 'success',
      score: 75,
      actionLabel: 'View Goals',
      actionRoute: '/goals',
    });
  }

  if (input.averageGoalProgress > 0 && input.averageGoalProgress < 25) {
    tips.push({
      id: 'goal-low-progress',
      title: 'Boost your savings progress',
      description:
        'Your goals are under 25% funded. Try setting up automatic transfers or redirecting small daily savings.',
      context: 'goals',
      severity: 'warning',
      score: 65,
    });
  }

  return tips;
}

/** Generate spending and transaction-related tips. */
function generateSpendingTips(input: TipGeneratorInput): FinancialTip[] {
  const tips: FinancialTip[] = [];

  if (input.incomeThisMonth > 0 && input.spentThisMonth > 0) {
    const savingsRate = Math.round(
      ((input.incomeThisMonth - input.spentThisMonth) / input.incomeThisMonth) * 100,
    );

    if (savingsRate >= 20) {
      tips.push({
        id: 'spending-great-savings-rate',
        title: `Excellent ${savingsRate}% savings rate!`,
        description:
          'Financial experts recommend saving at least 20% of income. You are meeting or exceeding this target.',
        context: 'dashboard',
        severity: 'success',
        score: 70,
      });
    } else if (savingsRate >= 0 && savingsRate < 10) {
      tips.push({
        id: 'spending-low-savings-rate',
        title: 'Consider saving more',
        description: `Your savings rate is ${savingsRate}%. Aim for at least 20% by identifying non-essential expenses you can reduce.`,
        context: 'dashboard',
        severity: 'warning',
        score: 80,
      });
    } else if (savingsRate < 0) {
      tips.push({
        id: 'spending-overspending',
        title: 'Spending exceeds income',
        description:
          'You are spending more than you earn this month. Review your transactions for areas where you can cut back.',
        context: 'dashboard',
        severity: 'critical',
        score: 95,
        actionLabel: 'View Transactions',
        actionRoute: '/transactions',
      });
    }
  }

  if (input.transactionCount === 0 && input.dayOfMonth > 5) {
    tips.push({
      id: 'spending-no-transactions',
      title: 'Start tracking your spending',
      description:
        'You have no transactions recorded this month. Adding transactions helps you understand your spending patterns.',
      context: 'transactions',
      severity: 'info',
      score: 75,
      actionLabel: 'Add Transaction',
      actionRoute: '/transactions',
    });
  }

  return tips;
}

/** Generate account-related tips. */
function generateAccountTips(input: TipGeneratorInput): FinancialTip[] {
  const tips: FinancialTip[] = [];

  if (input.accountCount === 0) {
    tips.push({
      id: 'account-create-first',
      title: 'Add your first account',
      description:
        'Adding accounts is the first step to getting a complete picture of your finances.',
      context: 'accounts',
      severity: 'info',
      score: 90,
      actionLabel: 'Add Account',
      actionRoute: '/accounts',
    });
  }

  if (input.netWorth < 0) {
    tips.push({
      id: 'account-negative-net-worth',
      title: 'Work toward positive net worth',
      description:
        'Your liabilities exceed your assets. Focus on paying down high-interest debt first while maintaining minimum payments on other obligations.',
      context: 'accounts',
      severity: 'warning',
      score: 85,
    });
  }

  return tips;
}

/** Generate general financial wellness tips. */
function generateGeneralTips(input: TipGeneratorInput): FinancialTip[] {
  const tips: FinancialTip[] = [];

  if (input.dayOfMonth <= 3) {
    tips.push({
      id: 'general-month-start',
      title: 'New month, fresh start',
      description:
        "The beginning of the month is a great time to review last month's spending and adjust your budget.",
      context: 'general',
      severity: 'info',
      score: 50,
      actionLabel: 'View Dashboard',
      actionRoute: '/dashboard',
    });
  }

  if (input.dayOfMonth >= 25) {
    tips.push({
      id: 'general-month-end',
      title: 'Month-end review',
      description:
        'The month is almost over. Review your spending to see how you did and plan for next month.',
      context: 'general',
      severity: 'info',
      score: 50,
    });
  }

  return tips;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate contextual financial tips based on user data.
 *
 * @param input - Financial data snapshot
 * @param context - Optional filter for a specific context/page
 * @param maxTips - Maximum number of tips to return (default: 3)
 * @returns Array of tips sorted by relevance score (highest first)
 */
export function generateTips(
  input: TipGeneratorInput,
  context?: TipContext,
  maxTips: number = 3,
): FinancialTip[] {
  const allTips = [
    ...generateBudgetTips(input),
    ...generateGoalTips(input),
    ...generateSpendingTips(input),
    ...generateAccountTips(input),
    ...generateGeneralTips(input),
  ];

  const filtered = context
    ? allTips.filter((tip) => tip.context === context || tip.context === 'general')
    : allTips;

  return filtered.sort((a, b) => b.score - a.score).slice(0, maxTips);
}

/**
 * Check whether a tip has been dismissed by the user.
 *
 * Uses localStorage to persist dismissed tip IDs.
 */
export function isTipDismissed(tipId: string): boolean {
  try {
    const dismissed = localStorage.getItem('finance_dismissed_tips');
    if (!dismissed) return false;
    const ids: string[] = JSON.parse(dismissed);
    return ids.includes(tipId);
  } catch {
    return false;
  }
}

/**
 * Mark a tip as dismissed so it won't show again.
 *
 * Uses localStorage to persist dismissed tip IDs.
 */
export function dismissTip(tipId: string): void {
  try {
    const dismissed = localStorage.getItem('finance_dismissed_tips');
    const ids: string[] = dismissed ? JSON.parse(dismissed) : [];
    if (!ids.includes(tipId)) {
      ids.push(tipId);
      localStorage.setItem('finance_dismissed_tips', JSON.stringify(ids));
    }
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Clear all dismissed tips (e.g., from settings).
 */
export function clearDismissedTips(): void {
  try {
    localStorage.removeItem('finance_dismissed_tips');
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
