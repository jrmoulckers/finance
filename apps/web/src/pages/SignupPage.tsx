// SPDX-License-Identifier: BUSL-1.1

/**
 * SignupPage — standalone account-creation page for the Finance PWA.
 *
 * This page is rendered outside of `AppLayout` and reuses the shared
 * auth-card layout from `auth.css`.
 *
 * On successful registration the user sees a confirmation message and is
 * automatically redirected to `/login` after two seconds.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { signupSchema } from '../lib/validation';

import '../styles/auth.css';

/** Minimum password length enforced by client-side validation. */
const MIN_PASSWORD_LENGTH = 8;

/** Duration (ms) before auto-redirecting to /login after successful signup. */
const REDIRECT_DELAY_MS = 2000;

interface SignupFieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

interface SubmitMessage {
  type: 'error' | 'info';
  text: string;
}

/**
 * Standalone signup page for the web app.
 *
 * Validates the form locally, then delegates to `signupWithEmail` from the
 * auth context which POSTs to the configured signup endpoint.
 */
export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { signupWithEmail, error: authError, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const confirmPasswordId = `${uid}-confirm-password`;
  const emailErrorId = `${uid}-email-error`;
  const passwordHintId = `${uid}-password-hint`;
  const passwordErrorId = `${uid}-password-error`;
  const confirmPasswordErrorId = `${uid}-confirm-password-error`;

  /** Ref to the pending redirect timer so it can be cancelled on unmount. */
  const redirectTimerRef = useRef<number | null>(null);

  // Cancel any pending redirect when the component unmounts.
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const confirmPasswordError = useMemo(() => {
    if (fieldErrors.confirmPassword) {
      return fieldErrors.confirmPassword;
    }

    if (confirmPassword.length > 0 && password !== confirmPassword) {
      return 'Passwords do not match.';
    }

    return undefined;
  }, [confirmPassword, fieldErrors.confirmPassword, password]);

  const displayMessage = useMemo<SubmitMessage | null>(() => {
    if (submitMessage) {
      return submitMessage;
    }

    return authError ? { type: 'error', text: authError } : null;
  }, [authError, submitMessage]);

  const validate = useCallback((): boolean => {
    const errors: SignupFieldErrors = {};
    const result = signupSchema.safeParse({
      email: email.trim(),
      password,
      confirmPassword,
    });

    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'email') {
          errors.email = 'Enter a valid email address.';
        }

        if (issue.path[0] === 'password') {
          errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
        }

        if (issue.path[0] === 'confirmPassword') {
          errors.confirmPassword = 'Passwords do not match.';
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [confirmPassword, email, password]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitMessage(null);

      if (!validate()) {
        return;
      }

      if (!signupWithEmail) {
        setSubmitMessage({
          type: 'info',
          text: 'Account creation is not yet available. Please check back soon.',
        });
        return;
      }

      setIsSubmitting(true);

      try {
        await signupWithEmail(email.trim(), password);

        setSubmitMessage({
          type: 'info',
          text: 'Account created! Please sign in.',
        });

        // Redirect to login after a short delay so the user can read the message.
        redirectTimerRef.current = window.setTimeout(() => {
          navigate('/login');
        }, REDIRECT_DELAY_MS);
      } catch (err) {
        setSubmitMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Registration failed.',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, navigate, password, signupWithEmail, validate],
  );

  const isBusy = isSubmitting || isLoading;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-brand">
          <h1 className="auth-brand__name">Finance</h1>
          <p className="auth-brand__tagline">Create your account</p>
        </header>

        {displayMessage && (
          <div
            className={displayMessage.type === 'error' ? 'auth-error' : 'auth-info'}
            role="status"
            aria-live="polite"
          >
            {displayMessage.text}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-field__label" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              className="auth-field__input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                const nextEmail = event.target.value;
                setEmail(nextEmail);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? emailErrorId : undefined}
            />
            {fieldErrors.email && (
              <p id={emailErrorId} className="auth-field__error" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor={passwordId}>
              Password
            </label>
            <input
              id={passwordId}
              className="auth-field__input"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => {
                const nextPassword = event.target.value;
                setPassword(nextPassword);
                setFieldErrors((current) => ({
                  ...current,
                  password: undefined,
                  confirmPassword:
                    confirmPassword.length > 0 && nextPassword !== confirmPassword
                      ? 'Passwords do not match.'
                      : undefined,
                }));
              }}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={[passwordHintId, fieldErrors.password ? passwordErrorId : null]
                .filter(Boolean)
                .join(' ')}
            />
            <p id={passwordHintId} className="auth-field__hint">
              Must be at least {MIN_PASSWORD_LENGTH} characters
            </p>
            {fieldErrors.password && (
              <p id={passwordErrorId} className="auth-field__error" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor={confirmPasswordId}>
              Confirm Password
            </label>
            <input
              id={confirmPasswordId}
              className="auth-field__input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => {
                const nextConfirmPassword = event.target.value;
                setConfirmPassword(nextConfirmPassword);
                setFieldErrors((current) => ({
                  ...current,
                  confirmPassword:
                    nextConfirmPassword.length > 0 && password !== nextConfirmPassword
                      ? 'Passwords do not match.'
                      : undefined,
                }));
              }}
              aria-invalid={confirmPasswordError ? 'true' : undefined}
              aria-describedby={confirmPasswordError ? confirmPasswordErrorId : undefined}
            />
            {confirmPasswordError && (
              <p id={confirmPasswordErrorId} className="auth-field__error" role="alert">
                {confirmPasswordError}
              </p>
            )}
          </div>

          <button type="submit" className="auth-submit" disabled={isBusy} aria-busy={isBusy}>
            {isBusy ? (
              <>
                <LoadingSpinner size={20} label="Creating account" />
                <span>Creating account...</span>
              </>
            ) : (
              'Sign up'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-footer__link">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
};

export default SignupPage;
