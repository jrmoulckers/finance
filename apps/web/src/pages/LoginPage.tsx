// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import '../components/forms/forms.css';
import '../styles/auth.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/**
 * Standalone login page for pre-authentication web access.
 */
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithEmail, loginWithPasskey, isAuthenticated, isLoading, error, webAuthnSupported } =
    useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const emailErrorId = `${uid}-email-error`;
  const passwordErrorId = `${uid}-password-error`;
  const authErrorId = `${uid}-auth-error`;

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextFieldErrors: LoginFieldErrors = {};
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      nextFieldErrors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      nextFieldErrors.email = 'Enter a valid email address.';
    }

    if (!password) {
      nextFieldErrors.password = 'Password is required.';
    }

    setFieldErrors(nextFieldErrors);

    if (nextFieldErrors.email) {
      emailInputRef.current?.focus();
      return;
    }

    if (nextFieldErrors.password) {
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      await loginWithEmail(normalizedEmail, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await loginWithPasskey();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isLoading;

  return (
    <main className="auth-page">
      <section className="auth-card auth-card--login" aria-labelledby={`${uid}-title`}>
        <header className="auth-brand">
          <h1 id={`${uid}-title`} className="auth-brand__name">
            Finance
          </h1>
          <p className="auth-brand__tagline">
            Secure financial tracking for you and your household
          </p>
        </header>

        {error && (
          <div
            ref={errorRef}
            id={authErrorId}
            className="auth-error"
            aria-live="polite"
            tabIndex={-1}
          >
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleEmailLogin} aria-label="Sign in" noValidate>
          <div className="form-fields">
            <div className="form-group">
              <label htmlFor={emailId} className="form-group__label form-group__label--required">
                Email
              </label>
              <input
                ref={emailInputRef}
                id={emailId}
                name="email"
                type="email"
                required
                autoComplete="email"
                className={`form-input${fieldErrors.email ? ' form-input--error' : ''}`}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                disabled={isBusy}
                aria-label="Email address"
                aria-invalid={fieldErrors.email ? 'true' : undefined}
                aria-describedby={[
                  fieldErrors.email ? emailErrorId : null,
                  error ? authErrorId : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <p id={emailErrorId} className="form-error">
                {fieldErrors.email ?? ' '}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor={passwordId} className="form-group__label form-group__label--required">
                Password
              </label>
              <input
                ref={passwordInputRef}
                id={passwordId}
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className={`form-input${fieldErrors.password ? ' form-input--error' : ''}`}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                disabled={isBusy}
                aria-label="Password"
                aria-invalid={fieldErrors.password ? 'true' : undefined}
                aria-describedby={[
                  fieldErrors.password ? passwordErrorId : null,
                  error ? authErrorId : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <p id={passwordErrorId} className="form-error">
                {fieldErrors.password ?? ' '}
              </p>
            </div>
          </div>

          <div className="auth-actions">
            <button type="submit" className="auth-submit" disabled={isBusy} aria-busy={isBusy}>
              {isBusy ? (
                <>
                  <LoadingSpinner size={20} label="Signing in" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>

            {webAuthnSupported ? (
              <>
                <div className="auth-divider" aria-hidden="true">
                  <span className="auth-divider__text">or</span>
                </div>
                <button
                  type="button"
                  className="form-button form-button--secondary auth-passkey-button"
                  onClick={handlePasskeyLogin}
                  disabled={isBusy}
                  aria-busy={isBusy}
                >
                  Sign in with passkey
                </button>
              </>
            ) : null}
          </div>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="auth-footer__link">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
};

export default LoginPage;
