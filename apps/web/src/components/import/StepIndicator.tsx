// SPDX-License-Identifier: BUSL-1.1

/**
 * Step indicator for the CSV import wizard.
 *
 * Accessibility:
 *   - nav landmark with aria-label
 *   - aria-current="step" on active step
 *   - Screen-reader live region announces current step
 */

import React from 'react';

import type { ImportStep } from '../../hooks/useImport';

export const STEP_LABELS: Record<ImportStep, string> = {
  upload: 'Upload File',
  mapping: 'Map Columns',
  preview: 'Preview',
  importing: 'Importing',
  complete: 'Complete',
};

export const STEP_ORDER: ImportStep[] = ['upload', 'mapping', 'preview', 'importing', 'complete'];

export interface StepIndicatorProps {
  currentStep: ImportStep;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <nav aria-label="Import progress">
      <ol className="import-step-indicator">
        {STEP_ORDER.map((step, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;
          let className = 'import-step-indicator__step';
          if (isActive) className += ' import-step-indicator__step--active';
          if (isCompleted) className += ' import-step-indicator__step--completed';

          return (
            <React.Fragment key={step}>
              {index > 0 && (
                <li
                  className="import-step-indicator__connector"
                  aria-hidden="true"
                  role="presentation"
                />
              )}
              <li className={className} aria-current={isActive ? 'step' : undefined}>
                <span className="import-step-indicator__number" aria-hidden="true">
                  {isCompleted ? '\u2713' : index + 1}
                </span>
                <span className="import-step-indicator__label">{STEP_LABELS[step]}</span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {currentIndex + 1} of {STEP_ORDER.length}: {STEP_LABELS[currentStep]}
      </p>
    </nav>
  );
};
