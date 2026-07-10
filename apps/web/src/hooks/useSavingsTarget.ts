// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook exposing the user's chosen savings-rate TARGET as a shared,
 * reactive preference.
 *
 * Mirrors the event-based pattern used by `useDisplayCurrency`: state is backed
 * by `localStorage` and synchronised across components via a same-tab custom
 * event plus the cross-tab `storage` event — so changing the goal on the
 * dashboard card propagates to insights and suggestions without a page reload
 * and without a mandatory context provider.
 *
 * References: issue #3327
 */

import { useCallback, useEffect, useState } from 'react';

import {
  MAX_SAVINGS_TARGET_PERCENT,
  MIN_SAVINGS_TARGET_PERCENT,
  SAVINGS_TARGET_CHANGE_EVENT,
  getStoredSavingsTargetPercent,
  setStoredSavingsTargetPercent,
} from '../lib/savings-target';

/** Return shape of {@link useSavingsTarget}. */
export interface UseSavingsTargetResult {
  /** The savings-rate target (%) every savings surface compares against. */
  readonly savingsTargetPercent: number;
  /** Persist a new target; propagates to every consumer. */
  readonly setSavingsTargetPercent: (value: number) => void;
  /** Lowest selectable target (%). */
  readonly minPercent: number;
  /** Highest selectable target (%). */
  readonly maxPercent: number;
}

/**
 * Access the shared savings-rate target preference.
 *
 * Reads the persisted value on mount and re-renders whenever the preference
 * changes — whether from this component, another component in the same tab, or
 * another browser tab.
 */
export function useSavingsTarget(): UseSavingsTargetResult {
  const [savingsTargetPercent, setSavingsTargetState] = useState<number>(
    getStoredSavingsTargetPercent,
  );

  useEffect(() => {
    const refresh = (): void => {
      setSavingsTargetState(getStoredSavingsTargetPercent());
    };

    refresh();
    globalThis.addEventListener?.(SAVINGS_TARGET_CHANGE_EVENT, refresh);
    globalThis.addEventListener?.('storage', refresh);
    return () => {
      globalThis.removeEventListener?.(SAVINGS_TARGET_CHANGE_EVENT, refresh);
      globalThis.removeEventListener?.('storage', refresh);
    };
  }, []);

  const setSavingsTargetPercent = useCallback((value: number) => {
    setSavingsTargetState(setStoredSavingsTargetPercent(value));
  }, []);

  return {
    savingsTargetPercent,
    setSavingsTargetPercent,
    minPercent: MIN_SAVINGS_TARGET_PERCENT,
    maxPercent: MAX_SAVINGS_TARGET_PERCENT,
  };
}
