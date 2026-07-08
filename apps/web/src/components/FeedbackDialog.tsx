// SPDX-License-Identifier: BUSL-1.1

/**
 * FeedbackDialog — Modal form for users to report bugs, give feedback, or suggest features.
 *
 * Submits feedback to the backend `/api/feedback` facade, which creates a
 * GitHub issue for beta triage using a server-side token.
 *
 * @module components/FeedbackDialog
 * References: issues #1476, #2031, #3552
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import packageJson from '../../package.json';
import { buildFeedbackDiagnostics, submitFeedback } from '../lib/feedback';
import { useFocusTrap } from '../accessibility/aria';
import { Checkbox } from './common/Checkbox';
import './forms/forms.css';

const BUILD_SHA =
  import.meta.env.VITE_BUILD_SHA ??
  import.meta.env.VITE_GIT_SHA ??
  import.meta.env.VITE_COMMIT_SHA ??
  '';

export interface FeedbackDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
}

/** Accessible feedback dialog with focus trapping and GitHub issue submission. */
export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form state when dialog opens.
  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setBody('');
      setIncludeDiagnostics(true);
      setSubmitted(false);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // Trap focus within the dialog, focus the first field on open, and restore
  // focus to the trigger element when the dialog closes. The previous
  // hand-rolled trap never restored focus on close (issue #3338).
  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true, initialFocusRef: firstInputRef });

  const handlePanelKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!subject.trim()) {
        setError('Please provide a subject.');
        return;
      }

      if (!body.trim()) {
        setError('Please provide feedback details.');
        return;
      }

      setIsSubmitting(true);
      try {
        await submitFeedback({
          subject,
          body,
          includeDiagnostics,
          diagnostics: includeDiagnostics
            ? buildFeedbackDiagnostics({ appVersion: packageJson.version, buildSha: BUILD_SHA })
            : undefined,
        });
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send feedback. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [subject, body, includeDiagnostics],
  );

  if (!isOpen) return null;

  const subjectInvalid = Boolean(error) && !subject.trim();
  const bodyInvalid = Boolean(error) && !body.trim();

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handlePanelKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="form-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
      >
        <h2 id="feedback-dialog-title" className="form-dialog__title">
          Send feedback
        </h2>

        {submitted ? (
          <>
            <p className="form-group__help" role="status" aria-live="polite">
              Thank you! Your feedback has been sent to GitHub triage.
            </p>
            <div className="form-actions">
              <button type="button" className="form-button form-button--primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="form-banner-error" role="alert">
                {error}
              </div>
            )}

            <div className="form-fields">
              <div className="form-group">
                <label
                  htmlFor="feedback-subject"
                  className="form-group__label form-group__label--required"
                >
                  Subject
                </label>
                <input
                  id="feedback-subject"
                  ref={firstInputRef}
                  className={`form-input${subjectInvalid ? ' form-input--error' : ''}`}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={160}
                  placeholder="Briefly summarize your feedback"
                  aria-required="true"
                  aria-invalid={subjectInvalid ? 'true' : undefined}
                />
              </div>

              <div className="form-group">
                <label
                  htmlFor="feedback-body"
                  className="form-group__label form-group__label--required"
                >
                  Details
                </label>
                <textarea
                  id="feedback-body"
                  className={`form-textarea${bodyInvalid ? ' form-textarea--error' : ''}`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  maxLength={12000}
                  placeholder="Tell us what happened, what you expected, or what would help..."
                  aria-required="true"
                  aria-invalid={bodyInvalid ? 'true' : undefined}
                />
              </div>

              <Checkbox
                id="feedback-diagnostics"
                label="Include diagnostic info"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="form-button form-button--primary"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackDialog;
