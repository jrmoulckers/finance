// SPDX-License-Identifier: BUSL-1.1

/**
 * SignupPage — standalone account-creation page for the Finance PWA.
 *
 * This page is rendered outside of `AppLayout` and reuses the shared
 * auth-card layout from `auth.css`.
 */

import React, { useCallback, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type AuthContextValue } from '../auth/auth-context';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import '../styles/auth.css';

/** Minimum password length enforced by client-side validation. */
const MIN_PASSWORD_LENGTH = 8;

/** Lightweight email format check for custom validation feedback. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignupFieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

interface SubmitMessage {
  type: 'error' | 'info';
  text: string;
}

type SignupCapableAuth = AuthContextValue & {
  signup?: (email: string, password: string) => Promise<void>;
  register?: (email: string, password: string) => Promise<void>;
};

/**
 * Standalone signup page for the web app.
 *
 * The current auth context does not expose a registration action, so the page
 * validates the form and shows a friendly "coming soon" message until signup
 * support is wired into the backend and auth context.
 */
export const SignupPage: React.FC = () => {
  const auth = useAuth() as SignupCapableAuth;
  const { error: authError, isLoading } = auth;
  const signupAction = auth.signup ?? auth.register;

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
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      errors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
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

      setIsSubmitting(true);

      try {
        if (signupAction) {
          await signupAction(email.trim(), password);
          setSubmitMessage({
            type: 'info',
            text: 'Account created. You can now sign in.',
          });
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 600));
        setSubmitMessage({
          type: 'info',
          text: 'Registration coming soon. Please check back later.',
        });
      } catch (error) {
        setSubmitMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Registration failed.',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, signupAction, validate],
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
              Confirm password
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
