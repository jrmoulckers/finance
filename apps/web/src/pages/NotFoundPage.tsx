// SPDX-License-Identifier: BUSL-1.1

/**
 * NotFoundPage — standalone 404 page for the Finance PWA.
 *
 * Rendered outside of `AppLayout` by the catch-all route (`path="*"`).
 * Reuses the shared auth-card centred layout from `auth.css` so the
 * visual style is consistent with the Login and Signup pages.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import '../styles/auth.css';
import '../styles/not-found.css';

/** Decorative "lost page" glyph: a signpost/compass mark. */
const NotFoundIcon: React.FC = () => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="2" />
    <path
      d="M40 24 26 30l-2 10 14-6 2-10Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="32" cy="32" r="2.5" fill="currentColor" />
  </svg>
);

/**
 * Standalone 404 Not Found page.
 *
 * Provides accessible recovery options so keyboard and screen-reader users are
 * never stranded on an unknown URL: a history-aware "Go back" action, a link to
 * the dashboard, and a link to sign in.
 */
export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <main className="auth-page">
      <section className="auth-card not-found" aria-labelledby="not-found-title">
        <div className="not-found__icon">
          <NotFoundIcon />
        </div>

        <header className="auth-brand">
          <h1 id="not-found-title" className="auth-brand__name">
            404: Page Not Found
          </h1>
          <p className="auth-brand__tagline">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </header>

        <nav aria-label="Return navigation" className="auth-actions">
          <button type="button" className="not-found__back" onClick={() => navigate(-1)}>
            Go back
          </button>
          <Link to="/dashboard" className="auth-submit">
            Go to Dashboard
          </Link>
        </nav>

        <p className="auth-footer">
          <Link to="/login" className="auth-footer__link">
            Go to Login
          </Link>
        </p>
      </section>
    </main>
  );
};

export default NotFoundPage;
