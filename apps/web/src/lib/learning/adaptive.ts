// SPDX-License-Identifier: BUSL-1.1

import type { Account, Goal, Transaction } from '../../kmp/bridge';
import type { DashboardData } from '../../hooks/useDashboardData';
import { LEARNING_MODULES } from './curriculum';
import { findKnowledgeGaps, getLearningOverview } from './progress';
import type {
  AdaptiveLessonRecommendation,
  LearningActivityProfile,
  LearningLesson,
  LearningModule,
  LearningProgressState,
  LearningTopic,
} from './types';

function hasEmergencyGoal(goals: readonly Goal[]): boolean {
  return goals.some(
    (goal) => /emergency/i.test(goal.name) || /emergency/i.test(goal.description ?? ''),
  );
}

function monthsCovered(savingsAccounts: readonly Account[], spentThisMonth: number): number {
  const totalSavings = savingsAccounts.reduce(
    (sum, account) => sum + account.currentBalance.amount,
    0,
  );
  if (spentThisMonth <= 0) {
    return totalSavings > 0 ? Number.POSITIVE_INFINITY : 0;
  }

  return totalSavings / spentThisMonth;
}

export function buildLearningActivityProfile(input: {
  dashboardData: DashboardData | null;
  accounts: readonly Account[];
  goals: readonly Goal[];
  transactions: readonly Transaction[];
}): LearningActivityProfile {
  const { dashboardData, accounts, goals, transactions } = input;
  const hasBudget = (dashboardData?.monthlyBudget ?? 0) > 0;
  const budgetUtilization =
    dashboardData !== null && dashboardData.monthlyBudget > 0
      ? dashboardData.budgetSpent / dashboardData.monthlyBudget
      : null;
  const savingsAccounts = accounts.filter((account) => account.type === 'SAVINGS');
  const hasDebtAccounts = accounts.some(
    (account) => account.type === 'CREDIT_CARD' || account.type === 'LOAN',
  );
  const hasInvestmentAccounts = accounts.some((account) => account.type === 'INVESTMENT');
  const monthlySurplusCents =
    (dashboardData?.incomeThisMonth ?? 0) - (dashboardData?.spentThisMonth ?? 0);

  return {
    hasBudget,
    budgetUtilization,
    hasEmergencyGoal: hasEmergencyGoal(goals),
    savingsMonthsCovered: monthsCovered(savingsAccounts, dashboardData?.spentThisMonth ?? 0),
    hasDebtAccounts,
    hasInvestmentAccounts,
    hasTaxableIncome: (dashboardData?.incomeThisMonth ?? 0) > 0,
    monthlySurplusCents,
    activeGoalCount: goals.filter((goal) => goal.status === 'ACTIVE').length,
    transactionCount: transactions.length,
  };
}

function getTopicWeights(profile: LearningActivityProfile): Record<LearningTopic, number> {
  const weights: Record<LearningTopic, number> = {
    budgeting: 0,
    saving: 0,
    debt: 0,
    investing: 0,
    tax: 0,
  };

  if (!profile.hasBudget || (profile.budgetUtilization ?? 0) >= 0.85) {
    weights.budgeting += 40;
  }

  if (!profile.hasEmergencyGoal || profile.savingsMonthsCovered < 1) {
    weights.saving += 38;
  }

  if (profile.hasDebtAccounts) {
    weights.debt += 34;
  }

  if (profile.monthlySurplusCents > 0) {
    weights.investing += 18;
    weights.tax += 6;
  }

  if (profile.hasInvestmentAccounts) {
    weights.investing += 26;
    weights.tax += 8;
  }

  if (profile.hasTaxableIncome) {
    weights.tax += 8;
  }

  if (profile.transactionCount === 0) {
    weights.budgeting += 12;
    weights.saving += 12;
  }

  if (Object.values(weights).every((value) => value === 0)) {
    weights.budgeting = 25;
    weights.saving = 20;
    weights.investing = 10;
  }

  return weights;
}

