// SPDX-License-Identifier: BUSL-1.1

/**
 * Detail / nested route metadata shared by the shell.
 *
 * A "detail route" is a top-level list destination followed by a single dynamic
 * id segment, e.g. `/accounts/:id` or `/transactions/:id`. The shell uses this
 * to:
 *   - render a visible Back affordance in the header that returns to the parent
 *     list (#3674), complementing the keyboard-only `useEscapeBack`; and
 *   - build a hierarchical breadcrumb trail (`Accounts › Account`, #3667).
 *
 * Keep this list in sync with the detail routes declared in `routes.tsx` and
 * the Escape-back pattern in `hooks/useEscapeBack.ts`.
 */

export interface DetailRouteConfig {
  /** The parent list route a Back action should return to. */
  parentPath: string;
  /** Localised-agnostic label for the parent list (matches nav labels). */
  parentLabel: string;
  /** Singular label for the current detail record, used in breadcrumbs. */
  detailLabel: string;
  /**
   * Static (non-id) child segments that live under the same parent but are NOT
   * `/:id` detail records, e.g. `/investments/tax` or `/bills/new`. These must
   * be excluded so the Back affordance and breadcrumbs don't mislabel them.
   */
  staticChildren?: readonly string[];
}

/** Keyed by the first path segment (without the leading slash). */
export const DETAIL_ROUTES: Readonly<Record<string, DetailRouteConfig>> = Object.freeze({
  accounts: { parentPath: '/accounts', parentLabel: 'Accounts', detailLabel: 'Account' },
  transactions: {
    parentPath: '/transactions',
    parentLabel: 'Transactions',
    detailLabel: 'Transaction',
  },
  budgets: { parentPath: '/budgets', parentLabel: 'Budgets', detailLabel: 'Budget' },
  goals: { parentPath: '/goals', parentLabel: 'Goals', detailLabel: 'Goal' },
  investments: {
    parentPath: '/investments',
    parentLabel: 'Investments',
    detailLabel: 'Investment',
    staticChildren: ['tax'],
  },
  bills: {
    parentPath: '/bills',
    parentLabel: 'Bills',
    detailLabel: 'Bill',
    staticChildren: ['new'],
  },
});

/** Matches `/segment/<id>` exactly (no further nested segments). */
const DETAIL_ROUTE_PATTERN = /^\/([^/]+)\/([^/]+)$/;

/**
 * Returns the detail-route config for a pathname, or `null` when the path is
 * not a recognised `/list/:id` detail route.
 */
export function getDetailRoute(pathname: string): DetailRouteConfig | null {
  const match = DETAIL_ROUTE_PATTERN.exec(pathname);
  if (!match) {
    return null;
  }
  const [, segment, child] = match;
  const config = DETAIL_ROUTES[segment];
  if (!config) {
    return null;
  }
  if (config.staticChildren?.includes(child)) {
    return null;
  }
  return config;
}

/** True when `pathname` is a recognised detail route. */
export function isDetailRoute(pathname: string): boolean {
  return getDetailRoute(pathname) !== null;
}

/**
 * The parent list path a Back affordance should navigate to for a detail
 * route, or `null` when the route is not a detail route.
 */
export function getDetailRouteParent(pathname: string): string | null {
  return getDetailRoute(pathname)?.parentPath ?? null;
}
