// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';

import { getContextualTip, getGlossaryEntry } from '../../lib/education';
import type { LearningLesson, QuizScore } from '../../lib/learning';
import { ExplainThis } from '../common/ExplainThis';
import { QuizQuestion } from './QuizQuestion';

export interface LessonCardProps {
  lesson: LearningLesson;
  isCompleted: boolean;
  quizScore?: QuizScore;
  onMarkComplete: (lessonId: string) => void;
  onQuizComplete: (lessonId: string, percent: number) => void;
}

export function LessonCard({
  lesson,
  isCompleted,
  quizScore,
  onMarkComplete,
  onQuizComplete,
}: LessonCardProps): React.ReactElement {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const allAnswered = lesson.quiz.every((question) => Boolean(answers[question.id]));

  useEffect(() => {
    setAnswers({});
    setSubmittedScore(null);
  }, [lesson.id]);

  const scoreSummary = useMemo(() => {
    if (submittedScore !== null) {
      return `${submittedScore}% on this attempt`;
    }

    if (quizScore) {
      return `Best quiz score: ${quizScore.bestPercent}%`;
    }

    return 'Complete the knowledge check to measure understanding.';
  }, [quizScore, submittedScore]);

  const handleSubmitQuiz = () => {
    const correctCount = lesson.quiz.filter(
      (question) => answers[question.id] === question.correctOptionId,
    ).length;
    const percent = Math.round((correctCount / lesson.quiz.length) * 100);
    setSubmittedScore(percent);
    onQuizComplete(lesson.id, percent);
  };

  return (
    <article className="lesson-card" aria-label={lesson.title}>
      <header className="lesson-card__header">
        <div>
          <p className="lesson-card__eyebrow">
            {lesson.difficulty} · {lesson.estimatedMinutes} min
          </p>
          <h2 className="lesson-card__title">{lesson.title}</h2>
          <p className="lesson-card__summary">{lesson.summary}</p>
        </div>
        <button
          type="button"
          className="lesson-card__complete-btn"
          onClick={() => onMarkComplete(lesson.id)}
          aria-pressed={isCompleted}
        >
          {isCompleted ? 'Completed' : 'Mark lesson complete'}
        </button>
      </header>

      <section className="lesson-card__section" aria-label="What you will learn">
        <h3>What you will learn</h3>
        <ul className="lesson-card__list">
          {lesson.learningObjectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>

      <section className="lesson-card__section" aria-label="Lesson content">
        <h3>Lesson walkthrough</h3>
        <div className="lesson-card__content">
          {lesson.content.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="lesson-card__section lesson-card__example" aria-label="Practical example">
        <h3>{lesson.example.title}</h3>
        <p>{lesson.example.scenario}</p>
        <p className="lesson-card__takeaway">{lesson.example.takeaway}</p>
      </section>

      {(lesson.glossaryKeys.length > 0 || lesson.contextualTipKeys.length > 0) && (
        <section className="lesson-card__section" aria-label="Explain this links">
          <h3>Need a refresher?</h3>
          <div className="lesson-card__helpers">
            {lesson.glossaryKeys.map((key) => {
              const entry = getGlossaryEntry(key);
              return (
                <div key={key} className="lesson-card__helper-chip">
                  <span>{entry.term}</span>
                  <ExplainThis glossaryKey={key} buttonLabel={`Explain ${entry.term}`} />
                </div>
              );
            })}
            {lesson.contextualTipKeys.map((key) => {
              const entry = getContextualTip(key);
              return (
                <div key={key} className="lesson-card__helper-chip">
                  <span>{entry.term}</span>
                  <ExplainThis tipKey={key} buttonLabel={`Explain ${entry.term}`} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="lesson-card__section" aria-label="Knowledge check">
        <div className="lesson-card__quiz-header">
          <div>
            <h3>Knowledge check</h3>
            <p className="lesson-card__quiz-score">{scoreSummary}</p>
          </div>
          <button
            type="button"
            className="lesson-card__quiz-submit"
            onClick={handleSubmitQuiz}
            disabled={!allAnswered}
          >
            Submit answers
          </button>
        </div>
        <div className="lesson-card__quiz-list">
          {lesson.quiz.map((question) => (
            <QuizQuestion
              key={question.id}
              question={question}
              selectedOptionId={answers[question.id] ?? null}
              onSelect={(optionId) =>
                setAnswers((current) => ({
                  ...current,
                  [question.id]: optionId,
                }))
              }
              showExplanation={submittedScore !== null}
            />
          ))}
        </div>
      </section>
    </article>
  );
}

export default LessonCard;
