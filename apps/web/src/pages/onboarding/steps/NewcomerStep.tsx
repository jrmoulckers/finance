// SPDX-License-Identifier: BUSL-1.1

/**
 * "Personalize your setup" newcomer step: life-stage tailoring, tax/income
 * profile, and financial-literacy lessons. Presentational subcomponent
 * extracted from `OnboardingPage.tsx` (#3712).
 */

import React from 'react';

import { Checkbox } from '../../../components/common/Checkbox';
import type { newcomerExplainers } from '../../../lib/education/newcomer-explainers';
import type { NewcomerExplainerKey } from '../../../lib/education/newcomer-explainers';
import type {
  getNewcomerGuidance,
  IncomeType,
  TaxIdStatus,
} from '../../../lib/onboarding/newcomer-tax-profile';

import {
  FINANCIAL_LESSONS,
  INCOME_TYPE_OPTIONS,
  LIFE_STAGE_OPTIONS,
  TAX_ID_STATUS_OPTIONS,
} from '../content';
import { TEMPLATE_GUIDANCE_ANCHOR, TEMPLATE_LESSONS_ANCHOR } from '../steps';
import type { GlossaryTermId, Lesson, LessonChoice, LifeStageId, LifeStageOption } from '../types';

export type NewcomerStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepProgressIndicator: React.ReactNode;
  isAuthenticated: boolean;
  handleNewcomerBack: () => void;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  selectedLifeStageOptions: LifeStageOption[];
  selectedStageLabels: string;
  selectedLifeStages: LifeStageId[];
  handleLifeStageToggle: (lifeStageId: LifeStageId) => void;
  handleOpenGlossary: (term: GlossaryTermId, event: React.MouseEvent<HTMLButtonElement>) => void;
  handleClearLifeStages: () => void;
  taxIdStatus: TaxIdStatus;
  handleTaxIdStatusChange: (value: TaxIdStatus) => void;
  incomeType: IncomeType;
  handleIncomeTypeChange: (value: IncomeType) => void;
  newcomerGuidance: ReturnType<typeof getNewcomerGuidance>;
  newcomerExplainerList: Array<(typeof newcomerExplainers)[NewcomerExplainerKey]>;
  handleOpenExplainer: (
    key: NewcomerExplainerKey,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  handleClearNewcomerProfile: () => void;
  completedLessonIds: string[];
  lessonsOptedIn: boolean;
  lessonSelections: Record<string, string>;
  lessonFeedback: Record<string, string>;
  handleLessonChoice: (lesson: Lesson, choice: LessonChoice) => void;
  setLessonsOptedIn: (value: boolean) => void;
  handleOptIntoLessons: () => void;
  handleNewcomerAdvance: () => void;
  glossaryModal: React.ReactNode;
  explainerModal: React.ReactNode;
};

