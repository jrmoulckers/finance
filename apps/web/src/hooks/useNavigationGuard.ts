// SPDX-License-Identifier: BUSL-1.1

import { useContext, useEffect, useId, useMemo } from 'react';

import { NavigationGuardContext } from '../components/navigation/NavigationGuard';
import { DEFAULT_UNSAVED_CHANGES_MESSAGE } from '../lib/navigation/guardrails';
import type { UseNavigationGuardOptions } from '../lib/navigation/types';

export interface UseNavigationGuardResult {
  confirmNavigation: () => boolean;
  hasUnsavedChanges: boolean;
}

export function useNavigationGuard({
  when,
  message = DEFAULT_UNSAVED_CHANGES_MESSAGE,
}: UseNavigationGuardOptions): UseNavigationGuardResult {
  const guardId = useId();
  const context = useContext(NavigationGuardContext);

  useEffect(() => {
    context?.setGuard({
      id: guardId,
      when,
      message,
    });

    return () => {
      context?.removeGuard(guardId);
    };
  }, [context, guardId, message, when]);

  return useMemo(
    () => ({
      confirmNavigation: () => {
        if (!when) {
          return true;
        }

        return context?.confirmActiveNavigation(message) ?? window.confirm(message);
      },
      hasUnsavedChanges: when,
    }),
    [context, message, when],
  );
}
