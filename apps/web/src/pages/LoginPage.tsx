// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { getPreferredAuthMethod, setPreferredAuthMethod } from '../auth/preferred-auth-method';
import { PasskeySetupPrompt } from '../components/auth/PasskeySetupPrompt';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { hasRegisteredPasskey } from '../lib/passkey-preferences';
import { loginSchema } from '../lib/validation';

import '../components/forms/forms.css';
import '../styles/auth.css';

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/**
 * Standalone login page for pre-authentication web access.
 */
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    loginWithEmail,
    loginWithPasskey,
    loginWithOAuth,
    isAuthenticated,
    isLoading,
    error,
    webAuthnSupported,
    webAuthnReady,
    isDemoMode,
    showPasskeyPrompt,
    dismissPasskeyPrompt,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Async platform-authenticator capability check (#1983).
   *
   * `webAuthnSupported` only tells us that the WebAuthn API surface exists
   * — it doesn't confirm there's a usable platform authenticator (Windows
   * Hello, Touch ID, etc.). We start `null` (== "unknown / still checking")
   * so the biometric-first layout only activates once the browser confirms
   * an authenticator is actually available.
   */
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState<boolean | null>(null);

  /**
   * Snapshot of the persisted preferred-auth-method at mount time.
   *
   * Read once via `useState` initialiser so that changes mid-render (e.g.
   * during a passkey-login round-trip) don't reflow the form layout
   * underneath the user.
   */
  const [preferredMethod] = useState(() => getPreferredAuthMethod());

  /**
   * `true` when biometric sign-in should be the primary CTA — requires
   * (a) WebAuthn support, (b) a confirmed platform authenticator, and
   * (c) either a stored "passkey" preference (#1983) or a previously
   * registered passkey (legacy fallback).
   */
  const passkeyPrimary =
    webAuthnSupported &&
    webAuthnReady &&
    platformAuthAvailable === true &&
    (preferredMethod === 'passkey' || hasRegisteredPasskey());

  /**
   * Whether the email/password disclosure under the biometric CTA is
   * expanded. Only meaningful when `passkeyPrimary` is true; otherwise the
   * form is always visible.
   */
  const [showEmailForm, setShowEmailForm] = useState(false);

  /** Computed visibility: form is always shown unless biometric is primary. */
  const emailFormVisible = !passkeyPrimary || showEmailForm;

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

  /**
   * Confirm a platform authenticator is actually available on this device
   * before promoting the biometric CTA (#1983). The check is async per the
   * WebAuthn spec — we cancel via `cancelled` if the page unmounts first.
   */
  useEffect(() => {
    if (!webAuthnSupported) {
      setPlatformAuthAvailable(false);
      return;
    }

    let cancelled = false;
    const PKC = (typeof window !== 'undefined' ? window.PublicKeyCredential : undefined) as
      | (typeof PublicKeyCredential & {
          isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
        })
      | undefined;

    if (!PKC || typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      setPlatformAuthAvailable(false);
      return;
    }

    PKC.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((available) => {
        if (!cancelled) setPlatformAuthAvailable(available === true);
      })
      .catch(() => {
        if (!cancelled) setPlatformAuthAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [webAuthnSupported]);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextFieldErrors: LoginFieldErrors = {};
    const normalizedEmail = email.trim();
    const result = loginSchema.safeParse({
      email: normalizedEmail,
      password,
    });

    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'email') {
          nextFieldErrors.email = 'Enter a valid email address.';
        }

        if (issue.path[0] === 'password') {
          nextFieldErrors.password = 'Password is required.';
        }
      }
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
      await loginWithPasskey(email.trim() || undefined);
      // Reaffirm the user's preference whenever they successfully sign in
      // with biometrics (#1983). Idempotent.
      setPreferredAuthMethod('passkey');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isLoading;
  const locationState = location.state as { message?: unknown } | null;
  const infoMessage = typeof locationState?.message === 'string' ? locationState.message : null;

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

        {isDemoMode && (
          <div className="auth-demo-banner" role="status">
            Demo Mode — No backend configured. Data is stored locally.
          </div>
        )}

        {infoMessage && (
          <div className="auth-info" role="status" aria-live="polite">
            {infoMessage}
          </div>
        )}

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

        {/* ── Passkey-first layout: biometric primary when preferred (#1983) ── */}
        {/* Passkey UI is suppressed in demo mode (#2011) because the demo
            build ships with a placeholder Supabase URL and no backend
            passkey service. */}
        {passkeyPrimary && !isDemoMode && (
          <div className="auth-actions" style={{ marginBottom: 'var(--spacing-4)' }}>
            <button
              type="button"
              className="auth-submit"
              onClick={handlePasskeyLogin}
              disabled={isBusy || !webAuthnReady}
              aria-busy={isBusy}
            >
              {isBusy ? (
                <>
                  <LoadingSpinner size={20} label="Signing in" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign in with biometrics'
              )}
            </button>

            <button
              type="button"
              className="auth-disclosure"
              onClick={() => setShowEmailForm((v) => !v)}
              aria-expanded={emailFormVisible}
              aria-controls="login-email-form"
            >
              {emailFormVisible ? 'Hide email & password' : 'Use email & password'}
            </button>
          </div>
        )}

        <form
          id="login-email-form"
          className="auth-form"
          onSubmit={handleEmailLogin}
          aria-label="Sign in"
          noValidate
          hidden={!emailFormVisible}
        >
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
              {!isDemoMode && (
                <p className="auth-forgot-password">
                  <Link to="/forgot-password" className="auth-footer__link">
                    Forgot password?
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="auth-actions">
            <button
              type="submit"
              className={
                passkeyPrimary
                  ? 'form-button form-button--secondary auth-passkey-button'
                  : 'auth-submit'
              }
              disabled={isBusy}
              aria-busy={isBusy}
            >
              {isBusy && !passkeyPrimary ? (
                <>
                  <LoadingSpinner size={20} label="Signing in" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>

            {/* Show passkey as secondary when no passkey registered yet
                — but keep it disabled until WebAuthn has backend config. */}
            {webAuthnSupported && !passkeyPrimary && !isDemoMode ? (
              <>
                <div className="auth-divider" aria-hidden="true">
                  <span className="auth-divider__text">or</span>
                </div>
                <button
                  type="button"
                  className="form-button form-button--secondary auth-passkey-button"
                  onClick={handlePasskeyLogin}
                  disabled={isBusy || !webAuthnReady}
                  aria-busy={isBusy}
                >
                  Sign in with passkey
                </button>
              </>
            ) : null}

            <div className="auth-divider" aria-hidden="true">
              <span className="auth-divider__text">or continue with</span>
            </div>

            <div className="auth-oauth-buttons" role="group" aria-label="Social login options">
              <button
                type="button"
                className="form-button form-button--secondary auth-oauth-button"
                onClick={() => {
                  void loginWithOAuth('google');
                }}
                disabled={isBusy}
                aria-label="Sign in with Google"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>
              <button
                type="button"
                className="form-button form-button--secondary auth-oauth-button"
                onClick={() => {
                  void loginWithOAuth('github');
                }}
                disabled={isBusy}
                aria-label="Sign in with GitHub"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </button>
              <button
                type="button"
                className="form-button form-button--secondary auth-oauth-button"
                onClick={() => {
                  void loginWithOAuth('apple');
                }}
                disabled={isBusy}
                aria-label="Sign in with Apple"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                Apple
              </button>
            </div>
          </div>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="auth-footer__link">
            Sign up
          </Link>
        </p>
      </section>

      {/* Passkey setup prompt modal */}
      <PasskeySetupPrompt isOpen={showPasskeyPrompt} onClose={dismissPasskeyPrompt} />
    </main>
  );
};

export default LoginPage;
