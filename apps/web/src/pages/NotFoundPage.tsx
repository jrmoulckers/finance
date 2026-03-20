// SPDX-License-Identifier: BUSL-1.1

/**
 * NotFoundPage — standalone 404 page for the Finance PWA.
 *
 * Rendered outside of `AppLayout` by the catch-all route (`path="*"`).
 * Reuses the shared auth-card centred layout from `auth.css` so the
 * visual style is consistent with the Login and Signup pages.
 */

import React from 'react';
import { Link } from 'react-router-dom';

import '../styles/auth.css';

/**
 * Standalone 404 Not Found page.
 *
 * Provides accessible navigation back to the main app or sign-in page
 * so keyboard and screen-reader users are never stranded on an unknown URL.
 */
export const NotFoundPage: React.FC = () => (
  <main className="auth-page">
    <section className="auth-card" aria-labelledby="not-found-title">
      <header className="auth-brand">
        <h1 id="not-found-title" className="auth-brand__name">
          404 — Page Not Found
        </h1>
        <p className="auth-brand__tagline">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </header>

      <nav aria-label="Return navigation" className="auth-actions">
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

export default NotFoundPage;