export const NewcomerStep: React.FC<NewcomerStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepProgressIndicator,
  isAuthenticated,
  handleNewcomerBack,
  stepHeadingRef,
  selectedLifeStageOptions,
  selectedStageLabels,
  selectedLifeStages,
  handleLifeStageToggle,
  handleOpenGlossary,
  handleClearLifeStages,
  taxIdStatus,
  handleTaxIdStatusChange,
  incomeType,
  handleIncomeTypeChange,
  newcomerGuidance,
  newcomerExplainerList,
  handleOpenExplainer,
  handleClearNewcomerProfile,
  completedLessonIds,
  lessonsOptedIn,
  lessonSelections,
  lessonFeedback,
  handleLessonChoice,
  setLessonsOptedIn,
  handleOptIntoLessons,
  handleNewcomerAdvance,
  glossaryModal,
  explainerModal,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Personalize Your Setup">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        {stepProgressIndicator}
        {!isAuthenticated && (
          <div className="onboarding__wizard-back-row">
            <button type="button" className="onboarding__back-button" onClick={handleNewcomerBack}>
              <span aria-hidden="true">←</span> Back
            </button>
          </div>
        )}
        <header className="onboarding__header">
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            Personalize your setup
          </h1>
          <p className="onboarding__subtitle">
            {selectedLifeStageOptions.length > 0
              ? `Guidance is tailored for: ${selectedStageLabels}. You can change or skip this any time.`
              : 'Optional: tailor guidance to your life stage and learn the basics. You can change or skip any of this at any time.'}
          </p>
        </header>

        <section
          id={TEMPLATE_GUIDANCE_ANCHOR}
          tabIndex={-1}
          className="onboarding__template-card"
          aria-label="Life-stage tailored setup"
        >
          <div className="onboarding__template-header">
            <div>
              <h2 className="onboarding__path-title">Tailor setup to your life stage</h2>
              <p className="onboarding__path-description">
                Optional: this only changes guidance, examples, and next steps. It does not create
                budget templates, and local-only selections stay in this browser.
              </p>
            </div>
            <span className="onboarding__template-badge">Optional</span>
          </div>

          <div className="onboarding__choice-grid" role="group" aria-label="Life stages">
            {LIFE_STAGE_OPTIONS.map((option) => (
              <Checkbox
                key={option.id}
                className="onboarding__choice-card"
                checked={selectedLifeStages.includes(option.id)}
                onChange={() => handleLifeStageToggle(option.id)}
                label={
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.setupCopy}</small>
                  </span>
                }
              />
            ))}
          </div>

          <div className="onboarding__tailored-guidance" aria-live="polite">
            <h3 className="onboarding__section-title">Recommended next steps</h3>
            {selectedLifeStageOptions.length > 0 ? (
              <ul className="onboarding__template-list" role="list">
                {selectedLifeStageOptions.map((option) => (
                  <li key={option.id} className="onboarding__template-item" role="listitem">
                    <span>{option.nextStep}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="onboarding__path-description">
                Pick one or more stages for tailored setup copy, or skip and keep the default
                guidance.
              </p>
            )}
            {selectedLifeStageOptions.length > 0 && (
              <p className="onboarding__education-prompt">
                Education prompt: {selectedLifeStageOptions[0].educationPrompt}
              </p>
            )}
          </div>

          <div className="onboarding__inline-actions">
            <button
              type="button"
              className="onboarding__link-button"
              onClick={(event) => handleOpenGlossary('cashFlow', event)}
              aria-haspopup="dialog"
            >
              What is cash flow?
            </button>
            <button
              type="button"
              className="onboarding__link-button"
              onClick={(event) => handleOpenGlossary('recurringExpense', event)}
              aria-haspopup="dialog"
            >
              What is a recurring expense?
            </button>
            <button
              type="button"
              className="onboarding__link-button"
              onClick={handleClearLifeStages}
            >
              Clear selections
            </button>
          </div>
        </section>

        <section
          className="onboarding__template-card"
          aria-label="New to working or taxes in the US"
        >
          <div className="onboarding__template-header">
            <div>
              <h2 className="onboarding__path-title">New to working or taxes in the US?</h2>
              <p className="onboarding__path-description">
                Optional and private. We never ask for any real ID numbers, only the category you
                pick. These choices stay in this browser, are never shared, and simply tailor the
                budgeting tips and explainers below.
              </p>
            </div>
            <span className="onboarding__template-badge">Optional &amp; private</span>
          </div>

          <div className="onboarding__newcomer-groups">
            <fieldset className="onboarding__fieldset">
              <legend className="onboarding__legend">Tax ID status</legend>
              <p className="onboarding__path-description" id="onboarding-tax-id-help">
                An ITIN is the number some people use to file taxes when they do not have an SSN. We
                never collect the number itself.
              </p>
              <div
                className="onboarding__choice-grid"
                role="radiogroup"
                aria-label="Tax ID status"
                aria-describedby="onboarding-tax-id-help"
              >
                {TAX_ID_STATUS_OPTIONS.map((option) => (
                  <label key={option.value} className="onboarding__choice-card">
                    <input
                      type="radio"
                      name="onboarding-tax-id-status"
                      value={option.value}
                      checked={taxIdStatus === option.value}
                      onChange={() => handleTaxIdStatusChange(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="onboarding__fieldset">
              <legend className="onboarding__legend">How you earn money</legend>
              <p className="onboarding__path-description" id="onboarding-income-help">
                Pick the closest match. This helps tailor budgeting tips for steady, hourly,
                seasonal, or contract income.
              </p>
              <div
                className="onboarding__choice-grid"
                role="radiogroup"
                aria-label="Income type"
                aria-describedby="onboarding-income-help"
              >
                {INCOME_TYPE_OPTIONS.map((option) => (
                  <label key={option.value} className="onboarding__choice-card">
                    <input
                      type="radio"
                      name="onboarding-income-type"
                      value={option.value}
                      checked={incomeType === option.value}
                      onChange={() => handleIncomeTypeChange(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="onboarding__tailored-guidance" aria-live="polite">
            <h3 className="onboarding__section-title">Budgeting tips for you</h3>
            <p className="onboarding__path-description">{newcomerGuidance.summary}</p>
            <ul className="onboarding__template-list" role="list">
              {newcomerGuidance.tips.map((tip) => (
                <li key={tip} className="onboarding__template-item" role="listitem">
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="onboarding__newcomer-explainers">
            <h3 className="onboarding__section-title">Learn the basics</h3>
            <p className="onboarding__path-description">
              Open any topic for a short, plain-language explanation. These are educational and not
              tax advice.
            </p>
            <div className="onboarding__inline-actions">
              {newcomerExplainerList.map((explainer) => (
                <button
                  key={explainer.id}
                  type="button"
                  className="onboarding__link-button"
                  onClick={(event) => handleOpenExplainer(explainer.id, event)}
                  aria-haspopup="dialog"
                >
                  {explainer.linkLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="onboarding__inline-actions">
            <button
              type="button"
              className="onboarding__link-button"
              onClick={handleClearNewcomerProfile}
            >
              Clear these choices
            </button>
          </div>
        </section>

        <section
          id={TEMPLATE_LESSONS_ANCHOR}
          tabIndex={-1}
          className="onboarding__template-card onboarding__stacked-section"
          aria-label="Financial literacy lessons"
        >
          <div className="onboarding__template-header">
            <div>
              <h2 className="onboarding__path-title">Quick financial-literacy lessons</h2>
              <p className="onboarding__path-description">
                Optional two-minute checks with plain-language examples. These are educational and
                not financial advice.
              </p>
            </div>
            <span className="onboarding__template-badge">
              {completedLessonIds.length}/{FINANCIAL_LESSONS.length} done
            </span>
          </div>

          {lessonsOptedIn ? (
            <>
              <div className="onboarding__lesson-grid">
                {FINANCIAL_LESSONS.map((lesson) => {
                  const isComplete = completedLessonIds.includes(lesson.id);
                  const selectedLabel = lessonSelections[lesson.id];
                  return (
                    <article
                      key={lesson.id}
                      className={
                        isComplete
                          ? 'onboarding__lesson-card onboarding__lesson-card--complete'
                          : 'onboarding__lesson-card'
                      }
                    >
                      <div className="onboarding__lesson-card-head">
                        <h3 className="onboarding__section-title">{lesson.title}</h3>
                        {isComplete && (
                          <span className="onboarding__lesson-status" role="status">
                            Completed ✓
                          </span>
                        )}
                      </div>
                      <p className="onboarding__path-description">{lesson.scenario}</p>
                      <div
                        className="onboarding__lesson-choices"
                        role="group"
                        aria-label={`${lesson.title} answers`}
                      >
                        {lesson.choices.map((choice) => {
                          const isSelected = selectedLabel === choice.label;
                          const isCorrectAnswer = isComplete && choice.correct;
                          const choiceClassName = [
                            'onboarding__path-btn',
                            'onboarding__lesson-choice',
                            isSelected
                              ? 'onboarding__lesson-choice--selected'
                              : 'onboarding__path-btn--secondary',
                            isCorrectAnswer ? 'onboarding__lesson-choice--correct' : '',
                          ]
                            .filter(Boolean)
                            .join(' ');
                          return (
                            <button
                              key={choice.label}
                              type="button"
                              className={choiceClassName}
                              aria-pressed={isSelected}
                              disabled={isComplete}
                              onClick={() => handleLessonChoice(lesson, choice)}
                            >
                              <span>{choice.label}</span>
                              {isCorrectAnswer && (
                                <span
                                  aria-hidden="true"
                                  className="onboarding__lesson-choice-check"
                                >
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="onboarding__lesson-feedback" aria-live="polite">
                        {isComplete ? 'Completed. ' : ''}
                        {lessonFeedback[lesson.id] ??
                          'Choose an answer to check your understanding.'}
                      </p>
                    </article>
                  );
                })}
              </div>
              <div className="onboarding__inline-actions">
                <button
                  type="button"
                  className="onboarding__link-button"
                  onClick={() => setLessonsOptedIn(false)}
                >
                  Hide lessons
                </button>
              </div>
            </>
          ) : (
            <div className="onboarding__lesson-optin">
              <p className="onboarding__path-description">
                Lessons are optional. Opt in for three quick checks now, or take them anytime later
                from the Learn area in the app.
              </p>
              <div className="onboarding__inline-actions">
                <button
                  type="button"
                  className="onboarding__path-btn onboarding__path-btn--secondary"
                  onClick={handleOptIntoLessons}
                >
                  Yes, show me lessons
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="onboarding__wizard-nav">
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--secondary"
            onClick={handleNewcomerAdvance}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--primary"
            onClick={handleNewcomerAdvance}
          >
            Continue
          </button>
        </div>

        {glossaryModal}
        {explainerModal}
      </div>
    </main>
  );
};
