// SPDX-License-Identifier: BUSL-1.1

/**
 * NotFoundPage — in-shell 404 empty state for unknown authenticated routes.
 *
 * Rendered by the `path="*"` catch-all INSIDE `AppLayout` (the sidebar + header
 * chrome stays visible). An unknown path is not in `STANDALONE_ROUTES`, so
 * `App` mounts the authenticated branch and this component lands inside
 * `AppLayout`'s `<main id="main-content">`.
 *
 * It therefore must NOT render its own `<main>` landmark or the pre-auth
 * `auth-card` chrome — doing so produced nested `<main>` landmarks (a WCAG
 * landmark violation) and a centred login-style card floating in the middle of
 * the authenticated shell (#3626). Instead it is a shell-native empty state: a
 * single labelled region with a heading, explanation, a primary "Go to
 * Dashboard" link and a history-aware "Go back" action.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
 * In-shell 404 Not Found empty state.
 *
 * Provides accessible recovery options so keyboard and screen-reader users are
 * never stranded on an unknown URL: a history-aware "Go back" action and a link
 * to the dashboard. It renders a single `<section>` region (labelled by its
 * heading) rather than a `<main>`, so the only top-level landmark on the page
 * remains `AppLayout`'s main content region.
 */
export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="not-found__icon">
        <NotFoundIcon />
      </div>

      <h1 id="not-found-title" className="not-found__title">
        404: Page Not Found
      </h1>
      <p className="not-found__message">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <nav aria-label="Return navigation" className="not-found__actions">
        <Link to="/dashboard" className="not-found__primary">
          Go to Dashboard
        </Link>
        <button type="button" className="not-found__back" onClick={() => navigate(-1)}>
          Go back
        </button>
      </nav>
    </section>
  );
};

export default NotFoundPage;
