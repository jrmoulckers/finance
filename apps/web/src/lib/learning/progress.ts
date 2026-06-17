// SPDX-License-Identifier: BUSL-1.1

import type {
  LearningBadge,
  LearningKnowledgeGap,
  LearningModule,
  LearningOverview,
  LearningProgressState,
  LearningStreak,
  ModuleProgressSummary,
  QuizScore,
} from './types';

const STORAGE_KEY = 'finance:learning-progress';
const STORAGE_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY_STREAK: LearningStreak = {
  currentDays: 0,
  longestDays: 0,
  lastActiveOn: null,
};

export function createEmptyLearningProgress(): LearningProgressState {
  return {
    version: STORAGE_VERSION,
    completedLessonIds: [],
    completions: {},
    quizScores: {},
    streak: EMPTY_STREAK,
  };
}

function toDayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function updateStreak(streak: LearningStreak, activityAt: string): LearningStreak {
  const activeDay = toDayKey(activityAt);

  if (streak.lastActiveOn === activeDay) {
    return streak;
  }

  if (streak.lastActiveOn === null) {
    return {
      currentDays: 1,
      longestDays: 1,
      lastActiveOn: activeDay,
    };
  }

  const gapDays = Math.round(
    (new Date(`${activeDay}T00:00:00.000Z`).getTime() -
      new Date(`${streak.lastActiveOn}T00:00:00.000Z`).getTime()) /
      DAY_MS,
  );
  const currentDays = gapDays === 1 ? streak.currentDays + 1 : 1;

  return {
    currentDays,
    longestDays: Math.max(streak.longestDays, currentDays),
    lastActiveOn: activeDay,
  };
}

function normalizeQuizScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function loadLearningProgress(): LearningProgressState {
  if (typeof window === 'undefined') {
    return createEmptyLearningProgress();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyLearningProgress();
    }

    const parsed = JSON.parse(raw) as Partial<LearningProgressState>;
    return {
      version: STORAGE_VERSION,
      completedLessonIds: Array.isArray(parsed.completedLessonIds) ? parsed.completedLessonIds : [],
      completions: parsed.completions ?? {},
      quizScores: parsed.quizScores ?? {},
      streak: {
        currentDays: parsed.streak?.currentDays ?? 0,
        longestDays: parsed.streak?.longestDays ?? 0,
        lastActiveOn: parsed.streak?.lastActiveOn ?? null,
      },
    };
  } catch {
    return createEmptyLearningProgress();
  }
}

export function saveLearningProgress(progress: LearningProgressState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage failures in constrained browsers.
  }
}

export function isLessonCompleted(progress: LearningProgressState, lessonId: string): boolean {
  return progress.completedLessonIds.includes(lessonId);
}

export function markLessonCompleted(
  progress: LearningProgressState,
  lessonId: string,
  completedAt = new Date().toISOString(),
): LearningProgressState {
  const completedLessonIds = progress.completedLessonIds.includes(lessonId)
    ? [...progress.completedLessonIds]
    : [...progress.completedLessonIds, lessonId];
  const previous = progress.completions[lessonId];

  return {
    ...progress,
    completedLessonIds,
    completions: {
      ...progress.completions,
      [lessonId]: {
        completedAt,
        completionCount: (previous?.completionCount ?? 0) + 1,
      },
    },
    streak: updateStreak(progress.streak, completedAt),
  };
}

export function recordQuizScore(
  progress: LearningProgressState,
  lessonId: string,
  percent: number,
  attemptedAt = new Date().toISOString(),
): LearningProgressState {
  const score = normalizeQuizScore(percent);
  const previous: QuizScore | undefined = progress.quizScores[lessonId];

  return {
    ...progress,
    quizScores: {
      ...progress.quizScores,
      [lessonId]: {
        bestPercent: Math.max(previous?.bestPercent ?? 0, score),
        lastPercent: score,
        attempts: (previous?.attempts ?? 0) + 1,
        lastAttemptedAt: attemptedAt,
      },
    },
    streak: updateStreak(progress.streak, attemptedAt),
  };
}

export function getModuleProgress(
  module: LearningModule,
  progress: LearningProgressState,
): ModuleProgressSummary {
  const completedLessons = module.lessons.filter((lesson) =>
    progress.completedLessonIds.includes(lesson.id),
  ).length;
  const bestQuizScores = module.lessons
    .map((lesson) => progress.quizScores[lesson.id]?.bestPercent ?? null)
    .filter((value): value is number => value !== null);

  return {
    moduleId: module.id,
    completedLessons,
    totalLessons: module.lessons.length,
    completionPercent: Math.round((completedLessons / module.lessons.length) * 100),
    bestQuizPercent:
      bestQuizScores.length > 0
        ? Math.round(
            bestQuizScores.reduce((sum, score) => sum + score, 0) /
              Math.max(bestQuizScores.length, 1),
          )
        : null,
  };
}

