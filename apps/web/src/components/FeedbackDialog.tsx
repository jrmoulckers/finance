// SPDX-License-Identifier: BUSL-1.1

/**
 * FeedbackDialog — Modal form for users to report bugs, give feedback, or suggest features.
 *
 * Submits feedback to the backend `/api/feedback` facade, which creates a
 * GitHub issue for beta triage using a server-side token.
 *
 * @module components/FeedbackDialog
 * References: issues #1476, #2031
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import packageJson from '../../package.json';
import { buildFeedbackDiagnostics, submitFeedback } from '../lib/feedback';
import { useFocusTrap } from '../accessibility/aria';

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

  return (
    <div className="form-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
      >
        <h2 id="feedback-dialog-title" className="form-dialog__title">
          Send feedback
        </h2>

        {submitted ? (
          <div className="feedback-dialog__success" role="status" aria-live="polite">
            <p className="feedback-dialog__success-text">
              Thank you! Your feedback has been sent to GitHub triage.
            </p>
            <button type="button" className="form-button form-button--primary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="form-banner-error" role="alert">
                {error}
              </div>
            )}

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
                className="form-group__input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={160}
                placeholder="Briefly summarize your feedback"
                aria-required="true"
                aria-invalid={error && !subject.trim() ? 'true' : undefined}
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
                className="form-group__input form-group__textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={12000}
                placeholder="Tell us what happened, what you expected, or what would help..."
                aria-required="true"
                aria-invalid={error && !body.trim() ? 'true' : undefined}
              />
            </div>

            <div className="form-group">
              <label htmlFor="feedback-diagnostics" className="form-group__label">
                <input
                  id="feedback-diagnostics"
                  type="checkbox"
                  checked={includeDiagnostics}
                  onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                />{' '}
                Include diagnostic info
              </label>
            </div>

            <div className="form-dialog__actions">
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
