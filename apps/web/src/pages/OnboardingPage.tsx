// SPDX-License-Identifier: BUSL-1.1

/**
 * OnboardingPage — local-only onboarding path.
 *
 * Offers two clear paths:
 *   1. Local Only — no account, no sync, all data stays on device
 *   2. Create Account — sign up for cloud sync and sharing
 *
 * Clearly communicates what each path provides and what it doesn't.
 * Local-only is positioned as a first-class option, not a fallback.
 *
 * References: issue #1621 (local-only onboarding path)
 */

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalOnlyMode } from '../hooks/useLocalOnlyMode';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import type { FeatureAvailability } from '../lib/local-only-mode';
import './OnboardingPage.css';
import { AppIcon } from '../components/icons';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Feature comparison row. */
const FeatureRow: React.FC<{
  feature: FeatureAvailability;
}> = ({ feature }) => (
  <tr className="onboarding__feature-row">
    <td className="onboarding__feature-name">
      <span className="onboarding__feature-title">{feature.name}</span>
      <span className="onboarding__feature-desc">{feature.description}</span>
    </td>
    <td
      className="onboarding__feature-cell"
      aria-label={
        feature.availableLocalOnly ? 'Available in Local Only' : 'Not available in Local Only'
      }
    >
      {feature.availableLocalOnly ? (
        <span className="onboarding__check" aria-hidden="true">
          <AppIcon name="check" />
        </span>
      ) : (
        <span className="onboarding__cross" aria-hidden="true">
          —
        </span>
      )}
    </td>
    <td className="onboarding__feature-cell" aria-label="Available with Account">
      <span className="onboarding__check" aria-hidden="true">
        <AppIcon name="check" />
      </span>
    </td>
  </tr>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/** Onboarding page with local-only and account paths. */
const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { features, enableLocalOnly, completeOnboarding } = useLocalOnlyMode();
  const { acceptAll, rejectAll } = useConsent();
  const { recordBulkChanges } = useConsentHistory();
  const [step, setStep] = useState<'choose' | 'privacy' | 'complete'>('choose');

  const handleLocalOnly = useCallback(() => {
    setStep('privacy');
  }, []);

  const handleCreateAccount = useCallback(() => {
    navigate('/signup');
  }, [navigate]);

  const handlePrivacyAcceptEssential = useCallback(() => {
    rejectAll();
    recordBulkChanges(
      [
        { category: 'analytics', granted: false },
        { category: 'error_reporting', granted: false },
        { category: 'sync', granted: false },
        { category: 'marketing', granted: false },
      ],
      'first_run',
    );
    enableLocalOnly();
    completeOnboarding();
    setStep('complete');
  }, [rejectAll, recordBulkChanges, enableLocalOnly, completeOnboarding]);

  const handlePrivacyAcceptAll = useCallback(() => {
    acceptAll();
    recordBulkChanges(
      [
        { category: 'analytics', granted: true },
        { category: 'error_reporting', granted: true },
        { category: 'sync', granted: true },
        { category: 'marketing', granted: true },
      ],
      'first_run',
    );
    enableLocalOnly();
    completeOnboarding();
    setStep('complete');
  }, [acceptAll, recordBulkChanges, enableLocalOnly, completeOnboarding]);

  const handleGoToDashboard = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  // Step 1: Choose path
  if (step === 'choose') {
    return (
      <main className="onboarding" aria-label="Get Started">
        <div className="onboarding__container">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Welcome to Finance</h1>
            <p className="onboarding__subtitle">
              Your personal finance tracker. Choose how you want to get started.
            </p>
          </header>

          {/* Path cards */}
          <div className="onboarding__paths">
            {/* Local Only */}
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

            {/* Account */}
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

          {/* Feature comparison table */}
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
                {features.map((f) => (
                  <FeatureRow key={f.id} feature={f} />
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    );
  }

  // Step 2: Privacy consent for local-only users
  if (step === 'privacy') {
    return (
      <main className="onboarding" aria-label="Privacy Preferences">
        <div className="onboarding__container onboarding__container--narrow">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Privacy Preferences</h1>
            <p className="onboarding__subtitle">
              Even in local-only mode, you can choose to share anonymous usage data to help us
              improve the app. This is entirely optional.
            </p>
          </header>

          <div className="onboarding__privacy-choices">
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handlePrivacyAcceptEssential}
            >
              Essential Only — Maximum Privacy
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
              Allow anonymous analytics and crash reporting. You can change this anytime in
              Settings.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Step 3: Complete
  return (
    <main className="onboarding" aria-label="Setup Complete">
      <div className="onboarding__container onboarding__container--narrow">
        <div className="onboarding__complete">
          <div className="onboarding__complete-icon" aria-hidden="true">
            <AppIcon name="sparkles" />
          </div>
          <h1 className="onboarding__title">You&apos;re All Set!</h1>
          <p className="onboarding__subtitle">
            Your finance tracker is ready. All data is stored locally on this device.
          </p>
          <div className="onboarding__complete-details">
            <p className="onboarding__complete-item">
              <AppIcon name="lock" /> <strong>Local-only mode</strong> — no data leaves your browser
            </p>
            <p className="onboarding__complete-item">
              <AppIcon name="database" /> <strong>SQLite storage</strong> — fast, reliable,
              offline-first
            </p>
            <p className="onboarding__complete-item">
              <AppIcon name="refresh" /> <strong>Upgrade anytime</strong> — create an account later
              to enable sync
            </p>
          </div>
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

export default OnboardingPage;
