// SPDX-License-Identifier: BUSL-1.1

/**
 * ConsentDialog — first-run GDPR consent capture dialog.
 *
 * Displays on first visit (or when the privacy policy version changes).
 * Uses a modal dialog with focus trapping for accessibility.
 *
 * Features:
 *   - Granular opt-in per consent category
 *   - "Accept All" / "Reject All" / "Save Preferences" actions
 *   - Accessible modal with focus trap and keyboard navigation
 *   - Links to privacy policy
 *   - ARIA labelled and described
 *
 * References: issue #443 (GDPR consent — critical legal blocker)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONSENT_DESCRIPTIONS,
  CONSENT_LABELS,
  type ConsentCategory,
} from '../../lib/consent-storage';
import { useConsent } from '../../hooks/useConsent';
import './consent-dialog.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categories the user can toggle (essential is always on). */
const TOGGLEABLE_CATEGORIES: ConsentCategory[] = [
  'analytics',
  'error_reporting',
  'sync',
  'marketing',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ConsentDialogProps {
  /** Called after the user makes a consent decision. */
  onComplete?: () => void;
}

/**
 * First-run consent dialog for GDPR compliance.
 *
 * Renders as a modal overlay. Traps focus within the dialog.
 * Only renders when `needsConsent` is true.
 */
export const ConsentDialog: React.FC<ConsentDialogProps> = ({ onComplete }) => {
  const { needsConsent, consent, acceptAll, rejectAll, savePreferences } = useConsent();
  const [showDetails, setShowDetails] = useState(false);
  const [localPreferences, setLocalPreferences] = useState<Record<ConsentCategory, boolean>>({
    essential: true,
    analytics: consent.categories.analytics,
    error_reporting: consent.categories.error_reporting,
    sync: consent.categories.sync,
    marketing: consent.categories.marketing,
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus the dialog on mount
  useEffect(() => {
    if (needsConsent) {
      firstFocusRef.current?.focus();
    }
  }, [needsConsent]);

  // Trap keyboard focus within the dialog
  useEffect(() => {
    if (!needsConsent) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't allow dismissal without a decision
        e.preventDefault();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [needsConsent]);

  const handleAcceptAll = useCallback(() => {
    acceptAll();
    onComplete?.();
  }, [acceptAll, onComplete]);

  const handleRejectAll = useCallback(() => {
    rejectAll();
    onComplete?.();
  }, [rejectAll, onComplete]);

  const handleSavePreferences = useCallback(() => {
    savePreferences(localPreferences);
    onComplete?.();
  }, [savePreferences, localPreferences, onComplete]);

  const handleToggle = useCallback((category: ConsentCategory) => {
    if (category === 'essential') return; // Can't disable essential
    setLocalPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  if (!needsConsent) {
    return null;
  }

  return (
    <div className="consent-overlay" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-description"
        className="consent-dialog"
      >
        {/* Header */}
        <div className="consent-dialog__header">
          <h2 id="consent-title" className="consent-dialog__title">
            Your Privacy Matters
          </h2>
          <p id="consent-description" className="consent-dialog__description">
            We use cookies and similar technologies to provide core functionality and improve your
            experience. You can choose which optional data processing to allow. Your financial data
            is always encrypted and private.
          </p>
        </div>

        {/* Quick actions */}
        {!showDetails && (
          <div className="consent-dialog__actions">
            <button
              ref={firstFocusRef}
              type="button"
              onClick={handleAcceptAll}
              className="consent-button consent-button--primary"
            >
              Accept All
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="consent-button consent-button--secondary"
            >
              Essential Only
            </button>
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="consent-button consent-button--link"
            >
              Customize Preferences
            </button>
          </div>
        )}

        {/* Detailed preferences */}
        {showDetails && (
          <div className="consent-dialog__preferences">
            <fieldset className="consent-dialog__fieldset" aria-label="Privacy preferences">
              <legend className="consent-dialog__legend">
                Choose which data processing to allow:
              </legend>

              {/* Essential — always on */}
              <div className="consent-dialog__category consent-dialog__category--disabled">
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={`${CONSENT_LABELS.essential} (required)`}
                  className="consent-dialog__category-checkbox"
                />
                <div>
                  <span className="consent-dialog__category-label">
                    {CONSENT_LABELS.essential}{' '}
                    <span className="consent-dialog__category-required">(required)</span>
                  </span>
                  <p className="consent-dialog__category-description">
                    {CONSENT_DESCRIPTIONS.essential}
                  </p>
                </div>
              </div>

              {/* Toggleable categories */}
              {TOGGLEABLE_CATEGORIES.map((category) => (
                <div key={category} className="consent-dialog__category">
                  <input
                    type="checkbox"
                    checked={localPreferences[category]}
                    onChange={() => handleToggle(category)}
                    aria-label={CONSENT_LABELS[category]}
                    className="consent-dialog__category-checkbox"
                  />
                  <div>
                    <span className="consent-dialog__category-label">
                      {CONSENT_LABELS[category]}
                    </span>
                    <p className="consent-dialog__category-description">
                      {CONSENT_DESCRIPTIONS[category]}
                    </p>
                  </div>
                </div>
              ))}
            </fieldset>

            <div className="consent-dialog__preference-actions">
              <button
                ref={firstFocusRef}
                type="button"
                onClick={handleSavePreferences}
                className="consent-dialog__save-btn"
              >
                Save Preferences
              </button>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="consent-dialog__back-btn"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Footer with privacy policy link */}
        <p className="consent-dialog__footer">
          By using this app, you agree to our{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="consent-dialog__footer-link"
          >
            Privacy Policy
          </a>
          . You can change your preferences at any time in Settings.
        </p>
      </div>
    </div>
  );
};

export default ConsentDialog;
