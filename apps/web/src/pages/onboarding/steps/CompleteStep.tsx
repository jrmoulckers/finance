// SPDX-License-Identifier: BUSL-1.1

/**
 * "You're all set" completion step: summary, setup checklist, and coach marks.
 * Presentational subcomponent extracted from `OnboardingPage.tsx` (#3712).
 */

import React from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { AppIcon } from '../../../components/icons';

import { FINANCIAL_LESSONS } from '../content';
import { TEMPLATE_GUIDANCE_ANCHOR, TEMPLATE_LESSONS_ANCHOR } from '../steps';
import type { GlossaryTermId, LifeStageId, StoredGoal } from '../types';

export type CompleteStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  starterBudgetCreated: boolean;
  isAuthenticated: boolean;
  setupChecklistHidden: boolean;
  handleChecklistHiddenChange: (hidden: boolean) => void;
  fullySetUp: boolean;
  navigate: NavigateFunction;
  selectedLifeStages: LifeStageId[];
  selectedStageLabels: string;
  openNewcomerSection: (anchor: string) => void;
  completedLessonIds: string[];
  savedGoals: StoredGoal[];
  coachMarksDismissed: boolean;
  handleCoachMarksRestore: () => void;
  handleCoachMarksDismiss: () => void;
  handleOpenGlossary: (term: GlossaryTermId, event: React.MouseEvent<HTMLButtonElement>) => void;
  glossaryModal: React.ReactNode;
  handleGoToDashboard: () => void;
};

export const CompleteStep: React.FC<CompleteStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepHeadingRef,
  starterBudgetCreated,
  isAuthenticated,
  setupChecklistHidden,
  handleChecklistHiddenChange,
  fullySetUp,
  navigate,
  selectedLifeStages,
  selectedStageLabels,
  openNewcomerSection,
  completedLessonIds,
  savedGoals,
  coachMarksDismissed,
  handleCoachMarksRestore,
  handleCoachMarksDismiss,
  handleOpenGlossary,
  glossaryModal,
  handleGoToDashboard,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Setup Complete">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        <div className="onboarding__complete">
          <div className="onboarding__complete-icon" aria-hidden="true">
            <AppIcon name="sparkles" />
          </div>
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            You&apos;re All Set!
          </h1>
          <p className="onboarding__subtitle">
            {starterBudgetCreated
              ? 'Your finance tracker is ready, and your student starter budget is already in place.'
              : isAuthenticated
                ? 'Your finance tracker is ready and synced to your account.'
                : 'Your finance tracker is ready. All data is stored locally on this device.'}
          </p>
          <div className="onboarding__complete-details">
            {isAuthenticated ? (
              <p className="onboarding__complete-item">
                <AppIcon name="cloud" /> <strong>Synced to your account</strong>: your data is
                backed up and available on every device
              </p>
            ) : (
              <p className="onboarding__complete-item">
                <AppIcon name="lock" /> <strong>Local-only mode</strong>: no data leaves your
                browser
              </p>
            )}
            {starterBudgetCreated && (
              <p className="onboarding__complete-item">
                <AppIcon name="wallet" /> <strong>Starter budget added</strong>: realistic student
                categories are ready to edit
              </p>
            )}
            <p className="onboarding__complete-item">
              <AppIcon name="database" /> <strong>SQLite storage</strong>: fast, reliable,
              offline-first
            </p>
            {isAuthenticated ? (
              <p className="onboarding__complete-item">
                <AppIcon name="check" /> <strong>Account active</strong>: sign in anywhere to pick
                up where you left off
              </p>
            ) : (
              <p className="onboarding__complete-item">
                <AppIcon name="refresh" /> <strong>Upgrade anytime</strong>: create an account later
                to enable sync
              </p>
            )}
          </div>

          {setupChecklistHidden ? (
            <section className="onboarding__checklist" aria-label="Setup checklist hidden">
              <p className="onboarding__path-description">Checklist hidden.</p>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={() => handleChecklistHiddenChange(false)}
              >
                Show checklist
              </button>
            </section>
          ) : (
            <section className="onboarding__checklist" aria-label="Setup progress">
              <div className="onboarding__template-header">
                <div>
                  <h2 className="onboarding__path-title">Setup progress</h2>
                  <p className="onboarding__path-description">
                    Beta activation is complete when privacy is reviewed, setup has a first budget
                    or goal, and at least one confidence task is done.
                  </p>
                </div>
                <span className="onboarding__template-badge">
                  {fullySetUp ? 'Fully set up' : 'In progress'}
                </span>
              </div>
              <ul className="onboarding__checklist-list" role="list">
                <li className="onboarding__checklist-item" role="listitem">
                  <span>Privacy reviewed</span>
                  <strong>Done</strong>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    {starterBudgetCreated ? 'Starter budget created' : 'Starter budget skipped'}
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => navigate('/budgets')}
                  >
                    Open budgets
                  </button>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    Life-stage guidance{' '}
                    {selectedLifeStages.length > 0
                      ? `saved for ${selectedStageLabels}`
                      : 'not selected'}
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => openNewcomerSection(TEMPLATE_GUIDANCE_ANCHOR)}
                  >
                    Edit guidance
                  </button>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    Education lessons {completedLessonIds.length}/{FINANCIAL_LESSONS.length}{' '}
                    complete
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => openNewcomerSection(TEMPLATE_LESSONS_ANCHOR)}
                  >
                    Review lessons
                  </button>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    {savedGoals.length > 0
                      ? `${savedGoals.length} goal saved`
                      : 'No goal saved yet'}
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => navigate('/goals')}
                  >
                    Open goals
                  </button>
                </li>
              </ul>
              <button
                type="button"
                className="onboarding__link-button"
                onClick={() => handleChecklistHiddenChange(true)}
              >
                Hide checklist
              </button>
            </section>
          )}

          <section className="onboarding__coachmarks" aria-label="Quick tips">
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">Quick tips</h2>
                <p className="onboarding__path-description">
                  Plain-language tips for dashboard, budget, transactions, and goals. Dismiss once
                  or reopen later from help.
                </p>
              </div>
            </div>
            {coachMarksDismissed ? (
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={handleCoachMarksRestore}
              >
                Show tips
              </button>
            ) : (
              <>
                <div className="onboarding__coachmark-grid">
                  <article className="onboarding__coachmark-card">
                    <strong>Dashboard</strong>
                    <p>Your daily snapshot shows balances, upcoming bills, and setup nudges.</p>
                  </article>
                  <article className="onboarding__coachmark-card">
                    <strong>Budget</strong>
                    <p>Budget categories are planning buckets, not judgments.</p>
                  </article>
                  <article className="onboarding__coachmark-card">
                    <strong>Transactions</strong>
                    <p>
                      Transactions explain what actually happened so you can compare to the plan.
                    </p>
                  </article>
                  <article className="onboarding__coachmark-card">
                    <strong>Goals</strong>
                    <p>Goals connect saving or payoff progress to outcomes you choose.</p>
                  </article>
                </div>
                <div className="onboarding__inline-actions">
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={(event) => handleOpenGlossary('budgetVariance', event)}
                    aria-haspopup="dialog"
                  >
                    Explain budget variance
                  </button>
                  <button
                    type="button"
                    className="onboarding__path-btn onboarding__path-btn--secondary"
                    onClick={handleCoachMarksDismiss}
                  >
                    Hide tips
                  </button>
                </div>
              </>
            )}
          </section>

          {glossaryModal}

          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--primary"
            onClick={handleGoToDashboard}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
};
