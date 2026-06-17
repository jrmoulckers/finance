// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import type { LearningQuizQuestion } from '../../lib/learning';

export interface QuizQuestionProps {
  question: LearningQuizQuestion;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  showExplanation: boolean;
}

export function QuizQuestion({
  question,
  selectedOptionId,
  onSelect,
  showExplanation,
}: QuizQuestionProps): React.ReactElement {
  return (
    <fieldset className="quiz-question">
      <legend className="quiz-question__prompt">{question.prompt}</legend>
      <div className="quiz-question__options">
        {question.options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          const isCorrect = question.correctOptionId === option.id;

          return (
            <label
              key={option.id}
              className={[
                'quiz-question__option',
                isSelected ? 'quiz-question__option--selected' : '',
                showExplanation && isCorrect ? 'quiz-question__option--correct' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
      {showExplanation && (
        <p className="quiz-question__explanation" role="status">
          {question.explanation}
        </p>
      )}
    </fieldset>
  );
}

export default QuizQuestion;
