// SPDX-License-Identifier: BUSL-1.1

/**
 * Gamification achievements engine.
 *
 * Defines achievement badges, streak tracking, and milestone calculation
 * based on user financial data. All logic is pure — no side effects.
 *
 * All monetary values are in cents (integers).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Achievement category. */
export type AchievementCategory = 'budgeting' | 'saving' | 'tracking' | 'milestone';

/** Achievement unlock status. */
export type AchievementStatus = 'locked' | 'unlocked' | 'new';

/** A single achievement badge definition. */
export interface Achievement {
  /** Unique identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Description of how to earn this achievement. */
  readonly description: string;
  /** Emoji icon for the badge. */
  readonly icon: string;
  /** Category grouping. */
  readonly category: AchievementCategory;
  /** Current status. */
  readonly status: AchievementStatus;
  /** Progress toward unlocking (0-100). */
  readonly progress: number;
  /** Optional date when achieved (ISO string). */
  readonly unlockedAt?: string;
}

/** Streak data for consistent financial behavior. */
export interface StreakData {
  /** Current streak count (e.g., days of budget adherence). */
  readonly current: number;
  /** Longest streak ever achieved. */
  readonly longest: number;
  /** Streak type identifier. */
  readonly type: 'budget_adherence' | 'daily_logging' | 'savings_contribution';
  /** Display label. */
  readonly label: string;
}

/** A progress milestone for goals. */
export interface GoalMilestone {
  /** Goal ID. */
  readonly goalId: string;
  /** Goal name. */
  readonly goalName: string;
  /** Current progress percentage (0-100). */
  readonly progress: number;
  /** Milestones that have been reached (25, 50, 75, 100). */
  readonly milestonesReached: number[];
  /** Next milestone to reach. */
  readonly nextMilestone: number | null;
}

/** Input data for computing gamification state. */
export interface GamificationInput {
  /** Total number of transactions ever recorded. */
  transactionCount: number;
  /** Number of months with budget adherence (spent <= budget). */
  budgetAdherenceMonths: number;
  /** Number of active budgets. */
  budgetCount: number;
  /** Current month budget adherence ratio (spent / budgeted, where < 1 is good). */
  currentBudgetRatio: number;
  /** Number of savings goals. */
  goalCount: number;
  /** Number of completed goals. */
  goalsCompleted: number;
  /** Per-goal progress data. */
  goalProgress: Array<{
    goalId: string;
    goalName: string;
    currentAmount: number;
    targetAmount: number;
  }>;
  /** Number of consecutive days with at least one transaction logged. */
  dailyLoggingStreak: number;
  /** Longest daily logging streak. */
  longestDailyLoggingStreak: number;
  /** Net worth in cents. */
  netWorth: number;
  /** Number of accounts. */
  accountCount: number;
  /** Total amount saved across all goals in cents. */
  totalSaved: number;
  /** Number of categories used. */
  categoriesUsed: number;
}

/** Complete gamification state. */
export interface GamificationState {
  achievements: Achievement[];
  streaks: StreakData[];
  milestones: GoalMilestone[];
  totalPoints: number;
  level: number;
  levelName: string;
  pointsToNextLevel: number;
}

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------

interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  check: (input: GamificationInput) => { unlocked: boolean; progress: number };
  points: number;
}

