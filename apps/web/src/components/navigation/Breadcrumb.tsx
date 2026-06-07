// SPDX-License-Identifier: BUSL-1.1

/**
 * Breadcrumb — Navigation trail for detail pages.
 *
 * Renders a breadcrumb trail showing the parent page and current page.
 * On narrow screens, hides the current page title segment to avoid
 * duplication with the page heading rendered below.
 *
 * Also fixes #1505: ensures account detail pages link back to /accounts
 * instead of /transactions.
 *
 * @module components/navigation/Breadcrumb
 * References: issues #1453, #1505
 */

import type { FC } from 'react';
import { Link } from 'react-router-dom';

export interface BreadcrumbSegment {
  /** Display label for the breadcrumb segment. */
  label: string;
  /** Route path for the segment. If omitted, rendered as plain text (current page). */
  href?: string;
}

export interface BreadcrumbProps {
  /** Ordered list of breadcrumb segments from root to current page. */
  segments: BreadcrumbSegment[];
  /** Accessible label for the breadcrumb nav element. */
  ariaLabel?: string;
}

/**
 * Accessible breadcrumb navigation component.
 *
 * The last segment (current page) is rendered as plain text and hidden
 * on mobile via the `breadcrumb__current` class to prevent duplication
 * with page headings.
 */
export const Breadcrumb: FC<BreadcrumbProps> = ({ segments, ariaLabel = 'Breadcrumb' }) => {
  if (segments.length === 0) return null;

  const parentSegments = segments.slice(0, -1);
  const currentSegment = segments[segments.length - 1];

  return (
    <nav className="breadcrumb" aria-label={ariaLabel}>
      <ol className="breadcrumb__list">
        {parentSegments.map((segment) => (
          <li key={segment.href ?? segment.label} className="breadcrumb__item">
            {segment.href ? (
              <Link to={segment.href} className="breadcrumb__link">
                {segment.label}
              </Link>
            ) : (
              <span>{segment.label}</span>
            )}
            <span className="breadcrumb__separator" aria-hidden="true">
              ›
            </span>
          </li>
        ))}
        {currentSegment && (
          <li className="breadcrumb__item breadcrumb__item--current" aria-current="page">
            <span className="breadcrumb__current">{currentSegment.label}</span>
          </li>
        )}
      </ol>
    </nav>
  );
};
