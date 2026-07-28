// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { getPreferredAuthMethod, setPreferredAuthMethod } from '../auth/preferred-auth-method';
import { OAuthButtons } from '../components/auth/OAuthButtons';
import { PasskeySetupPrompt } from '../components/auth/PasskeySetupPrompt';
import { PasswordInput } from '../components/auth/PasswordInput';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { LegalLinks } from '../components/legal/LegalLinks';
import { hasRegisteredPasskey } from '../lib/passkey-preferences';
import { loginSchema } from '../lib/validation';

import '../components/auth/password-input.css';
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

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  /**
   * Autofocus the email field on mount so keyboard users can start typing
   * immediately (#3656). Skipped when biometric sign-in is the primary CTA —
   * the email form is collapsed in that layout and stealing focus into a
   * hidden field would be disorienting. Deferred via rAF so it runs after the
   * initial paint and doesn't fight route-level focus management.
   */
  useEffect(() => {
    if (passkeyPrimary) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(handle);
  }, [passkeyPrimary]);

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
    } catch {
      // Error state is surfaced via auth context; swallow so the rejection
      // doesn't bubble as unhandled. Inputs are preserved (#3108).
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
    } catch {
      // Error surfaced via auth context; swallow to avoid unhandled rejection.
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
            Secure, private financial tracking for you and your household
          </p>
        </header>

        {isDemoMode && (
          <div className="auth-demo-banner" role="status">
            Demo Mode. No backend configured. Data is stored locally.
          </div>
        )}

        {infoMessage && (
          <div className="auth-info" role="status" aria-live="polite">
            {infoMessage}
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
              {emailFormVisible ? 'Hide email sign-in' : 'Sign in with email instead'}
            </button>
          </div>
        )}

        {/*
          The sign-in error is a direct child of the card — NOT inside the
          collapsible email form — so passkey- and OAuth-failure messages stay
          visible when the email form is collapsed for passkey-primary users
          (#1983). It sits adjacent to the sign-in controls and is announced
          politely via the live region; we no longer steal visual focus to a
          top-of-card box on every error (#3190).
        */}
        <div className="auth-error-region" aria-live="polite" aria-atomic="true">
          {error && (
            <div id={authErrorId} className="auth-error">
              <svg
                className="auth-error__icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="auth-error__text">{error}</span>
            </div>
          )}
        </div>

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
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
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
              <PasswordInput
                ref={passwordInputRef}
                id={passwordId}
                name="password"
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
          </div>
        </form>

        {/* Social sign-in lives OUTSIDE the collapsible email form so it stays
            reachable for passkey-primary users without expanding the email
            disclosure (#3178). */}
        <OAuthButtons
          onSelect={(provider) => {
            void loginWithOAuth(provider);
          }}
          disabled={isBusy}
          verb="Sign in"
          groupLabel="Social login options"
          dividerText="or continue with"
        />

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="auth-footer__link">
            Sign up
          </Link>
        </p>
        <footer className="auth-footer auth-footer--legal">
          <LegalLinks />
        </footer>
      </section>

      {/* Passkey setup prompt modal */}
      <PasskeySetupPrompt isOpen={showPasskeyPrompt} onClose={dismissPasskeyPrompt} />
    </main>
  );
};

export default LoginPage;