function getNextLessonIdsByModule(
  modules: readonly LearningModule[],
  progress: LearningProgressState,
): Set<string> {
  const ids = new Set<string>();

  for (const module of modules) {
    const nextLesson = module.lessons.find(
      (lesson) => !progress.completedLessonIds.includes(lesson.id),
    );
    if (nextLesson) {
      ids.add(nextLesson.id);
    }
  }

  return ids;
}

function lessonReason(
  module: LearningModule,
  lesson: LearningLesson,
  profile: LearningActivityProfile,
  topicWeights: Record<LearningTopic, number>,
  isGap: boolean,
  isNextLesson: boolean,
): { reason: string; signal: AdaptiveLessonRecommendation['signal'] } {
  if (isGap) {
    return {
      reason:
        'A recent quiz score suggests this concept needs a quick refresher before you move on.',
      signal: 'knowledge-gap',
    };
  }

  if (topicWeights[module.topic] >= 30) {
    switch (module.id) {
      case 'budgeting-basics':
        return {
          reason: profile.hasBudget
            ? 'Your current budget looks stretched, so this lesson can tighten day-to-day decision making.'
            : 'You do not have a monthly budget yet, so this is the strongest first step.',
          signal: 'activity',
        };
      case 'saving-emergency-funds':
        return {
          reason:
            profile.hasEmergencyGoal && profile.savingsMonthsCovered < 1
              ? 'You have started saving, but your cash buffer still looks thin for a real emergency.'
              : 'Building accessible cash is a high-value next move for your current financial picture.',
          signal: 'activity',
        };
      case 'debt-management':
        return {
          reason:
            'Debt-related accounts are active, so this lesson is directly relevant to your current money choices.',
          signal: 'activity',
        };
      case 'investing-fundamentals':
        return {
          reason:
            'Your finances show room to invest, making this a timely lesson to build long-term habits.',
          signal: 'activity',
        };
      default:
        return {
          reason:
            'You already have taxable income or investments, so tax efficiency can immediately improve outcomes.',
          signal: 'activity',
        };
    }
  }

  if (isNextLesson) {
    return {
      reason: 'This is the next lesson in sequence for your current module progress.',
      signal: 'progression',
    };
  }

  return {
    reason:
      'This lesson keeps your learning path balanced across the core personal finance topics.',
    signal: 'progression',
  };
}

export function suggestNextLessons(input: {
  modules?: readonly LearningModule[];
  progress: LearningProgressState;
  activityProfile: LearningActivityProfile;
  limit?: number;
}): AdaptiveLessonRecommendation[] {
  const modules = input.modules ?? LEARNING_MODULES;
  const { progress, activityProfile, limit = 4 } = input;
  const overview = getLearningOverview(modules, progress);
  const gaps = new Set(findKnowledgeGaps(modules, progress).map((gap) => gap.lessonId));
  const topicWeights = getTopicWeights(activityProfile);
  const nextLessonIds = getNextLessonIdsByModule(modules, progress);

  return modules
    .flatMap((module) =>
      module.lessons.flatMap((lesson, lessonIndex) => {
        const completed = progress.completedLessonIds.includes(lesson.id);
        const isGap = gaps.has(lesson.id);
        if (completed && !isGap) {
          return [];
        }

        let priority = topicWeights[module.topic];
        if (isGap) {
          priority += 60;
        }
        if (nextLessonIds.has(lesson.id)) {
          priority += 22;
        }
        if (lesson.difficulty === 'beginner' && overview.completionPercent < 35) {
          priority += 12;
        }
        if (lesson.difficulty === 'advanced' && overview.completionPercent < 20) {
          priority -= 10;
        }
        priority -= lessonIndex;

        const { reason, signal } = lessonReason(
          module,
          lesson,
          activityProfile,
          topicWeights,
          isGap,
          nextLessonIds.has(lesson.id),
        );

        return [
          {
            lessonId: lesson.id,
            moduleId: module.id,
            title: lesson.title,
            topic: module.topic,
            difficulty: lesson.difficulty,
            reason,
            priority,
            signal,
          } satisfies AdaptiveLessonRecommendation,
        ];
      }),
    )
    .sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title))
    .slice(0, limit);
}
