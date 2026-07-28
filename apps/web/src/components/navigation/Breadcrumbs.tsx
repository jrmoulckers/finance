// SPDX-License-Identifier: BUSL-1.1

/**
 * Breadcrumbs — the shell's single, hierarchical breadcrumb trail (#3667).
 *
 * Historically this component rendered a navigation *history* trail ("Recent
 * navigation"), while detail pages rendered a separate *hierarchical* trail —
 * two `.breadcrumb` landmarks with conflicting semantics on the same page.
 * Breadcrumbs conventionally communicate structural hierarchy, not history, so
 * this component now derives a hierarchical trail from the route table via
 * {@link buildBreadcrumbTrail}; the in-page hierarchical `Breadcrumb` has been
 * removed from detail pages. Recent-navigation recording lives in the shell
 * (`AppLayout`) so palette recents and muscle-memory hints keep working without
 * masquerading as breadcrumbs.
 *
 * Top-level routes yield a single crumb, for which no trail is rendered (the
 * header `<h1>` already names the page).
 */

import { useMemo, type FC } from 'react';
import { Link } from 'react-router';

import { buildBreadcrumbTrail } from '../../lib/navigation/breadcrumb-trail';
import './breadcrumb.css';

export interface BreadcrumbsProps {
  currentPath: string;
  /** Retained for API compatibility; the label now comes from the route table. */
  currentTitle?: string;
  maxItems?: number;
}

export const Breadcrumbs: FC<BreadcrumbsProps> = ({ currentPath, maxItems }) => {
  const crumbs = useMemo(() => {
    const trail = buildBreadcrumbTrail(currentPath);
    if (maxItems && maxItems > 0 && trail.length > maxItems) {
      return trail.slice(trail.length - maxItems);
    }
    return trail;
  }, [currentPath, maxItems]);

  // A single crumb (a top-level route) needs no trail; the header <h1> names it.
  if (crumbs.length <= 1) {
    return null;
  }

  const parentCrumbs = crumbs.slice(0, -1);
  const currentCrumb = crumbs[crumbs.length - 1];

  return (
    <nav className="breadcrumb breadcrumb--hierarchy" aria-label="Breadcrumb">
      <ol className="breadcrumb__list">
        {parentCrumbs.map((crumb) => (
          <li key={crumb.href ?? crumb.label} className="breadcrumb__item">
            {crumb.href ? (
              <Link to={crumb.href} className="breadcrumb__link">
                {crumb.label}
              </Link>
            ) : (
              <span>{crumb.label}</span>
            )}
            <span className="breadcrumb__separator" aria-hidden="true">
              ›
            </span>
          </li>
        ))}
        <li className="breadcrumb__item breadcrumb__item--current" aria-current="page">
          <span className="breadcrumb__current">{currentCrumb.label}</span>
        </li>
      </ol>
    </nav>
  );
};
