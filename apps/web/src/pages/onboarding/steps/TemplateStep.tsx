// SPDX-License-Identifier: BUSL-1.1

/**
 * "Starter budget template" step: student starter budget preview plus
 * apply/skip actions. Presentational subcomponent extracted from
 * `OnboardingPage.tsx` (#3712).
 */

import React from 'react';

import type { BudgetStarterTemplate } from '../../../lib/budgeting/starter-budget-templates';
import { formatCurrencyValue } from '../../../lib/currency';

export type TemplateStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepProgressIndicator: React.ReactNode;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  handleTemplateBack: () => void;
  templateError: string | null;
  studentTemplate: BudgetStarterTemplate;
  futureTemplates: BudgetStarterTemplate[];
  handleApplyStudentTemplate: () => void;
  isApplyingTemplate: boolean;
  handleSkipStarterBudget: () => void;
};

export const TemplateStep: React.FC<TemplateStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepProgressIndicator,
  stepHeadingRef,
  handleTemplateBack,
  templateError,
  studentTemplate,
  futureTemplates,
  handleApplyStudentTemplate,
  isApplyingTemplate,
  handleSkipStarterBudget,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Starter Budget Template">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        {stepProgressIndicator}
        <div className="onboarding__wizard-back-row">
          <button type="button" className="onboarding__back-button" onClick={handleTemplateBack}>
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
        <header className="onboarding__header">
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            Want a starter budget? Choose a template:
          </h1>
          <p className="onboarding__subtitle">
            Start with a student-friendly budget you can rename or adjust any time, or skip and
            build your own later.
          </p>
        </header>

        {templateError && (
          <div className="onboarding__template-error" role="alert">
            {templateError}
          </div>
        )}

        <section className="onboarding__template-card" aria-label="Student starter budget">
          <div className="onboarding__template-header">
            <div>
              <h2 className="onboarding__path-title">{studentTemplate.name}</h2>
              <p className="onboarding__path-description">{studentTemplate.description}</p>
            </div>
            <span className="onboarding__template-badge">Available now</span>
          </div>

          <p className="onboarding__template-guidance">{studentTemplate.guidance}</p>

          <ul className="onboarding__template-list" role="list">
            {studentTemplate.categories.map((category) => (
              <li key={category.name} className="onboarding__template-item" role="listitem">
                <span>
                  {category.emoji} {category.name}
                </span>
                <strong>
                  {formatCurrencyValue(category.amountCents / 100, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="onboarding__coming-soon" aria-label="More templates coming soon">
          <h2 className="onboarding__comparison-title">More templates coming soon</h2>
          <div className="onboarding__coming-soon-list">
            {futureTemplates.map((template) => (
              <span key={template.id} className="onboarding__coming-soon-chip">
                {template.name}
              </span>
            ))}
          </div>
        </section>

        <div className="onboarding__template-actions">
          <p className="onboarding__template-summary">
            We will set up the {studentTemplate.name} starter budget shown above — more templates
            are coming soon, and you can rename categories or change amounts any time.
          </p>
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--primary"
            onClick={handleApplyStudentTemplate}
            disabled={isApplyingTemplate}
            aria-busy={isApplyingTemplate}
          >
            {isApplyingTemplate ? 'Creating your budget…' : 'Create my budget'}
          </button>
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--secondary"
            onClick={handleSkipStarterBudget}
            disabled={isApplyingTemplate}
          >
            Skip for now
          </button>
        </div>
      </div>
    </main>
  );
};
