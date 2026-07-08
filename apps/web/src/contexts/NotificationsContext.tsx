// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared notification store context.
 *
 * The notification quick-view popover (in the header/sidebar) and the full
 * `/notifications` page must operate on the same notification state so that
 * marking read, dismissing, or clearing in one place is reflected everywhere
 * (including the unread badge). `useNotifications` keeps its state in a
 * component-local `useState`, so calling it in two places would create two
 * diverging stores. This provider owns a single `useNotifications` instance
 * and shares it via context.
 *
 * The reactive alert-injection effects (scam checks, warranty reminders) live
 * in `components/notifications/NotificationInjectors` — deliberately outside
 * this module so their heavier libraries are not hoisted into the shared,
 * budget-constrained `vendor-app` chunk (#3478/#2983).
 *
 * @module contexts/NotificationsContext
 * References: #3539
 */

import { createContext, useContext, type FC, type ReactNode } from 'react';

import { useNotifications, type UseNotificationsResult } from '../hooks/useNotifications';

const NotificationsContext = createContext<UseNotificationsResult | null>(null);

/** Props for {@link NotificationsProvider}. */
export interface NotificationsProviderProps {
  readonly children: ReactNode;
}

/**
 * Provides a single shared notification store to the component tree. Render
 * `NotificationInjectors` inside this provider to feed the store with
 * reactively-derived alerts.
 */
export const NotificationsProvider: FC<NotificationsProviderProps> = ({ children }) => {
  const store = useNotifications();

  return <NotificationsContext.Provider value={store}>{children}</NotificationsContext.Provider>;
};

/**
 * Access the shared notification store.
 *
 * @throws if used outside a {@link NotificationsProvider}.
 */
export function useNotificationCenter(): UseNotificationsResult {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationCenter must be used within a <NotificationsProvider>.');
  }
  return ctx;
}
