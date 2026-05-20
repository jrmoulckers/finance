// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for financial education feed engine.
 *
 * References: #1729
 */

import { describe, it, expect } from 'vitest';
import {
  getAgeBracket,
  getLessonsForAge,
  getLessonsByTopic,
  getTopics,
  getNextLesson,
  completeLesson,
  getTopicCompletionPercent,
  getAverageQuizScore,
  getEarnedBadges,
  createBadge,
  getEducationSummary,
} from './education-feed';
import type { EducationLesson, LessonProgress, ProgressBadge } from './types';

const NOW = '2025-01-15T12:00:00.000Z';

function makeLesson(overrides: Partial<EducationLesson> = {}): EducationLesson {
  return {
    id: 'lesson-1',
    title: 'What is Money?',
    content: 'Money is...',
    topic: 'basics',
    ageBracket: '8-12',
    sequenceOrder: 1,
    durationMinutes: 5,
    ...overrides,
  };
}

const SAMPLE_LESSONS: readonly EducationLesson[] = [
  makeLesson({ id: 'l1', topic: 'basics', sequenceOrder: 1, ageBracket: '8-12' }),
  makeLesson({ id: 'l2', topic: 'basics', sequenceOrder: 2, ageBracket: '8-12' }),
  makeLesson({ id: 'l3', topic: 'saving', sequenceOrder: 1, ageBracket: '8-12' }),
  makeLesson({ id: 'l4', topic: 'budgeting', sequenceOrder: 1, ageBracket: '13-17' }),
  makeLesson({ id: 'l5', topic: 'investing', sequenceOrder: 1, ageBracket: '13-17' }),
];

describe('education-feed', () => {
  describe('getAgeBracket', () => {
    it('returns under-8 for young children', () => {
      expect(getAgeBracket(5)).toBe('under-8');
    });

    it('returns 8-12 for school age', () => {
      expect(getAgeBracket(10)).toBe('8-12');
    });

    it('returns 13-17 for teens', () => {
      expect(getAgeBracket(15)).toBe('13-17');
    });

    it('returns 13-17 for boundary age 13', () => {
      expect(getAgeBracket(13)).toBe('13-17');
    });
  });

  describe('getLessonsForAge', () => {
    it('returns age-appropriate lessons', () => {
      const lessons = getLessonsForAge(SAMPLE_LESSONS, 10);
      expect(lessons).toHaveLength(3); // l1, l2, l3
    });

    it('returns teen lessons for age 15', () => {
      const lessons = getLessonsForAge(SAMPLE_LESSONS, 15);
      expect(lessons).toHaveLength(2); // l4, l5
    });
  });

  describe('getLessonsByTopic', () => {
    it('returns lessons sorted by sequence order', () => {
      const lessons = getLessonsByTopic(SAMPLE_LESSONS, 'basics');
      expect(lessons[0].id).toBe('l1');
      expect(lessons[1].id).toBe('l2');
    });

    it('returns empty for unknown topic', () => {
      expect(getLessonsByTopic(SAMPLE_LESSONS, 'unknown')).toHaveLength(0);
    });
  });

  describe('getTopics', () => {
    it('returns unique sorted topics', () => {
      const topics = getTopics(SAMPLE_LESSONS);
      expect(topics).toEqual(['basics', 'budgeting', 'investing', 'saving']);
    });
  });

  describe('getNextLesson', () => {
    it('returns the first lesson when none completed', () => {
      const next = getNextLesson(SAMPLE_LESSONS, [], 'basics', 'mem-1');
      expect(next?.id).toBe('l1');
    });

    it('returns the next incomplete lesson', () => {
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: 90, completedAt: NOW },
      ];
      const next = getNextLesson(SAMPLE_LESSONS, progress, 'basics', 'mem-1');
      expect(next?.id).toBe('l2');
    });

    it('returns null when all completed', () => {
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: 90, completedAt: NOW },
        { lessonId: 'l2', memberId: 'mem-1', completed: true, quizScore: 85, completedAt: NOW },
      ];
      const next = getNextLesson(SAMPLE_LESSONS, progress, 'basics', 'mem-1');
      expect(next).toBeNull();
    });
  });

  describe('completeLesson', () => {
    it('creates a completion record', () => {
      const progress = completeLesson('l1', 'mem-1', 95, NOW);
      expect(progress.completed).toBe(true);
      expect(progress.quizScore).toBe(95);
    });
  });

  describe('getTopicCompletionPercent', () => {
    const topicLessons = SAMPLE_LESSONS.filter((l) => l.topic === 'basics');

    it('returns 0 for no progress', () => {
      expect(getTopicCompletionPercent(topicLessons, [], 'mem-1')).toBe(0);
    });

    it('calculates partial completion', () => {
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: 90, completedAt: NOW },
      ];
      // 1 out of 2 basics lessons
      const percent = getTopicCompletionPercent(topicLessons, progress, 'mem-1');
      expect(percent).toBe(50);
    });

    it('handles empty lessons without divide-by-zero', () => {
      expect(getTopicCompletionPercent([], [], 'mem-1')).toBe(0);
    });
  });

  describe('getAverageQuizScore', () => {
    it('returns average of quiz scores', () => {
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: 80, completedAt: NOW },
        { lessonId: 'l2', memberId: 'mem-1', completed: true, quizScore: 100, completedAt: NOW },
      ];
      expect(getAverageQuizScore(progress, 'mem-1')).toBe(90);
    });

    it('returns -1 when no quizzes taken', () => {
      expect(getAverageQuizScore([], 'mem-1')).toBe(-1);
    });

    it('ignores quizzes with score -1', () => {
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: -1, completedAt: NOW },
        { lessonId: 'l2', memberId: 'mem-1', completed: true, quizScore: 80, completedAt: NOW },
      ];
      expect(getAverageQuizScore(progress, 'mem-1')).toBe(80);
    });
  });

  describe('getEarnedBadges', () => {
    const badges: ProgressBadge[] = [
      createBadge({
        id: 'b1',
        name: 'Basics Pro',
        description: 'Complete basics',
        topic: 'basics',
        requiredLessons: 2,
      }),
      createBadge({
        id: 'b2',
        name: 'Saving Star',
        description: 'Complete saving',
        topic: 'saving',
        requiredLessons: 1,
      }),
    ];

    it('returns earned badges', () => {
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: 90, completedAt: NOW },
        { lessonId: 'l2', memberId: 'mem-1', completed: true, quizScore: 85, completedAt: NOW },
      ];
      const earned = getEarnedBadges(badges, SAMPLE_LESSONS, progress, 'mem-1');
      expect(earned).toContain('b1');
      expect(earned).not.toContain('b2');
    });
  });

  describe('getEducationSummary', () => {
    it('computes overall summary', () => {
      const ageLessons = getLessonsForAge(SAMPLE_LESSONS, 10); // 3 lessons
      const progress: LessonProgress[] = [
        { lessonId: 'l1', memberId: 'mem-1', completed: true, quizScore: 90, completedAt: NOW },
        { lessonId: 'l3', memberId: 'mem-1', completed: true, quizScore: 80, completedAt: NOW },
      ];

      const summary = getEducationSummary(ageLessons, progress, 'mem-1');
      expect(summary.totalLessons).toBe(3);
      expect(summary.completedLessons).toBe(2);
      expect(summary.completionPercent).toBe(67);
      expect(summary.averageQuizScore).toBe(85);
      expect(summary.topicsStarted).toBe(2);
      expect(summary.topicsCompleted).toBe(1); // saving (1/1)
    });
  });
});
