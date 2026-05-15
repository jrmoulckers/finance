// SPDX-License-Identifier: BUSL-1.1

/**
 * NotFound — Accessible 404 page component.
 *
 * Displays a user-friendly "not found" message with a link to navigate home.
 * Uses semantic HTML, proper heading hierarchy, and focus management for
 * screen readers.
 *
 * @module components/errors/NotFound
 * References: issue #1337
 */

import React, { useEffect, useRef } from 'react';

import './not-found.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotFoundProps {
  /** Custom title. Defaults to "Page not found". */
  title?: string;

  /** Custom description text. */
  description?: string;

  /** Label for the home link. Defaults to "Go to Dashboard". */
  homeLinkLabel?: string;

  /** Target route for the home link. Defaults to "/". */
  homeHref?: string;

  /** Callback when the home link is clicked (for SPA routing). */
  onGoHome?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible 404 not-found page.
 *
 * On mount, the heading is focused so screen readers announce the page change.
 */
export const NotFound: React.FC<NotFoundProps> = ({
  title = 'Page not found',
  description = 'The page you are looking for does not exist or has been moved.',
  homeLinkLabel = 'Go to Dashboard',
  homeHref = '/',
  onGoHome,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus the heading on mount for screen reader announcement
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (onGoHome) {
      e.preventDefault();
      onGoHome();
    }
  };

  return (
    <main className="not-found" role="main">
      <p className="not-found__status" aria-hidden="true">
        404
      </p>
      <h1 ref={headingRef} className="not-found__title" tabIndex={-1}>
        {title}
      </h1>
      <p className="not-found__description">{description}</p>
      <div className="not-found__action">
        <a href={homeHref} className="not-found__link" onClick={handleClick}>
          {homeLinkLabel}
        </a>
      </div>
    </main>
  );
};
