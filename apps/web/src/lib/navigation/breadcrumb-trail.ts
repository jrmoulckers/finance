// SPDX-License-Identifier: BUSL-1.1

/**
 * Hierarchical breadcrumb trail builder (#3667).
 *
 * The app previously shipped two competing breadcrumb systems: a
 * navigation-*history* trail in the shell header (`Breadcrumbs`, "Recent
 * navigation") and a *hierarchical* trail inside detail pages (`Breadcrumb`,
 * "Breadcrumb"). On a detail page both rendered at once — two `.breadcrumb`
 * landmarks with conflicting `aria-label`s and semantics, which is confusing
 * for screen-reader users and violates the conventional meaning of
 * breadcrumbs (structural hierarchy, not history).
 *
 * Decision: the shell presents a single, **hierarchical** breadcrumb derived
 * from the route table (this module). The in-page hierarchical `Breadcrumb`
 * duplication has been removed from detail pages, and the recent-navigation
 * affordance is no longer styled as breadcrumbs. Because the shell has no
 * access to a record's display name, a detail crumb shows the record's type
 * (e.g. `Accounts › Account`); the dynamic name is surfaced in the page's own
 * `<h1>` heading immediately below.
 */

import { ROUTE_TITLE_IDS, resolvePageLabel } from '../i18n/page-title';
import { DETAIL_ROUTES } from './detail-routes';

export interface BreadcrumbCrumb {
  /** Localised label for the crumb. */
  label: string;
  /** Route to link to; omitted for the current (last) crumb. */
  href?: string;
}

/** True when `pathname` has an exact entry in the route-title table. */
function isKnownRoute(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTE_TITLE_IDS, pathname);
}

/**
 * Build a hierarchical breadcrumb trail for a pathname.
 *
 * - Top-level routes (`/accounts`, `/dashboard`) yield a single crumb — callers
 *   should not render a trail for these (the header `<h1>` already names them).
 * - Nested routes (`/settings/preferences`, `/investments/tax`) yield the chain
 *   of known ancestor routes plus the current page.
 * - Detail routes (`/accounts/:id`) yield the parent list (linked) plus a
 *   type label for the record (`Account`).
 *
 * Returns an empty array for unknown routes.
 */
export function buildBreadcrumbTrail(pathname: string, locale?: string): BreadcrumbCrumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return [];
  }

  const crumbs: BreadcrumbCrumb[] = [];
  let accumulated = '';

  for (let index = 0; index < segments.length; index += 1) {
    accumulated += `/${segments[index]}`;
    const isLast = index === segments.length - 1;

    if (isKnownRoute(accumulated)) {
      const label = resolvePageLabel(accumulated, locale);
      if (label) {
        crumbs.push({ label, href: isLast ? undefined : accumulated });
      }
      continue;
    }

    // Unknown final segment on a recognised list route → a record detail page.
    if (isLast) {
      const detail = DETAIL_ROUTES[segments[0]];
      if (detail) {
        crumbs.push({ label: detail.detailLabel });
      }
    }
  }

  return crumbs;
}
