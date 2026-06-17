// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';

import {
  getLearningBadges,
  getLearningOverview,
  getModuleProgress,
  type AdaptiveLessonRecommendation,
  type LearningLesson,
  type LearningModule,
  type LearningProgressState,
} from '../../lib/learning';
import { LessonCard } from './LessonCard';
import { LearningPath } from './LearningPath';
import { ProgressBadge } from './ProgressBadge';
import './learning.css';

export interface LearningDashboardProps {
  modules: readonly LearningModule[];
  progress: LearningProgressState;
  recommendations: readonly AdaptiveLessonRecommendation[];
  selectedLesson: LearningLesson;
  onSelectLesson: (lessonId: string) => void;
  onMarkLessonComplete: (lessonId: string) => void;
  onRecordQuizScore: (lessonId: string, percent: number) => void;
}

export function LearningDashboard({
  modules,
  progress,
  recommendations,
  selectedLesson,
  onSelectLesson,
  onMarkLessonComplete,
  onRecordQuizScore,
}: LearningDashboardProps): React.ReactElement {
  const overview = useMemo(() => getLearningOverview(modules, progress), [modules, progress]);
  const badges = useMemo(() => getLearningBadges(modules, progress), [modules, progress]);
  const completedModules = useMemo(
    () =>
      modules.filter((module) => getModuleProgress(module, progress).completionPercent === 100)
        .length,
    [modules, progress],
  );

  return (
    <div className="learning-dashboard">
      <section className="learning-dashboard__hero" aria-label="Learning overview">
        <div>
          <p className="learning-dashboard__eyebrow">Local-first financial education</p>
          <h2 className="learning-dashboard__title">
            A learning path that adapts to your finances
          </h2>
          <p className="learning-dashboard__subtitle">
            Follow a structured curriculum, track streaks and quiz scores, and let the app surface
            the next lesson worth your attention.
          </p>
        </div>
        <div className="learning-dashboard__metrics">
          <article className="learning-dashboard__metric" aria-label="Lessons completed">
            <span className="learning-dashboard__metric-value">
              {overview.completedLessons}/{overview.totalLessons}
            </span>
            <span className="learning-dashboard__metric-label">Lessons complete</span>
          </article>
          <article className="learning-dashboard__metric" aria-label="Modules finished">
            <span className="learning-dashboard__metric-value">{completedModules}</span>
            <span className="learning-dashboard__metric-label">Modules finished</span>
          </article>
          <article className="learning-dashboard__metric" aria-label="Average best quiz score">
            <span className="learning-dashboard__metric-value">
              {overview.bestQuizPercent ?? 0}%
            </span>
            <span className="learning-dashboard__metric-label">Best quiz average</span>
          </article>
        </div>
      </section>

      <section
        className="learning-dashboard__recommendations"
        aria-label="Recommended next lessons"
      >
        <div className="learning-dashboard__section-heading">
          <h3>Recommended next up</h3>
          <p>
            These recommendations react to your activity, savings cushion, debt, and any quiz
            knowledge gaps.
          </p>
        </div>
        <div className="learning-dashboard__recommendation-list">
          {recommendations.map((recommendation) => (
            <button
              key={recommendation.lessonId}
              type="button"
              className="learning-dashboard__recommendation"
              onClick={() => onSelectLesson(recommendation.lessonId)}
            >
              <span className="learning-dashboard__recommendation-topic">
                {recommendation.topic}
              </span>
              <span className="learning-dashboard__recommendation-title">
                {recommendation.title}
              </span>
              <span className="learning-dashboard__recommendation-reason">
                {recommendation.reason}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="learning-dashboard__badges" aria-label="Progress badges">
        <ProgressBadge
          variant="streak"
          currentStreakDays={overview.currentStreak}
          longestStreakDays={overview.longestStreak}
        />
        {badges.map((badge) => (
          <ProgressBadge key={badge.id} variant="badge" badge={badge} />
        ))}
      </section>

      <div className="learning-dashboard__body">
        <div className="learning-dashboard__sidebar">
          <LearningPath
            modules={modules}
            progress={progress}
            selectedLessonId={selectedLesson.id}
            recommendedLessonIds={recommendations.map((recommendation) => recommendation.lessonId)}
            onSelectLesson={onSelectLesson}
          />
        </div>
        <div className="learning-dashboard__content">
          <LessonCard
            lesson={selectedLesson}
            isCompleted={progress.completedLessonIds.includes(selectedLesson.id)}
            quizScore={progress.quizScores[selectedLesson.id]}
            onMarkComplete={onMarkLessonComplete}
            onQuizComplete={onRecordQuizScore}
          />
        </div>
      </div>
    </div>
  );
}

export default LearningDashboard;
