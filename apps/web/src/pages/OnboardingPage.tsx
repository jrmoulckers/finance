// SPDX-License-Identifier: BUSL-1.1

/**
 * OnboardingPage — local-only onboarding path.
 *
 * Offers accessible comfort settings first, then two clear paths:
 *   1. Local Only — no account, no sync, all data stays on device
 *   2. Create Account — sign up for cloud sync and sharing
 *
 * References: issue #1621, #2148
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppIcon } from '../components/icons';
import { useBudgets } from '../hooks/useBudgets';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import {
  DEFAULT_FONT_SCALE_PREFERENCE,
  FONT_SCALE_OPTIONS,
  getFontScaleOption,
  setFontScalePreference,
} from '../hooks/useFontScale';
import { useLocalOnlyMode } from '../hooks/useLocalOnlyMode';
import { setReducedMotionPreference } from '../hooks/useReducedMotion';
import { applyTheme, THEME_STORAGE_KEY } from '../hooks/useTheme';
import { setSimplifiedModePreference } from '../lib/accessibility-preferences';
import { getBudgetStarterTemplates } from '../lib/budgeting/starter-budget-templates';
import type { FeatureAvailability } from '../lib/local-only-mode';

import './OnboardingPage.css';

const DEFAULT_FONT_SCALE_INDEX = Math.max(
  FONT_SCALE_OPTIONS.findIndex((option) => option.value === DEFAULT_FONT_SCALE_PREFERENCE),
  0,
);
const SIMPLE_MODE_FONT_SCALE_INDEX = Math.max(
  FONT_SCALE_OPTIONS.findIndex((option) => option.value === 'large'),
  DEFAULT_FONT_SCALE_INDEX,
);

type OnboardingStep = 'comfort' | 'choose' | 'privacy' | 'template' | 'complete';

function firstOfCurrentMonthISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function applyComfortPreferences(
  fontScaleValue: number,
  reducedMotion: boolean,
  simplifiedMode: boolean,
  highContrast: boolean,
): void {
  const selectedFontScale =
    FONT_SCALE_OPTIONS[Math.min(Math.max(fontScaleValue, 0), FONT_SCALE_OPTIONS.length - 1)] ??
    getFontScaleOption(DEFAULT_FONT_SCALE_PREFERENCE);

  setFontScalePreference(selectedFontScale.value);
  setReducedMotionPreference(reducedMotion);
  setSimplifiedModePreference(simplifiedMode);

  const nextTheme = highContrast ? 'high-contrast' : 'system';
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

const FeatureRow: React.FC<{ feature: FeatureAvailability }> = ({ feature }) => (
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

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { features, enableLocalOnly, completeOnboarding } = useLocalOnlyMode();
  const { acceptAll, rejectAll } = useConsent();
  const { recordBulkChanges } = useConsentHistory();
  const { createBudgetTemplate } = useBudgets();

  const starterTemplates = useMemo(() => getBudgetStarterTemplates(), []);
  const studentTemplate = starterTemplates.find((template) => template.id === 'student') ?? null;
  const futureTemplates = starterTemplates.filter((template) => template.isAvailable === false);

  const [step, setStep] = useState<OnboardingStep>('comfort');
  const [fontScaleValue, setFontScaleValue] = useState(DEFAULT_FONT_SCALE_INDEX);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [starterBudgetCreated, setStarterBudgetCreated] = useState(false);

  const onboardingClassName = [
    'onboarding',
    reducedMotion ? 'onboarding--reduced-motion' : '',
    simplifiedMode ? 'onboarding--simplified' : '',
    highContrast ? 'onboarding--high-contrast' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const updateComfortPreferences = useCallback(
    (
      nextFontScaleValue: number,
      nextReducedMotion: boolean,
      nextSimplifiedMode: boolean,
      nextHighContrast: boolean,
    ) => {
      applyComfortPreferences(
        nextFontScaleValue,
        nextReducedMotion,
        nextSimplifiedMode,
        nextHighContrast,
      );
    },
    [],
  );

  const handleFontScaleChange = useCallback(
    (value: number) => {
      setFontScaleValue(value);
      updateComfortPreferences(value, reducedMotion, simplifiedMode, highContrast);
    },
    [highContrast, reducedMotion, simplifiedMode, updateComfortPreferences],
  );

  const handleReducedMotionChange = useCallback(
    (checked: boolean) => {
      setReducedMotion(checked);
      updateComfortPreferences(fontScaleValue, checked, simplifiedMode, highContrast);
    },
    [fontScaleValue, highContrast, simplifiedMode, updateComfortPreferences],
  );

  const handleSimplifiedModeChange = useCallback(
    (checked: boolean) => {
      setSimplifiedMode(checked);
      updateComfortPreferences(fontScaleValue, reducedMotion, checked, highContrast);
    },
    [fontScaleValue, highContrast, reducedMotion, updateComfortPreferences],
  );

  const handleHighContrastChange = useCallback(
    (checked: boolean) => {
      setHighContrast(checked);
      updateComfortPreferences(fontScaleValue, reducedMotion, simplifiedMode, checked);
    },
    [fontScaleValue, reducedMotion, simplifiedMode, updateComfortPreferences],
  );

  const handleUseSimpleMode = useCallback(() => {
    setFontScaleValue(SIMPLE_MODE_FONT_SCALE_INDEX);
    setReducedMotion(true);
    setSimplifiedMode(true);
    updateComfortPreferences(SIMPLE_MODE_FONT_SCALE_INDEX, true, true, highContrast);
    setStep('choose');
  }, [highContrast, updateComfortPreferences]);

  const handleComfortContinue = useCallback(() => {
    setStep('choose');
  }, []);

  const handleLocalOnly = useCallback(() => {
    setTemplateError(null);
    setStep('privacy');
  }, []);

  const handleCreateAccount = useCallback(() => {
    completeOnboarding();
    navigate('/signup');
  }, [completeOnboarding, navigate]);

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
    setTemplateError(null);
    setStep('template');
  }, [enableLocalOnly, recordBulkChanges, rejectAll]);

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
    setTemplateError(null);
    setStep('template');
  }, [acceptAll, enableLocalOnly, recordBulkChanges]);

  const handleSkipStarterBudget = useCallback(() => {
    setStarterBudgetCreated(false);
    setTemplateError(null);
    completeOnboarding();
    setStep('complete');
  }, [completeOnboarding]);

  const handleApplyStudentTemplate = useCallback(() => {
    if (!studentTemplate) {
      setTemplateError('Student starter budget is unavailable right now.');
      return;
    }

    setIsApplyingTemplate(true);
    setTemplateError(null);

    try {
      const createdBudgets = createBudgetTemplate({
        templateId: studentTemplate.id,
        startDate: firstOfCurrentMonthISO(),
      });

      if (!createdBudgets || createdBudgets.length === 0) {
        throw new Error('Failed to create the student starter budget.');
      }

      setStarterBudgetCreated(true);
      completeOnboarding();
      setStep('complete');
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : 'Failed to create the student starter budget.',
      );
    } finally {
      setIsApplyingTemplate(false);
    }
  }, [completeOnboarding, createBudgetTemplate, studentTemplate]);

  const handleGoToDashboard = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  if (step === 'comfort') {
    return (
      <main className={onboardingClassName} aria-label="Comfort Preferences">
        <div className="onboarding__container onboarding__container--narrow">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Welcome to Finance</h1>
            <h2 className="onboarding__preferences-title">Make it Yours</h2>
            <p className="onboarding__subtitle">
              Pick a few comfort settings now. You can change these any time later in Settings.
            </p>
          </header>

          <section className="onboarding__preferences-card" aria-label="Comfort settings">
            <div className="onboarding__simple-mode-card" aria-label="Simple Mode quick start">
              <div className="onboarding__simple-mode-copy">
                <span className="onboarding__simple-mode-kicker">Recommended first step</span>
                <h3 className="onboarding__simple-mode-title">Simple Mode</h3>
                <p className="onboarding__simple-mode-description">
                  Large text, calmer navigation, and fewer features so Finance feels easier right
                  away.
                </p>
                <ul className="onboarding__simple-mode-list" role="list">
                  <li role="listitem">Large text for easier reading</li>
                  <li role="listitem">Reduced motion for a calmer experience</li>
                  <li role="listitem">Simplified screens with fewer distractions</li>
                </ul>
              </div>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--primary onboarding__simple-mode-button"
                onClick={handleUseSimpleMode}
              >
                Use Simple Mode
              </button>
            </div>

            <div className="onboarding__preferences-divider">Or adjust each setting</div>

            <div className="onboarding__preference onboarding__preference--stacked">
              <div className="onboarding__preference-copy">
                <label
                  htmlFor="onboarding-font-scale"
                  className="onboarding__preference-title-text"
                >
                  Text Size
                </label>
                <p className="onboarding__preference-description">
                  Make labels and charts easier to read from the start.
                </p>
              </div>
              <input
                id="onboarding-font-scale"
                className="onboarding__range"
                type="range"
                min="0"
                max={FONT_SCALE_OPTIONS.length - 1}
                step="1"
                value={fontScaleValue}
                onChange={(event) => handleFontScaleChange(Number(event.target.value))}
                aria-label="Text Size"
              />
              <div className="onboarding__range-labels" aria-hidden="true">
                {FONT_SCALE_OPTIONS.map((option) => (
                  <span key={option.value}>{option.label}</span>
                ))}
              </div>
            </div>

            <label className="onboarding__toggle">
              <span className="onboarding__toggle-copy">
                <span className="onboarding__preference-title-text">Reduce Motion</span>
                <span className="onboarding__preference-description">
                  Tone down animations if you prefer a calmer interface.
                </span>
              </span>
              <input
                type="checkbox"
                className="onboarding__toggle-input"
                checked={reducedMotion}
                onChange={(event) => handleReducedMotionChange(event.target.checked)}
                aria-label="Reduce Motion"
              />
              <span className="onboarding__toggle-switch" aria-hidden="true" />
            </label>

            <label className="onboarding__toggle">
              <span className="onboarding__toggle-copy">
                <span className="onboarding__preference-title-text">Simplified Mode</span>
                <span className="onboarding__preference-description">
                  Start with a lower-stress layout and fewer competing elements.
                </span>
              </span>
              <input
                type="checkbox"
                className="onboarding__toggle-input"
                checked={simplifiedMode}
                onChange={(event) => handleSimplifiedModeChange(event.target.checked)}
                aria-label="Simplified Mode"
              />
              <span className="onboarding__toggle-switch" aria-hidden="true" />
            </label>

            <label className="onboarding__toggle">
              <span className="onboarding__toggle-copy">
                <span className="onboarding__preference-title-text">High Contrast</span>
                <span className="onboarding__preference-description">
                  Increase visual contrast for stronger focus and readability.
                </span>
              </span>
              <input
                type="checkbox"
                className="onboarding__toggle-input"
                checked={highContrast}
                onChange={(event) => handleHighContrastChange(event.target.checked)}
                aria-label="High Contrast"
              />
              <span className="onboarding__toggle-switch" aria-hidden="true" />
            </label>

            <div className="onboarding__template-actions">
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={handleComfortContinue}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--primary"
                onClick={handleComfortContinue}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (step === 'choose') {
    return (
      <main className={onboardingClassName} aria-label="Get Started">
        <div className="onboarding__container">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Welcome to Finance</h1>
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
  }

  if (step === 'privacy') {
    return (
      <main className={onboardingClassName} aria-label="Privacy Preferences">
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

  if (step === 'template' && studentTemplate) {
    return (
      <main className={onboardingClassName} aria-label="Starter Budget Template">
        <div className="onboarding__container onboarding__container--narrow">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Want a starter budget? Choose a template:</h1>
            <p className="onboarding__subtitle">
              Start with a student-friendly budget you can edit any time as your income changes.
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
                  <strong>${(category.amountCents / 100).toFixed(0)}</strong>
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
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handleApplyStudentTemplate}
              disabled={isApplyingTemplate}
            >
              {isApplyingTemplate ? 'Creating Student Budget…' : 'Use Student Template'}
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
  }

  return (
    <main className={onboardingClassName} aria-label="Setup Complete">
      <div className="onboarding__container onboarding__container--narrow">
        <div className="onboarding__complete">
          <div className="onboarding__complete-icon" aria-hidden="true">
            <AppIcon name="sparkles" />
          </div>
          <h1 className="onboarding__title">You&apos;re All Set!</h1>
          <p className="onboarding__subtitle">
            {starterBudgetCreated
              ? 'Your finance tracker is ready, and your student starter budget is already in place.'
              : 'Your finance tracker is ready. All data is stored locally on this device.'}
          </p>
          <div className="onboarding__complete-details">
            <p className="onboarding__complete-item">
              <AppIcon name="lock" /> <strong>Local-only mode</strong> — no data leaves your browser
            </p>
            {starterBudgetCreated && (
              <p className="onboarding__complete-item">
                <AppIcon name="wallet" /> <strong>Starter budget added</strong> — realistic student
                categories are ready to edit
              </p>
            )}
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
