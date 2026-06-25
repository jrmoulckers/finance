// SPDX-License-Identifier: BUSL-1.1

/**
 * Pre-authentication route definitions — single source of truth for which
 * routes are reachable WITHOUT an authenticated session.
 *
 * Two related-but-distinct concepts live here and MUST be kept apart:
 *
 *  1. {@link PRE_AUTH_ROUTE_SET} — routes that render WITHOUT waiting for the
 *     SQLite-WASM database (they never call `useDatabase()`), used by the
 *     `DatabaseGate` in `main.tsx`. Matched EXACTLY, so nested paths like
 *     `/reset-password/<token>` still wait for the DB.
 *
 *  2. {@link isUnauthenticatedSafeRoute} — routes that the auth bootstrap's
 *     "session expired / not authenticated" handler must NOT hard-redirect away
 *     from. This is a SUPERSET of the pre-auth routes that ALSO includes the
 *     first-run {@link ONBOARDING_ROUTE} flow.
 *
 * Why `/onboarding` is special (#3059): `App.tsx` auto-launches unauthenticated
 * first-run visitors into `/onboarding` (it offers local-only mode or a path to
 * `/signup`). `/onboarding` DOES use the database (starter budgets), so it is
 * intentionally NOT a pre-auth/DB-skip route. But it must still be exempt from
 * the `onUnauthenticated` → `/login` hard-redirect, otherwise the auth layer and
 * `App.tsx` fight each other: `App.tsx` sends `/login` → `/onboarding`, the auth
 * layer sends `/onboarding` → `/login`, producing an infinite full-page reload
 * loop. Co-locating both lists here keeps that parity from drifting again.
 */

/**
 * Routes that render without waiting for the SQLite-WASM database.
 *
 * Pre-auth pages (login, signup, password reset, legal, beta) never touch the
 * database, so gating them behind the loading `DatabaseProvider` would block
 * rendering unnecessarily (and can time out on CI where OPFS + WASM init is
 * slow). Keep this list in sync with `App.tsx`'s `STANDALONE_ROUTES`.
 */
export const PRE_AUTH_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/legal',
  '/beta',
] as const;

/** Set form for O(1) EXACT-match lookups (used by the `DatabaseGate`). */
export const PRE_AUTH_ROUTE_SET: ReadonlySet<string> = new Set(PRE_AUTH_ROUTES);

/**
 * The first-run onboarding flow. Reachable by unauthenticated visitors, but —
 * unlike the pre-auth routes — it still uses the database, so it is tracked
 * separately from {@link PRE_AUTH_ROUTES} (it must keep the DB gate while still
 * being exempt from the forced-login redirect).
 */
export const ONBOARDING_ROUTE = '/onboarding';

/** Exact path match, or a `route + '/'` prefix match for nested paths. */
function matchesRouteOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * True when `pathname` is a route a logged-out user is allowed to sit on
 * WITHOUT being force-redirected to `/login`.
 *
 * Superset of {@link PRE_AUTH_ROUTES} plus the {@link ONBOARDING_ROUTE} first-run
 * flow. Matched by exact path OR `route + '/'` prefix, so nested paths such as
 * `/reset-password/<token>`, `/legal/privacy`, and `/onboarding/<step>` are all
 * covered while sibling routes that merely share a string prefix (e.g.
 * `/loginx`) are not.
 */
export function isUnauthenticatedSafeRoute(pathname: string): boolean {
  if (matchesRouteOrChild(pathname, ONBOARDING_ROUTE)) {
    return true;
  }

  return PRE_AUTH_ROUTES.some((route) => matchesRouteOrChild(pathname, route));
}
