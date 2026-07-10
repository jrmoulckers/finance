// SPDX-License-Identifier: BUSL-1.1

/**
 * Privacy preferences step (essential-only vs help-improve consent).
 * Presentational subcomponent extracted from `OnboardingPage.tsx` (#3712).
 */

import React from 'react';

export type PrivacyStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepProgressIndicator: React.ReactNode;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  handlePrivacyAcceptEssential: () => void;
  handlePrivacyAcceptAll: () => void;
};

export const PrivacyStep: React.FC<PrivacyStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepProgressIndicator,
  stepHeadingRef,
  handlePrivacyAcceptEssential,
  handlePrivacyAcceptAll,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Privacy Preferences">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        {stepProgressIndicator}
        <header className="onboarding__header">
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            Privacy Preferences
          </h1>
          <p className="onboarding__subtitle">
            Even in local-only mode, you can choose to share anonymous usage data to help us improve
            the app. This is entirely optional.
          </p>
        </header>

        <div className="onboarding__privacy-choices">
          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--primary"
            onClick={handlePrivacyAcceptEssential}
          >
            Essential Only: Maximum Privacy
          </button>
          <p className="onboarding__privacy-note">
            No analytics, no error reporting, no sync. Your data never leaves this device.
          </p>

          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--secondary"
            onClick={handlePrivacyAcceptAll}
          >
            Help Improve Finance
          </button>
          <p className="onboarding__privacy-note">
            Allow anonymous analytics and crash reporting. You can change this anytime in Settings.
          </p>
        </div>
      </div>
    </main>
  );
};
