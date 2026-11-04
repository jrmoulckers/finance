// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';

import { useOptionalAuth } from '../auth/auth-context';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { requestPasswordResetEmail } from '../lib/auth/password-reset';

import '../styles/auth.css';

const emailSchema = z.string().trim().email();
const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email, you'll receive a reset link shortly.";
const DEMO_MODE_MESSAGE =
  "Password reset emails can't be sent in demo mode because no backend is configured. Your data is stored locally on this device.";

/** Starts the email-based password reset flow. */
export const ForgotPasswordPage: React.FC = () => {
  const isDemoMode = useOptionalAuth()?.isDemoMode ?? false;
  const uid = useId();
  const emailId = `${uid}-email`;
  const emailErrorId = `${uid}-email-error`;

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  const redirectTo = useMemo(() => `${window.location.origin}/reset-password`, []);

  /**
   * Autofocus the email field on mount so keyboard users can start typing
   * immediately (#3656). Deferred via rAF so it runs after the initial paint.
   */
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(handle);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);

    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setEmailError('Enter a valid email address.');
      return;
    }

    setEmailError(null);

    if (isDemoMode) {
      setStatusMessage(DEMO_MODE_MESSAGE);
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordResetEmail(parsedEmail.data, redirectTo);
    } catch (err) {
      // eslint-disable-next-line no-console -- log the real failure for diagnostics; never reveal account existence to the user
      console.error('[auth] reset email request failed', err); // SAFE: logs failure marker only, no PII
    } finally {
      // Always show the generic message so a backend failure cannot be used to enumerate accounts.
      setStatusMessage(GENERIC_SUCCESS_MESSAGE);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby={`${uid}-title`}>
        <header className="auth-brand">
          <h1 id={`${uid}-title`} className="auth-brand__name">
            Finance
          </h1>
          <p className="auth-brand__tagline">Reset your password</p>
        </header>

        {isDemoMode && (
          <div className="auth-demo-banner" role="status">
            Demo Mode. No backend configured. Data is stored locally.
          </div>
        )}

        {statusMessage && (
          <div className="auth-info" role="status" aria-live="polite">
            {statusMessage}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <p className="auth-instructions">
            {isDemoMode
              ? 'Password reset is unavailable in local-only mode because there is no account to recover.'
              : "Enter your email address and we'll send a link to reset your password."}
          </p>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor={emailId}>
              Email
            </label>
            <input
              ref={emailInputRef}
              id={emailId}
              className="auth-field__input"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              disabled={isSubmitting}
              aria-invalid={emailError ? 'true' : undefined}
              aria-describedby={emailError ? emailErrorId : undefined}
            />
            {emailError && (
              <p id={emailErrorId} className="auth-field__error" role="alert">
                {emailError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size={20} label="Sending reset link" />
                <span>Sending...</span>
              </>
            ) : (
              'Send reset link'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Remember your password?{' '}
          <Link to="/login" className="auth-footer__link">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
};

export default ForgotPasswordPage;
