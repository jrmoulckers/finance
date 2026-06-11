// SPDX-License-Identifier: BUSL-1.1

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_UNSAVED_CHANGES_MESSAGE,
  EXIT_APP_CONFIRMATION_MESSAGE,
  getActiveGuardMessage,
} from '../../lib/navigation/guardrails';
import type {
  NavigationGuardContextValue,
  NavigationGuardRegistration,
} from '../../lib/navigation/types';

const EXIT_ANCHOR_KEY = '__financeExitAnchor';
const EXIT_SENTINEL_KEY = '__financeExitSentinel';

export const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export interface NavigationGuardProps {
  children: ReactNode;
}

export function NavigationGuard({ children }: NavigationGuardProps) {
  const guardsRef = useRef(new Map<string, NavigationGuardRegistration>());
  const [activeGuards, setActiveGuards] = useState<readonly NavigationGuardRegistration[]>([]);
  const allowExitRef = useRef(false);
  const activeGuardsRef = useRef(activeGuards);
  const confirmActiveNavigationRef = useRef<(fallbackMessage?: string) => boolean>(() => true);

  const syncGuards = useCallback(() => {
    setActiveGuards(Array.from(guardsRef.current.values()).filter((guard) => guard.when));
  }, []);

  const setGuard = useCallback(
    (guard: NavigationGuardRegistration) => {
      guardsRef.current.set(guard.id, guard);
      syncGuards();
    },
    [syncGuards],
  );

  const removeGuard = useCallback(
    (id: string) => {
      guardsRef.current.delete(id);
      syncGuards();
    },
    [syncGuards],
  );

  const confirmActiveNavigation = useCallback(
    (fallbackMessage = DEFAULT_UNSAVED_CHANGES_MESSAGE) =>
      window.confirm(getActiveGuardMessage(activeGuards, fallbackMessage)),
    [activeGuards],
  );

  useEffect(() => {
    activeGuardsRef.current = activeGuards;
    confirmActiveNavigationRef.current = confirmActiveNavigation;
  }, [activeGuards, confirmActiveNavigation]);

  useEffect(() => {
    if (activeGuards.length === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = getActiveGuardMessage(activeGuards);
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeGuards]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const currentState = (window.history.state ?? {}) as Record<string, unknown>;
    if (!currentState[EXIT_ANCHOR_KEY] && !currentState[EXIT_SENTINEL_KEY]) {
      window.history.replaceState(
        { ...currentState, [EXIT_ANCHOR_KEY]: true },
        '',
        window.location.href,
      );
      window.history.pushState(
        { ...currentState, [EXIT_SENTINEL_KEY]: true },
        '',
        window.location.href,
      );
    }

    const resetAllowExit = () => {
      if (document.visibilityState === 'visible') {
        allowExitRef.current = false;
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state ?? {}) as Record<string, unknown>;
      if (!state[EXIT_ANCHOR_KEY] || allowExitRef.current) {
        return;
      }

      const hasActiveGuards = activeGuardsRef.current.length > 0;
      const confirmed = hasActiveGuards
        ? confirmActiveNavigationRef.current()
        : window.confirm(EXIT_APP_CONFIRMATION_MESSAGE);

      if (!confirmed) {
        window.history.forward();
        return;
      }

      allowExitRef.current = true;
      window.history.back();
      window.setTimeout(resetAllowExit, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const value = useMemo<NavigationGuardContextValue>(
    () => ({
      setGuard,
      removeGuard,
      hasActiveGuards: activeGuards.length > 0,
      confirmActiveNavigation,
    }),
    [activeGuards.length, confirmActiveNavigation, removeGuard, setGuard],
  );

  return (
    <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>
  );
}
