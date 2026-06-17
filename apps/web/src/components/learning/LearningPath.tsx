// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { getModuleProgress } from '../../lib/learning';
import type { LearningModule, LearningProgressState } from '../../lib/learning';

export interface LearningPathProps {
  modules: readonly LearningModule[];
  progress: LearningProgressState;
  selectedLessonId: string;
  recommendedLessonIds: readonly string[];
  onSelectLesson: (lessonId: string) => void;
}

export function LearningPath({
  modules,
  progress,
  selectedLessonId,
  recommendedLessonIds,
  onSelectLesson,
}: LearningPathProps): React.ReactElement {
  const recommended = new Set(recommendedLessonIds);

  return (
    <section className="learning-path" aria-label="Learning path modules">
      <div className="learning-path__header">
        <h2>Structured path</h2>
        <p>
          Move module by module or jump to the recommendation that fits your current money picture.
        </p>
      </div>
      <div className="learning-path__modules">
        {modules.map((module) => {
          const summary = getModuleProgress(module, progress);
          return (
            <article key={module.id} className="learning-path__module" aria-label={module.title}>
              <div className="learning-path__module-header">
                <div>
                  <p className="learning-path__module-topic">{module.topic}</p>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                </div>
                <span className="learning-path__module-difficulty">{module.difficulty}</span>
              </div>

              <div
                className="learning-path__progress"
                role="progressbar"
                aria-valuenow={summary.completionPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${module.title} progress ${summary.completionPercent}%`}
              >
                <div
                  className="learning-path__progress-fill"
                  style={{ width: `${summary.completionPercent}%` }}
                />
              </div>
              <p className="learning-path__progress-label">
                {summary.completedLessons} of {summary.totalLessons} lessons complete
              </p>

              <ul className="learning-path__lessons">
                {module.lessons.map((lesson) => {
                  const isSelected = selectedLessonId === lesson.id;
                  const isCompleted = progress.completedLessonIds.includes(lesson.id);
                  const isRecommended = recommended.has(lesson.id);

                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        className={[
                          'learning-path__lesson',
                          isSelected ? 'learning-path__lesson--selected' : '',
                          isCompleted ? 'learning-path__lesson--completed' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onSelectLesson(lesson.id)}
                      >
                        <span className="learning-path__lesson-title">{lesson.title}</span>
                        <span className="learning-path__lesson-meta">
                          {lesson.estimatedMinutes} min
                          {isRecommended ? (
                            <span className="learning-path__recommendation">Recommended</span>
                          ) : null}
                          {isCompleted ? (
                            <span className="learning-path__completed-tag">Done</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default LearningPath;
