// SPDX-License-Identifier: BUSL-1.1

/**
 * Comfort/accessibility preferences step. Presentational subcomponent extracted
 * from `OnboardingPage.tsx` (#3712); all state lives in the parent page.
 */

import React from 'react';

import { FONT_SCALE_OPTIONS } from '../../../hooks/useFontScale';

export type ComfortStepProps = {
  onboardingClassName: string;
  onboardingProgressLiveRegion: React.ReactNode;
  stepProgressIndicator: React.ReactNode;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  fontScaleValue: number;
  reducedMotion: boolean;
  simplifiedMode: boolean;
  highContrast: boolean;
  handleUseSimpleMode: () => void;
  handleFontScaleChange: (value: number) => void;
  handleReducedMotionChange: (checked: boolean) => void;
  handleSimplifiedModeChange: (checked: boolean) => void;
  handleHighContrastChange: (checked: boolean) => void;
  handleComfortContinue: () => void;
};

export const ComfortStep: React.FC<ComfortStepProps> = ({
  onboardingClassName,
  onboardingProgressLiveRegion,
  stepProgressIndicator,
  stepHeadingRef,
  fontScaleValue,
  reducedMotion,
  simplifiedMode,
  highContrast,
  handleUseSimpleMode,
  handleFontScaleChange,
  handleReducedMotionChange,
  handleSimplifiedModeChange,
  handleHighContrastChange,
  handleComfortContinue,
}) => {
  return (
    <main className={onboardingClassName} aria-label="Comfort Preferences">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        {stepProgressIndicator}
        <header className="onboarding__header">
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            Welcome to Finance
          </h1>
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
              <label htmlFor="onboarding-font-scale" className="onboarding__preference-title-text">
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
};