const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // Tracking achievements
  {
    id: 'first-transaction',
    name: 'First Step',
    description: 'Log your first transaction',
    icon: '👣',
    category: 'tracking',
    check: (input) => ({
      unlocked: input.transactionCount >= 1,
      progress: Math.min(input.transactionCount, 1) * 100,
    }),
    points: 10,
  },
  {
    id: 'transaction-10',
    name: 'Getting Started',
    description: 'Log 10 transactions',
    icon: '📝',
    category: 'tracking',
    check: (input) => ({
      unlocked: input.transactionCount >= 10,
      progress: Math.min(Math.round((input.transactionCount / 10) * 100), 100),
    }),
    points: 25,
  },
  {
    id: 'transaction-100',
    name: 'Dedicated Tracker',
    description: 'Log 100 transactions',
    icon: '📊',
    category: 'tracking',
    check: (input) => ({
      unlocked: input.transactionCount >= 100,
      progress: Math.min(Math.round((input.transactionCount / 100) * 100), 100),
    }),
    points: 50,
  },
  {
    id: 'transaction-500',
    name: 'Finance Master',
    description: 'Log 500 transactions',
    icon: '🏆',
    category: 'tracking',
    check: (input) => ({
      unlocked: input.transactionCount >= 500,
      progress: Math.min(Math.round((input.transactionCount / 500) * 100), 100),
    }),
    points: 100,
  },
  {
    id: 'daily-streak-7',
    name: 'Week Warrior',
    description: 'Log transactions for 7 consecutive days',
    icon: '🔥',
    category: 'tracking',
    check: (input) => ({
      unlocked: input.longestDailyLoggingStreak >= 7,
      progress: Math.min(Math.round((input.longestDailyLoggingStreak / 7) * 100), 100),
    }),
    points: 30,
  },
  {
    id: 'daily-streak-30',
    name: 'Monthly Champion',
    description: 'Log transactions for 30 consecutive days',
    icon: '💪',
    category: 'tracking',
    check: (input) => ({
      unlocked: input.longestDailyLoggingStreak >= 30,
      progress: Math.min(Math.round((input.longestDailyLoggingStreak / 30) * 100), 100),
    }),
    points: 75,
  },

  // Budgeting achievements
  {
    id: 'first-budget',
    name: 'Budget Beginner',
    description: 'Create your first budget',
    icon: '📋',
    category: 'budgeting',
    check: (input) => ({
      unlocked: input.budgetCount >= 1,
      progress: Math.min(input.budgetCount, 1) * 100,
    }),
    points: 15,
  },
  {
    id: 'budget-under',
    name: 'Under Budget',
    description: 'Stay under budget for a month',
    icon: '✨',
    category: 'budgeting',
    check: (input) => ({
      unlocked: input.budgetAdherenceMonths >= 1,
      progress: Math.min(input.budgetAdherenceMonths, 1) * 100,
    }),
    points: 30,
  },
  {
    id: 'budget-streak-3',
    name: 'Budget Streak',
    description: 'Stay under budget for 3 consecutive months',
    icon: '🎯',
    category: 'budgeting',
    check: (input) => ({
      unlocked: input.budgetAdherenceMonths >= 3,
      progress: Math.min(Math.round((input.budgetAdherenceMonths / 3) * 100), 100),
    }),
    points: 75,
  },

  // Saving achievements
  {
    id: 'first-goal',
    name: 'Goal Setter',
    description: 'Create your first savings goal',
    icon: '🎯',
    category: 'saving',
    check: (input) => ({
      unlocked: input.goalCount >= 1,
      progress: Math.min(input.goalCount, 1) * 100,
    }),
    points: 15,
  },
  {
    id: 'goal-completed',
    name: 'Goal Crusher',
    description: 'Complete a savings goal',
    icon: '🏅',
    category: 'saving',
    check: (input) => ({
      unlocked: input.goalsCompleted >= 1,
      progress: Math.min(input.goalsCompleted, 1) * 100,
    }),
    points: 50,
  },
  {
    id: 'saved-1000',
    name: 'First Thousand',
    description: 'Save $1,000 across all goals',
    icon: '💰',
    category: 'saving',
    check: (input) => ({
      unlocked: input.totalSaved >= 100000,
      progress: Math.min(Math.round((input.totalSaved / 100000) * 100), 100),
    }),
    points: 40,
  },
  {
    id: 'saved-10000',
    name: 'Serious Saver',
    description: 'Save $10,000 across all goals',
    icon: '💎',
    category: 'saving',
    check: (input) => ({
      unlocked: input.totalSaved >= 1000000,
      progress: Math.min(Math.round((input.totalSaved / 1000000) * 100), 100),
    }),
    points: 100,
  },

  // Milestone achievements
  {
    id: 'first-account',
    name: 'Account Opener',
    description: 'Add your first account',
    icon: '🏦',
    category: 'milestone',
    check: (input) => ({
      unlocked: input.accountCount >= 1,
      progress: Math.min(input.accountCount, 1) * 100,
    }),
    points: 10,
  },
  {
    id: 'multi-account',
    name: 'Diversified',
    description: 'Track 3 or more accounts',
    icon: '🗂️',
    category: 'milestone',
    check: (input) => ({
      unlocked: input.accountCount >= 3,
      progress: Math.min(Math.round((input.accountCount / 3) * 100), 100),
    }),
    points: 25,
  },
  {
    id: 'category-organizer',
    name: 'Well Organized',
    description: 'Use 5 or more spending categories',
    icon: '🏷️',
    category: 'milestone',
    check: (input) => ({
      unlocked: input.categoriesUsed >= 5,
      progress: Math.min(Math.round((input.categoriesUsed / 5) * 100), 100),
    }),
    points: 20,
  },
  {
    id: 'positive-net-worth',
    name: 'In the Green',
    description: 'Achieve positive net worth',
    icon: '🌿',
    category: 'milestone',
    check: (input) => ({
      unlocked: input.netWorth > 0 && input.accountCount > 0,
      progress: input.netWorth > 0 ? 100 : 0,
    }),
    points: 30,
  },
];

