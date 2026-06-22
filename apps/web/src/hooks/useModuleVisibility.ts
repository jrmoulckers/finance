// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the minimalist-mode module visibility preference (#2122).
 *
 * Wraps the pure {@link module-visibility} model so the nav chrome, dashboard
 * quick-access cards, and the settings control all read the same persisted set
 * of hidden module ids and stay in sync — across tabs (native `storage` event)
 * and within the same tab ({@link MODULE_VISIBILITY_CHANGE_EVENT}).
 *
 * @module hooks/useModuleVisibility
 * References: issue #2122
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  HIDEABLE_MODULES,
  MODULE_VISIBILITY_CHANGE_EVENT,
  MODULE_VISIBILITY_STORAGE_KEY,
  countHiddenModules,
  getStoredHiddenModuleIds,
  isModuleVisible,
  persistHiddenModuleIds,
  setModuleHidden,
  type HideableModule,
} from '../lib/ux/module-visibility';

/**
 * Subscribe to the persisted set of hidden module ids.
 *
 * Returns a stable, read-only set that updates when the preference changes in
 * this tab or another tab. Lightweight by design so it can be consumed from the
 * eagerly-loaded nav chrome without pulling in the full settings controller.
 */
export function useHiddenModules(): ReadonlySet<string> {
  const [hiddenModuleIds, setHiddenModuleIds] =
    useState<ReadonlySet<string>>(getStoredHiddenModuleIds);

  useEffect(() => {
    const refresh = (): void => {
      setHiddenModuleIds(getStoredHiddenModuleIds());
    };
    const handleStorage = (event: StorageEvent): void => {
      if (event.key === MODULE_VISIBILITY_STORAGE_KEY) {
        refresh();
      }
    };

    window.addEventListener(MODULE_VISIBILITY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(MODULE_VISIBILITY_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return hiddenModuleIds;
}

/** Controller returned by {@link useModuleVisibility}. */
export interface UseModuleVisibilityResult {
  /** The catalogue of modules a user may hide. */
  modules: readonly HideableModule[];
  /** Currently hidden module ids. */
  hiddenModuleIds: ReadonlySet<string>;
  /** Number of modules currently hidden. */
  hiddenCount: number;
  /** Whether any module is currently hidden. */
  hasHiddenModules: boolean;
  /** Whether a given module id is currently hidden. */
  isHidden: (id: string) => boolean;
  /** Whether a given module id is currently visible. */
  isVisible: (id: string) => boolean;
  /** Persist a module as hidden or visible. */
  setHidden: (id: string, hidden: boolean) => void;
  /** Toggle a module's hidden state. */
  toggle: (id: string) => void;
  /** Reveal every module (clear the hidden set). */
  showAll: () => void;
}

/**
 * Full controller for the minimalist-mode settings UI. Reads always go through
 * {@link getStoredHiddenModuleIds} at mutation time to avoid stale closures, and
 * writes go through {@link persistHiddenModuleIds}, which both persists and
 * notifies same-tab subscribers.
 */
export function useModuleVisibility(): UseModuleVisibilityResult {
  const hiddenModuleIds = useHiddenModules();

  const setHidden = useCallback((id: string, hidden: boolean) => {
    persistHiddenModuleIds(setModuleHidden(getStoredHiddenModuleIds(), id, hidden));
  }, []);

  const toggle = useCallback((id: string) => {
    const current = getStoredHiddenModuleIds();
    persistHiddenModuleIds(setModuleHidden(current, id, !current.has(id)));
  }, []);

  const showAll = useCallback(() => {
    persistHiddenModuleIds(new Set());
  }, []);

  return useMemo(
    () => ({
      modules: HIDEABLE_MODULES,
      hiddenModuleIds,
      hiddenCount: countHiddenModules(hiddenModuleIds),
      hasHiddenModules: countHiddenModules(hiddenModuleIds) > 0,
      isHidden: (id: string) => hiddenModuleIds.has(id),
      isVisible: (id: string) => isModuleVisible(id, hiddenModuleIds),
      setHidden,
      toggle,
      showAll,
    }),
    [hiddenModuleIds, setHidden, toggle, showAll],
  );
}
