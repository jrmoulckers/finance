// SPDX-License-Identifier: BUSL-1.1

export type {
  AdaptiveLessonRecommendation,
  LearningActivityProfile,
  LearningBadge,
  LearningDifficulty,
  LearningKnowledgeGap,
  LearningLesson,
  LearningModule,
  LearningOverview,
  LearningProgressState,
  LearningQuizOption,
  LearningQuizQuestion,
  LearningStreak,
  LearningTopic,
  ModuleProgressSummary,
  QuizScore,
} from './types';

export {
  LEARNING_MODULES,
  LEARNING_LESSONS,
  getLearningLesson,
  getLearningModule,
  getModulesByDifficulty,
} from './curriculum';

export {
  createEmptyLearningProgress,
  findKnowledgeGaps,
  getLearningBadges,
  getLearningOverview,
  getModuleProgress,
  isLessonCompleted,
  loadLearningProgress,
  markLessonCompleted,
  recordQuizScore,
  saveLearningProgress,
} from './progress';

export { buildLearningActivityProfile, suggestNextLessons } from './adaptive';
