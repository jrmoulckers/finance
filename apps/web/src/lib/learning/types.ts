// SPDX-License-Identifier: BUSL-1.1

import type { ContextualTipKey, GlossaryKey } from '../education';

export type LearningDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type LearningTopic = 'budgeting' | 'saving' | 'debt' | 'investing' | 'tax';

export interface LessonExample {
  readonly title: string;
  readonly scenario: string;
  readonly takeaway: string;
}

export interface LearningQuizOption {
  readonly id: string;
  readonly text: string;
}

export interface LearningQuizQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly LearningQuizOption[];
  readonly correctOptionId: string;
  readonly explanation: string;
}

export interface LearningLesson {
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  readonly summary: string;
  readonly difficulty: LearningDifficulty;
  readonly estimatedMinutes: number;
  readonly learningObjectives: readonly string[];
  readonly content: readonly string[];
  readonly example: LessonExample;
  readonly glossaryKeys: readonly GlossaryKey[];
  readonly contextualTipKeys: readonly ContextualTipKey[];
  readonly quiz: readonly LearningQuizQuestion[];
}

export interface LearningModule {
  readonly id: string;
  readonly title: string;
  readonly topic: LearningTopic;
  readonly difficulty: LearningDifficulty;
  readonly description: string;
  readonly whyItMatters: string;
  readonly estimatedHours: number;
  readonly lessons: readonly LearningLesson[];
}

export interface LessonCompletion {
  readonly completedAt: string;
  readonly completionCount: number;
}

export interface QuizScore {
  readonly bestPercent: number;
  readonly lastPercent: number;
  readonly attempts: number;
  readonly lastAttemptedAt: string | null;
}

export interface LearningStreak {
  readonly currentDays: number;
  readonly longestDays: number;
  readonly lastActiveOn: string | null;
}

export interface LearningProgressState {
  readonly version: number;
  readonly completedLessonIds: readonly string[];
  readonly completions: Readonly<Record<string, LessonCompletion>>;
  readonly quizScores: Readonly<Record<string, QuizScore>>;
  readonly streak: LearningStreak;
}

export interface ModuleProgressSummary {
  readonly moduleId: string;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly completionPercent: number;
  readonly bestQuizPercent: number | null;
}

export interface LearningOverview {
  readonly totalLessons: number;
  readonly completedLessons: number;
  readonly completionPercent: number;
  readonly bestQuizPercent: number | null;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

export interface LearningBadge {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly earned: boolean;
  readonly earnedAt: string | null;
  readonly tone: 'starter' | 'momentum' | 'mastery';
}

export interface LearningKnowledgeGap {
  readonly lessonId: string;
  readonly moduleId: string;
  readonly quizPercent: number;
  readonly severity: 'medium' | 'high';
  readonly reason: string;
}

export interface LearningActivityProfile {
  readonly hasBudget: boolean;
  readonly budgetUtilization: number | null;
  readonly hasEmergencyGoal: boolean;
  readonly savingsMonthsCovered: number;
  readonly hasDebtAccounts: boolean;
  readonly hasInvestmentAccounts: boolean;
  readonly hasTaxableIncome: boolean;
  readonly monthlySurplusCents: number;
  readonly activeGoalCount: number;
  readonly transactionCount: number;
}

export interface AdaptiveLessonRecommendation {
  readonly lessonId: string;
  readonly moduleId: string;
  readonly title: string;
  readonly topic: LearningTopic;
  readonly difficulty: LearningDifficulty;
  readonly reason: string;
  readonly priority: number;
  readonly signal: 'activity' | 'knowledge-gap' | 'progression';
}
