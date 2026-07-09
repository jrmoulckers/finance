// SPDX-License-Identifier: BUSL-1.1

/**
 * NotFoundPage — 404 empty state for the Finance PWA.
 *
 * Rendered by the catch-all route (`path="*"`). Because unknown paths are not
 * in `STANDALONE_ROUTES`, this route renders *inside* `AppLayout` — i.e. within
 * the shell's `<main id="main-content">`, alongside the sidebar/bottom-nav and
 * header. It must therefore be shell-native content: it renders a `<section>`
 * (not a nested `<main>`, which would create duplicate landmarks) and avoids
 * the pre-auth `auth-card` chrome that used to make a 404 look like a broken
 * login screen inside the app. See #3626.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import '../styles/pages.css';

/**
 * 404 Not Found empty state.
 *
 * Keeps keyboard and screen-reader users oriented with a single heading, a
 * primary "Go to Dashboard" link, and a "Go back" affordance — without adding
 * a second `main` landmark to the app shell.
 */
export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="route-not-found" aria-labelledby="not-found-title">
      <p className="route-not-found__code" aria-hidden="true">
        404
      </p>
      <h1 id="not-found-title" className="route-not-found__title">
        Page not found
      </h1>
      <p className="route-not-found__message">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="route-not-found__actions">
        <Link to="/dashboard" className="route-not-found__action route-not-found__action--primary">
          Go to Dashboard
        </Link>
        <button type="button" className="route-not-found__action" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    </section>
  );
};

export default NotFoundPage;
