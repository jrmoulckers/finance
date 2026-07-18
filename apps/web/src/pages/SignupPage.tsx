// SPDX-License-Identifier: BUSL-1.1

/**
 * SignupPage — standalone account-creation page for the Finance PWA.
 *
 * This page is rendered outside of `AppLayout` and reuses the shared
 * auth-card layout from `auth.css`.
 *
 * On successful registration the user is automatically logged in and
 * redirected to the dashboard.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { OAuthButtons } from '../components/auth/OAuthButtons';
import { PasswordInput } from '../components/auth/PasswordInput';
import { PasswordStrengthMeter } from '../components/auth/PasswordStrengthMeter';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { LegalLinks } from '../components/legal/LegalLinks';
import { calculatePasswordStrength } from '../lib/password-strength';
import { signupSchema } from '../lib/validation';

import '../components/auth/password-input.css';
import '../styles/auth.css';

/** Minimum password length enforced by client-side validation. */
const MIN_PASSWORD_LENGTH = 12;

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
  const {
    signupWithEmail,
    loginWithOAuth,
    isLoading,
    isDemoMode: demoMode,
    isAuthenticated,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [submitMessage, setSubmitMessage] = useState<SubmitMessage | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);

  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const confirmPasswordId = `${uid}-confirm-password`;
  const emailErrorId = `${uid}-email-error`;
  const passwordHintId = `${uid}-password-hint`;
  const passwordErrorId = `${uid}-password-error`;
  const confirmPasswordErrorId = `${uid}-confirm-password-error`;
  const legalNoticeId = `${uid}-legal-notice`;

  // Redirect to dashboard once the user is authenticated (auto-login after signup)
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  /**
   * Autofocus the email field on mount so keyboard users can start typing
   * immediately (#3656). Deferred via rAF so it runs after the initial paint.
   * Only applies while the form is shown — once the confirmation panel takes
   * over, that panel owns focus (#3702).
   */
  useEffect(() => {
    if (confirmationEmail) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(handle);
  }, [confirmationEmail]);

  /**
   * Move focus to the confirmation panel heading when the "Check your email"
   * view replaces the form (#3702), so keyboard and screen-reader users are
   * not stranded on the now-removed submit button.
   */
  useEffect(() => {
    if (!confirmationEmail) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      confirmationHeadingRef.current?.focus();
    });

    return () => cancelAnimationFrame(handle);
  }, [confirmationEmail]);

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
    // Only show messages produced by the signup form itself. The auth
    // context's `error` field carries login-flow errors (e.g. "No account
    // found for that email.") that would otherwise leak in here when the user
    // navigates from /login -> /signup. Signup failures are captured in
    // `submitMessage` directly via the catch handler below. See #1978.
    return submitMessage;
  }, [submitMessage]);

  const validate = useCallback((): SignupFieldErrors => {
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

    // Soft-gate the very-weakest tier (score 0 — common/breached passwords).
    // Runs independently of the length rule so a recognizably common password
    // gets the actionable "too common" message rather than a bare length hint
    // (#3679). Reuses the shared strength scorer / blocklist — no new rules.
    if (password.length > 0 && calculatePasswordStrength(password).score === 0) {
      errors.password =
        'This password is too common. Add length or unrelated words to make it harder to guess.';
    }

    setFieldErrors(errors);
    return errors;
  }, [confirmPassword, email, password]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitMessage(null);
      setConfirmationEmail(null);

      const errors = validate();
      if (Object.keys(errors).length > 0) {
        // Move focus to the first field with an error so the accessible error
        // (aria-invalid + role="alert") is announced and the user lands where
        // the fix is needed — including the very-weak password soft-gate (#3679).
        if (errors.email) {
          emailInputRef.current?.focus();
        } else if (errors.password) {
          passwordInputRef.current?.focus();
        }
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
        const signupEmail = email.trim();
        const result = await signupWithEmail(signupEmail, password);
        if (result.kind === 'confirmation_required') {
          setConfirmationEmail(signupEmail);
          return;
        }
        // Auto-login is handled by signupWithEmail — the useEffect above
        // will redirect to /dashboard once isAuthenticated becomes true.
      } catch (err) {
        setSubmitMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Registration failed.',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, signupWithEmail, validate],
  );

  const handleResendConfirmation = useCallback(async () => {
    if (!confirmationEmail || !signupWithEmail) {
      return;
    }

    setSubmitMessage(null);
    setIsSubmitting(true);
    try {
      const result = await signupWithEmail(confirmationEmail, password);
      if (result.kind === 'confirmation_required') {
        setSubmitMessage({ type: 'info', text: 'Confirmation email sent again.' });
      }
    } catch (err) {
      setSubmitMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not resend confirmation email.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmationEmail, password, signupWithEmail]);

  const isBusy = isSubmitting || isLoading;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-brand">
          <h1 className="auth-brand__name">Finance</h1>
          <p className="auth-brand__tagline">Create your account</p>
        </header>

        {demoMode && (
          <div className="auth-demo-banner" role="status">
            Demo Mode. No backend configured. Data is stored locally.
          </div>
        )}

        {displayMessage && (
          <div
            className={displayMessage.type === 'error' ? 'auth-error' : 'auth-info'}
            role="status"
            aria-live="polite"
          >
            {displayMessage.text}
          </div>
        )}

        {confirmationEmail ? (
          <section className="auth-confirmation" aria-live="polite">
            <h2 ref={confirmationHeadingRef} tabIndex={-1}>
              Check your email
            </h2>
            <p>
              We sent a confirmation link to <strong>{confirmationEmail}</strong>. Click the link to
              activate your account, then return here to sign in.
            </p>
            <div className="auth-actions">
              <button
                type="button"
                className="auth-submit"
                onClick={() => {
                  void handleResendConfirmation();
                }}
                disabled={isBusy}
                aria-busy={isBusy}
              >
                {isBusy ? 'Sending...' : 'Resend confirmation email'}
              </button>
              <Link to="/login" className="auth-footer__link">
                Back to sign in
              </Link>
              <button
                type="button"
                className="auth-footer__link auth-link-button"
                onClick={() => {
                  setConfirmationEmail(null);
                  setSubmitMessage(null);
                }}
              >
                Use a different email
              </button>
            </div>
          </section>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
              <PasswordInput
                ref={passwordInputRef}
                id={passwordId}
                className="auth-field__input"
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
              {password.length > 0 && <PasswordStrengthMeter password={password} />}
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
              <PasswordInput
                id={confirmPasswordId}
                className="auth-field__input"
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

            <p className="auth-legal-notice" id={legalNoticeId}>
              By creating an account you agree to our{' '}
              <a href="/legal/terms" className="auth-footer__link">
                Terms
              </a>{' '}
              and{' '}
              <a href="/legal/privacy" className="auth-footer__link">
                Privacy Policy
              </a>
              .
            </p>

            <button
              type="submit"
              className="auth-submit"
              disabled={isBusy}
              aria-busy={isBusy}
              aria-describedby={legalNoticeId}
            >
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
        )}

        {/* OAuth sign-up parity with Login (#3707) — rendered the same way
            Login renders its social section, and hidden once the confirmation
            panel takes over. */}
        {!confirmationEmail && (
          <OAuthButtons
            onSelect={(provider) => {
              void loginWithOAuth(provider);
            }}
            disabled={isBusy}
            verb="Sign up"
            groupLabel="Social signup options"
            dividerText="or sign up with"
          />
        )}

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-footer__link">
            Sign in
          </Link>
        </p>
        <footer className="auth-footer auth-footer--legal">
          <LegalLinks />
        </footer>
      </div>
    </main>
  );
};

export default SignupPage;
