// SPDX-License-Identifier: BUSL-1.1

import type { FC, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

export interface AppBrowserRouterProps {
  /** Application routes / tree to render inside the router. */
  children: ReactNode;
  /** Router basename (defaults to the Vite `BASE_URL`). */
  basename?: string;
}

/**
 * Application router wrapper.
 *
 * Wraps {@link BrowserRouter} with `useTransitions={false}` so that navigations
 * are committed as **urgent** updates rather than being wrapped in
 * `React.startTransition`.
 *
 * ## Why `useTransitions={false}` (#3551)
 *
 * `react-router-dom` v7's `<BrowserRouter>` wraps every location/router-state
 * update in `React.startTransition` by default (the library's own docs note the
 * default "can lead to buggy behaviors"). Every route in `routes.tsx` is a
 * `lazy()` page wrapped in a shared `RouteBoundary` → `<Suspense>` with the
 * `PageLoader` fallback.
 *
 * When a tab is clicked, the URL updates synchronously via `history.pushState`,
 * but the router state change runs inside a transition. React reconciles the
 * reused `<Suspense>` boundary, the incoming lazy page suspends, and — because
 * it is a transition — React keeps the **previously committed page content on
 * screen (stale)** instead of revealing the fallback. The result was the
 * reported bug: the URL and active-nav indicator move to the new tab while the
 * main content stays on the old page ("switching tabs almost always fails").
 *
 * Disabling transitions makes each navigation an urgent update: the reused
 * `<Suspense>` immediately shows its `PageLoader` and then commits the new page,
 * which matches this app's per-route loader design. The app surfaces loading
 * through those Suspense fallbacks, not through transition/`isPending` UI, so it
 * gains nothing from the default transition wrapping and only suffered its
 * stale-content failure mode.
 */
export const AppBrowserRouter: FC<AppBrowserRouterProps> = ({ children, basename }) => (
  <BrowserRouter basename={basename} useTransitions={false}>
    {children}
  </BrowserRouter>
);

export default AppBrowserRouter;