// ---------------------------------------------------------------------------
// Level system
// ---------------------------------------------------------------------------

const LEVELS = [
  { threshold: 0, name: 'Newcomer' },
  { threshold: 50, name: 'Beginner' },
  { threshold: 150, name: 'Intermediate' },
  { threshold: 300, name: 'Advanced' },
  { threshold: 500, name: 'Expert' },
  { threshold: 750, name: 'Master' },
] as const;

function getLevel(points: number): { level: number; name: string; pointsToNext: number } {
  let currentLevel = 1;
  let currentName: string = LEVELS[0].name;
  let nextThreshold = LEVELS.length > 1 ? LEVELS[1].threshold : Infinity;

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (points >= LEVELS[i].threshold) {
      currentLevel = i + 1;
      currentName = LEVELS[i].name;
      nextThreshold = i + 1 < LEVELS.length ? LEVELS[i + 1].threshold : Infinity;
      break;
    }
  }

  return {
    level: currentLevel,
    name: currentName,
    pointsToNext: nextThreshold === Infinity ? 0 : nextThreshold - points,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

/**
 * Compute the complete gamification state from financial data.
 */
export function computeGamification(input: GamificationInput): GamificationState {
  // Compute achievements
  const achievements: Achievement[] = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const result = def.check(input);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      category: def.category,
      status: result.unlocked ? 'unlocked' : 'locked',
      progress: result.progress,
    };
  });

  // Compute total points from unlocked achievements
  const totalPoints = ACHIEVEMENT_DEFINITIONS.reduce((sum, def) => {
    const result = def.check(input);
    return sum + (result.unlocked ? def.points : 0);
  }, 0);

  const levelInfo = getLevel(totalPoints);

  // Compute streaks
  const streaks: StreakData[] = [
    {
      current: input.dailyLoggingStreak,
      longest: input.longestDailyLoggingStreak,
      type: 'daily_logging',
      label: 'Daily Logging',
    },
  ];

  // Compute goal milestones
  const milestones: GoalMilestone[] = input.goalProgress.map((goal) => {
    const progress =
      goal.targetAmount > 0
        ? Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100)
        : 0;

    const milestonesReached = MILESTONE_THRESHOLDS.filter((m) => progress >= m);
    const nextMilestone = MILESTONE_THRESHOLDS.find((m) => progress < m) ?? null;

    return {
      goalId: goal.goalId,
      goalName: goal.goalName,
      progress,
      milestonesReached,
      nextMilestone,
    };
  });

  return {
    achievements,
    streaks,
    milestones,
    totalPoints,
    level: levelInfo.level,
    levelName: levelInfo.name,
    pointsToNextLevel: levelInfo.pointsToNext,
  };
}

/**
 * Get the number of unlocked achievements.
 */
export function getUnlockedCount(achievements: Achievement[]): number {
  return achievements.filter((a) => a.status === 'unlocked').length;
}

/**
 * Get achievements filtered by category.
 */
export function getAchievementsByCategory(
  achievements: Achievement[],
  category: AchievementCategory,
): Achievement[] {
  return achievements.filter((a) => a.category === category);
}
