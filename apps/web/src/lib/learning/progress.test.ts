// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LEARNING_MODULES } from './curriculum';
import {
  createEmptyLearningProgress,
  findKnowledgeGaps,
  getLearningBadges,
  getLearningOverview,
  markLessonCompleted,
  recordQuizScore,
} from './progress';

describe('learning progress helpers', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('tracks completed lessons and streak days', () => {
    const start = markLessonCompleted(
      createEmptyLearningProgress(),
      'budget-foundations',
      '2025-01-10T12:00:00.000Z',
    );
    const nextDay = markLessonCompleted(start, 'envelope-method', '2025-01-11T12:00:00.000Z');

    expect(nextDay.completedLessonIds).toEqual(['budget-foundations', 'envelope-method']);
    expect(nextDay.streak.currentDays).toBe(2);
    expect(nextDay.streak.longestDays).toBe(2);
  });

  it('retains the best quiz score across attempts', () => {
    const firstAttempt = recordQuizScore(
      createEmptyLearningProgress(),
      'compound-growth',
      60,
      '2025-01-10T12:00:00.000Z',
    );
    const improved = recordQuizScore(
      firstAttempt,
      'compound-growth',
      90,
      '2025-01-10T13:00:00.000Z',
    );

    expect(improved.quizScores['compound-growth']).toMatchObject({
      attempts: 2,
      bestPercent: 90,
      lastPercent: 90,
    });
  });

  it('calculates overview and knowledge gaps', () => {
    let progress = createEmptyLearningProgress();
    progress = markLessonCompleted(progress, 'budget-foundations', '2025-01-10T12:00:00.000Z');
    progress = recordQuizScore(progress, 'budget-foundations', 45, '2025-01-10T12:05:00.000Z');

    const overview = getLearningOverview(LEARNING_MODULES, progress);
    const gaps = findKnowledgeGaps(LEARNING_MODULES, progress);

    expect(overview.completedLessons).toBe(1);
    expect(overview.totalLessons).toBe(20);
    expect(gaps).toEqual([
      {
        lessonId: 'budget-foundations',
        moduleId: 'budgeting-basics',
        quizPercent: 45,
        severity: 'high',
        reason: 'Revisit this lesson before moving deeper into the topic.',
      },
    ]);
  });

  it('awards milestone badges as progress increases', () => {
    let progress = createEmptyLearningProgress();
    for (const lesson of LEARNING_MODULES[0]?.lessons ?? []) {
      progress = markLessonCompleted(progress, lesson.id, '2025-01-10T12:00:00.000Z');
    }
    progress = recordQuizScore(progress, 'budget-foundations', 92, '2025-01-10T12:05:00.000Z');
    progress = recordQuizScore(progress, 'envelope-method', 95, '2025-01-10T12:06:00.000Z');
    progress = recordQuizScore(progress, 'fifty-thirty-twenty', 90, '2025-01-10T12:07:00.000Z');

    const earnedBadgeIds = getLearningBadges(LEARNING_MODULES, progress)
      .filter((badge) => badge.earned)
      .map((badge) => badge.id);

    expect(earnedBadgeIds).toContain('first-lesson');
    expect(earnedBadgeIds).toContain('budget-builder');
    expect(earnedBadgeIds).toContain('quiz-ace');
  });
});