export function getLearningOverview(
  modules: readonly LearningModule[],
  progress: LearningProgressState,
): LearningOverview {
  const totalLessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const completedLessons = progress.completedLessonIds.length;
  const quizScores = Object.values(progress.quizScores).map((score) => score.bestPercent);

  return {
    totalLessons,
    completedLessons,
    completionPercent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
    bestQuizPercent:
      quizScores.length > 0
        ? Math.round(quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length)
        : null,
    currentStreak: progress.streak.currentDays,
    longestStreak: progress.streak.longestDays,
  };
}

export function findKnowledgeGaps(
  modules: readonly LearningModule[],
  progress: LearningProgressState,
  masteryThreshold = 70,
): LearningKnowledgeGap[] {
  return modules.flatMap((module) =>
    module.lessons.flatMap((lesson) => {
      const score = progress.quizScores[lesson.id];
      if (!score || score.bestPercent >= masteryThreshold) {
        return [];
      }

      return [
        {
          lessonId: lesson.id,
          moduleId: module.id,
          quizPercent: score.bestPercent,
          severity: score.bestPercent < 50 ? 'high' : 'medium',
          reason:
            score.bestPercent < 50
              ? 'Revisit this lesson before moving deeper into the topic.'
              : 'A quick review would reinforce the key concept.',
        } satisfies LearningKnowledgeGap,
      ];
    }),
  );
}

function findEarnedAt(
  progress: LearningProgressState,
  lessonIds: readonly string[],
): string | null {
  return (
    lessonIds
      .map((lessonId) => progress.completions[lessonId]?.completedAt ?? null)
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null
  );
}

export function getLearningBadges(
  modules: readonly LearningModule[],
  progress: LearningProgressState,
): LearningBadge[] {
  const totalLessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const highScores = Object.values(progress.quizScores).filter((score) => score.bestPercent >= 90);
  const budgetingModule = modules.find((module) => module.id === 'budgeting-basics');
  const savingModule = modules.find((module) => module.id === 'saving-emergency-funds');
  const budgetingComplete = budgetingModule
    ? budgetingModule.lessons.every((lesson) => progress.completedLessonIds.includes(lesson.id))
    : false;
  const savingComplete = savingModule
    ? savingModule.lessons.every((lesson) => progress.completedLessonIds.includes(lesson.id))
    : false;

  return [
    {
      id: 'first-lesson',
      title: 'First Lesson',
      description: 'Complete your first lesson.',
      earned: progress.completedLessonIds.length >= 1,
      earnedAt:
        progress.completedLessonIds.length >= 1
          ? findEarnedAt(progress, progress.completedLessonIds)
          : null,
      tone: 'starter',
    },
    {
      id: 'budget-builder',
      title: 'Budget Builder',
      description: 'Finish the Budgeting Basics module.',
      earned: budgetingComplete,
      earnedAt:
        budgetingComplete && budgetingModule
          ? findEarnedAt(
              progress,
              budgetingModule.lessons.map((lesson) => lesson.id),
            )
          : null,
      tone: 'starter',
    },
    {
      id: 'safety-net',
      title: 'Safety Net',
      description: 'Finish the Saving & Emergency Funds module.',
      earned: savingComplete,
      earnedAt:
        savingComplete && savingModule
          ? findEarnedAt(
              progress,
              savingModule.lessons.map((lesson) => lesson.id),
            )
          : null,
      tone: 'momentum',
    },
    {
      id: 'quiz-ace',
      title: 'Quiz Ace',
      description: 'Score 90%+ on three lessons.',
      earned: highScores.length >= 3,
      earnedAt:
        highScores.length >= 3
          ? (highScores
              .map((score) => score.lastAttemptedAt)
              .filter(Boolean)
              .sort()[0] ?? null)
          : null,
      tone: 'momentum',
    },
    {
      id: 'lifelong-learner',
      title: 'Lifelong Learner',
      description: 'Complete the full learning path.',
      earned: totalLessons > 0 && progress.completedLessonIds.length >= totalLessons,
      earnedAt:
        totalLessons > 0 && progress.completedLessonIds.length >= totalLessons
          ? findEarnedAt(progress, progress.completedLessonIds)
          : null,
      tone: 'mastery',
    },
  ];
}
