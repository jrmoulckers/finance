// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { deserializeLearningProgress, generateLearningRewardEvents, serializeLearningProgress } from './learning-progress-rewards';

describe('learning progress reward rules', () => {
  it('serializes progress and emits completion, mastery, and streak rewards', () => {
    const state = {
      pathId: 'first-job',
      currentModuleId: 'budgeting',
      completedModuleIds: ['income-basics'],
      quizScores: { budgeting: 0.95, taxes: 0.7 },
      sessionDates: ['2026-04-10', '2026-04-09', '2026-04-08'],
    };
    expect(deserializeLearningProgress(serializeLearningProgress(state))).toEqual(state);
    expect(generateLearningRewardEvents(state)).toEqual([
      { type: 'module-complete', refId: 'income-basics', points: 50 },
      { type: 'quiz-mastery', refId: 'budgeting', points: 100 },
      { type: 'return-streak', refId: '3-day', points: 30 },
    ]);
  });
});
