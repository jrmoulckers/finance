// SPDX-License-Identifier: BUSL-1.1

import React, { useId, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { resetPassword } from '../lib/auth/password-reset';
import { passwordSchema } from '../lib/validation';

import '../styles/auth.css';

interface ResetFieldErrors {
  password?: string;
  confirmPassword?: string;
}

/** Completes Supabase's recovery-token password reset flow. */
export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const uid = useId();

  const passwordId = `${uid}-password`;
  const confirmPasswordId = `${uid}-confirm-password`;
  const passwordErrorId = `${uid}-password-error`;
  const confirmPasswordErrorId = `${uid}-confirm-password-error`;

  const recoveryParams = useMemo(
    () => readRecoveryParams(location.search, location.hash),
    [location.hash, location.search],
  );
  const accessToken = recoveryParams.get('access_token');
  const recoveryError = recoveryParams.get('error_description') ?? recoveryParams.get('error');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ResetFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: ResetFieldErrors = {};
    const passwordResult = passwordSchema.safeParse(password);

    if (!passwordResult.success) {
      errors.password = 'Password must be at least 12 characters.';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!accessToken) {
      setSubmitError('Reset link is invalid or expired. Request a new password reset link.');
      return;
    }

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(accessToken, password);
      navigate('/login', {
        replace: true,
        state: { message: 'Password updated. Sign in with your new password.' },
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const linkError = recoveryError
    ? recoveryError
    : !accessToken
      ? 'Reset link is invalid or expired. Request a new password reset link.'
      : null;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby={`${uid}-title`}>
        <header className="auth-brand">
          <h1 id={`${uid}-title`} className="auth-brand__name">
            Finance
          </h1>
          <p className="auth-brand__tagline">Choose a new password</p>
        </header>

        {linkError && (
          <div className="auth-error" role="alert" aria-live="polite">
            {linkError}
          </div>
        )}

        {submitError && !linkError && (
          <div className="auth-error" role="alert" aria-live="polite">
            {submitError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-field__label" htmlFor={passwordId}>
              New password
            </label>
            <input
              id={passwordId}
              className="auth-field__input"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              disabled={isSubmitting || Boolean(linkError)}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
            />
            <p className="auth-field__hint">Must be at least 12 characters</p>
            {fieldErrors.password && (
              <p id={passwordErrorId} className="auth-field__error" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor={confirmPasswordId}>
              Confirm new password
            </label>
            <input
              id={confirmPasswordId}
              className="auth-field__input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
              }}
              disabled={isSubmitting || Boolean(linkError)}
              aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
              aria-describedby={fieldErrors.confirmPassword ? confirmPasswordErrorId : undefined}
            />
            {fieldErrors.confirmPassword && (
              <p id={confirmPasswordErrorId} className="auth-field__error" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={isSubmitting || Boolean(linkError)}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size={20} label="Updating password" />
                <span>Updating...</span>
              </>
            ) : (
              'Update password'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Need a new link?{' '}
          <Link to="/forgot-password" className="auth-footer__link">
            Request password reset
          </Link>
        </p>
      </section>
    </main>
  );
};

function readRecoveryParams(search: string, hash: string): URLSearchParams {
  const params = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

  for (const [key, value] of hashParams.entries()) {
    params.set(key, value);
  }

  return params;
}

export default ResetPasswordPage;
