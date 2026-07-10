// SPDX-License-Identifier: BUSL-1.1

/**
 * "Choose setup path" step (Local Only vs Create Account) with the feature
 * comparison table. Presentational subcomponent extracted from
 * `OnboardingPage.tsx` (#3712).
 */

import React from 'react';

import { AppIcon } from '../../../components/icons';
import type { FeatureAvailability } from '../../../lib/local-only-mode';

import { FeatureRow } from '../FeatureRow';

export type ChooseStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepProgressIndicator: React.ReactNode;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  features: FeatureAvailability[];
  handleLocalOnly: () => void;
  handleCreateAccount: () => void;
};

export const ChooseStep: React.FC<ChooseStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepProgressIndicator,
  stepHeadingRef,
  features,
  handleLocalOnly,
  handleCreateAccount,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Get Started">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container">
        {stepProgressIndicator}
        <header className="onboarding__header">
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            Welcome to Finance
          </h1>
          <p className="onboarding__subtitle">
            Your personal finance tracker. Choose how you want to get started.
          </p>
        </header>

        <div className="onboarding__paths">
          <article className="onboarding__path-card onboarding__path-card--local">
            <div className="onboarding__path-icon" aria-hidden="true">
              <AppIcon name="lock" />
            </div>
            <h2 className="onboarding__path-title">Local Only</h2>
            <p className="onboarding__path-description">
              Keep everything on this device. No account needed. No data ever leaves your browser.
            </p>
            <ul className="onboarding__path-features" role="list">
              <li role="listitem">
                <AppIcon name="check" /> Full budgeting & tracking
              </li>
              <li role="listitem">
                <AppIcon name="check" /> All data stays on device
              </li>
              <li role="listitem">
                <AppIcon name="check" /> No email required
              </li>
              <li role="listitem">
                <AppIcon name="check" /> Works completely offline
              </li>
            </ul>
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handleLocalOnly}
            >
              Start Local Only
            </button>
            <p className="onboarding__path-note">
              You can create an account later without losing any data.
            </p>
          </article>

          <article className="onboarding__path-card onboarding__path-card--account">
            <div className="onboarding__path-icon" aria-hidden="true">
              <AppIcon name="cloud" />
            </div>
            <h2 className="onboarding__path-title">Create Account</h2>
            <p className="onboarding__path-description">
              Sign up to sync across devices and share with household members.
            </p>
            <ul className="onboarding__path-features" role="list">
              <li role="listitem">
                <AppIcon name="check" /> Everything in Local Only
              </li>
              <li role="listitem">
                <AppIcon name="check" /> Sync across devices
              </li>
              <li role="listitem">
                <AppIcon name="check" /> Household sharing
              </li>
              <li role="listitem">
                <AppIcon name="check" /> Automatic cloud backups
              </li>
            </ul>
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--secondary"
              onClick={handleCreateAccount}
            >
              Create Account
            </button>
          </article>
        </div>

        <section className="onboarding__comparison" aria-label="Feature comparison">
          <h2 className="onboarding__comparison-title">Feature Comparison</h2>
          <table className="onboarding__comparison-table">
            <thead>
              <tr>
                <th scope="col" className="onboarding__table-header">
                  Feature
                </th>
                <th scope="col" className="onboarding__table-header">
                  Local Only
                </th>
                <th scope="col" className="onboarding__table-header">
                  With Account
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <FeatureRow key={feature.id} feature={feature} />
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
};
