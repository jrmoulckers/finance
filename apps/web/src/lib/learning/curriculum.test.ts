// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { LEARNING_MODULES, LEARNING_LESSONS, getLearningLesson } from './curriculum';

describe('learning curriculum', () => {
  it('includes the five required modules', () => {
    expect(LEARNING_MODULES.map((module) => module.title)).toEqual([
      'Budgeting Basics',
      'Saving & Emergency Funds',
      'Debt Management',
      'Investing Fundamentals',
      'Tax Planning',
    ]);
  });

  it('keeps each module between three and five lessons', () => {
    for (const module of LEARNING_MODULES) {
      expect(module.lessons.length).toBeGreaterThanOrEqual(3);
      expect(module.lessons.length).toBeLessThanOrEqual(5);
    }
  });

  it('provides a quiz for every lesson', () => {
    for (const lesson of LEARNING_LESSONS) {
      expect(lesson.quiz.length).toBeGreaterThanOrEqual(1);
      expect(getLearningLesson(lesson.id)?.title).toBe(lesson.title);
    }
  });
});
