// SPDX-License-Identifier: BUSL-1.1

/**
 * Minimalist mode (#2122): React context exposing the user's hidden module ids.
 *
 * This file is intentionally dependency-light — it imports only `createContext`
 * and `useContext` from React and holds no reference to the richer
 * `lib/ux/module-visibility` catalogue or its reading machinery. Consumers in
 * performance-budgeted eager chunks (e.g. the dashboard route) can therefore
 * read the hidden set through {@link useHiddenModuleIds} without pulling the
 * module catalogue or the `useHiddenModules` storage hook into their bundle.
 *
 * The matching provider lives in the layout chunk (see
 * `components/layout/AppLayout`), where the `useHiddenModules` hook is already
 * present for the navigation chrome.
 */

import { createContext, useContext } from 'react';

/**
 * Holds the current set of hidden module ids. Defaults to an empty set so
 * consumers render every module when no provider is mounted (e.g. in isolated
 * tests) — failing open keeps every area reachable.
 */
export const HiddenModulesContext = createContext<ReadonlySet<string>>(new Set());

/** Read the user's hidden module ids from the nearest provider. */
export function useHiddenModuleIds(): ReadonlySet<string> {
  return useContext(HiddenModulesContext);
}
