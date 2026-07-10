// SPDX-License-Identifier: BUSL-1.1

/**
 * "Set a savings goal" step: goal-setting wizard with preview/save and a saved
 * goals list. Presentational subcomponent extracted from `OnboardingPage.tsx`
 * (#3712).
 */

import React from 'react';

import { formatCurrencyValue } from '../../../lib/currency';

import { todayISO } from '../goal-math';
import type { GlossaryTermId, GoalDraft, StoredGoal } from '../types';

export type GoalsStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepProgressIndicator: React.ReactNode;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  handleGoalsBack: () => void;
  savedGoals: StoredGoal[];
  goalDraft: GoalDraft;
  handleGoalDraftChange: (field: keyof GoalDraft, value: string) => void;
  handleAmountDraftChange: (field: 'targetAmount' | 'startingBalance', value: string) => void;
  isGoalDraftValid: boolean;
  handlePreviewGoal: () => void;
  handleOpenGlossary: (term: GlossaryTermId, event: React.MouseEvent<HTMLButtonElement>) => void;
  goalReviewVisible: boolean;
  monthlyContribution: number;
  handleSaveGoal: () => void;
  goalSavedName: string | null;
  handleGoalsAdvance: () => void;
  glossaryModal: React.ReactNode;
};

export const GoalsStep: React.FC<GoalsStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepProgressIndicator,
  stepHeadingRef,
  handleGoalsBack,
  savedGoals,
  goalDraft,
  handleGoalDraftChange,
  handleAmountDraftChange,
  isGoalDraftValid,
  handlePreviewGoal,
  handleOpenGlossary,
  goalReviewVisible,
  monthlyContribution,
  handleSaveGoal,
  goalSavedName,
  handleGoalsAdvance,
  glossaryModal,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Set a Savings Goal">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        {stepProgressIndicator}
        <div className="onboarding__wizard-back-row">
          <button type="button" className="onboarding__back-button" onClick={handleGoalsBack}>
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
        <header className="onboarding__header">
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            Set a savings goal
          </h1>
          <p className="onboarding__subtitle">
            Optional: add a goal and preview the monthly estimate, or skip and set goals later.
          </p>
        </header>

        <section className="onboarding__template-card" aria-label="Goal-setting wizard">
          <div className="onboarding__template-header">
            <div>
              <h2 className="onboarding__path-title">Goal-setting wizard</h2>
              <p className="onboarding__path-description">
                Add an optional goal, preview the monthly estimate, then explicitly save it.
              </p>
            </div>
            <span className="onboarding__template-badge">{savedGoals.length} saved</span>
          </div>

          <div className="onboarding__form-grid">
            <label className="onboarding__field">
              <span>Goal name</span>
              <input
                type="text"
                value={goalDraft.name}
                onChange={(event) => handleGoalDraftChange('name', event.target.value)}
              />
            </label>
            <label className="onboarding__field">
              <span>Goal type</span>
              <select
                value={goalDraft.goalType}
                onChange={(event) => handleGoalDraftChange('goalType', event.target.value)}
              >
                <option>Emergency savings</option>
                <option>Debt payoff</option>
                <option>Vacation</option>
                <option>Rent deposit</option>
                <option>Buffer building</option>
              </select>
            </label>
            <label className="onboarding__field">
              <span>Target amount</span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={goalDraft.targetAmount}
                onChange={(event) => handleAmountDraftChange('targetAmount', event.target.value)}
                aria-describedby={isGoalDraftValid ? undefined : 'onboarding-goal-amount-hint'}
              />
            </label>
            <label className="onboarding__field">
              <span>Starting balance</span>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={goalDraft.startingBalance}
                onChange={(event) =>
                  handleAmountDraftChange('startingBalance', event.target.value)
                }
              />
            </label>
            <label className="onboarding__field">
              <span>Target date</span>
              <input
                type="date"
                min={todayISO()}
                value={goalDraft.targetDate}
                onChange={(event) => handleGoalDraftChange('targetDate', event.target.value)}
              />
            </label>
          </div>

          <div className="onboarding__inline-actions">
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--secondary"
              onClick={handlePreviewGoal}
              disabled={!isGoalDraftValid}
              aria-describedby={isGoalDraftValid ? undefined : 'onboarding-goal-amount-hint'}
            >
              Preview goal
            </button>
            <button
              type="button"
              className="onboarding__link-button"
              onClick={(event) => handleOpenGlossary('savingsGoal', event)}
              aria-haspopup="dialog"
            >
              What is a savings goal?
            </button>
          </div>

          {!isGoalDraftValid && (
            <p
              id="onboarding-goal-amount-hint"
              className="onboarding__path-description"
              role="note"
            >
              Enter a target amount greater than $0 to preview and save your goal.
            </p>
          )}

          {goalReviewVisible && (
            <div className="onboarding__goal-review" role="status">
              <h3 className="onboarding__section-title">Confirm goal before saving</h3>
              <p>
                {goalDraft.name || 'My goal'}: save{' '}
                {formatCurrencyValue(Number(goalDraft.targetAmount) || 0, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
                {goalDraft.targetDate ? ` by ${goalDraft.targetDate}` : ''}. Estimated monthly
                contribution:{' '}
                {formatCurrencyValue(monthlyContribution, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
                .
              </p>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--primary"
                onClick={handleSaveGoal}
              >
                Save goal
              </button>
            </div>
          )}

          {goalSavedName && (
            <div className="onboarding__goal-saved" role="status" aria-live="polite">
              <strong>Goal saved ✓</strong> — {goalSavedName} is in your plan. Add another, or
              continue when you are ready.
            </div>
          )}

          {savedGoals.length > 0 && (
            <div className="onboarding__saved-goals">
              <h3 className="onboarding__section-title">Saved goals</h3>
              <ul className="onboarding__saved-goals-list" role="list">
                {savedGoals.map((goal) => (
                  <li key={goal.id} className="onboarding__saved-goals-item" role="listitem">
                    <span>{goal.name}</span>
                    <strong>
                      {formatCurrencyValue(goal.monthlyContribution, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                      /mo
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="onboarding__wizard-nav">
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--secondary"
            onClick={handleGoalsAdvance}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--primary"
            onClick={handleGoalsAdvance}
          >
            Continue
          </button>
        </div>

        {glossaryModal}
      </div>
    </main>
  );
};
