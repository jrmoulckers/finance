// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef, type FC } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { MilestoneToast } from './components/celebrations';
import { ConsentDialog } from './components/gdpr';
import { AppLayout } from './components/layout';
import { FocusManager } from './components/layout/FocusManager';
import { resolvePageLabel } from './lib/i18n/page-title';
import { PrivacyModeProvider } from './contexts/PrivacyModeContext';
import { NotificationsProvider, useNotificationCenter } from './contexts/NotificationsContext';
import { NotificationInjectors } from './components/notifications/NotificationInjectors';
import { SessionSecurityBoundary } from './components/SessionSecurityBoundary';
import { FeatureGateProvider } from './components/feature-gate';
import { useAuth } from './auth/auth-context';
import { useBudgets, useDocumentTitle, useHousehold } from './hooks';
import { useHaptics } from './hooks/useHaptics';
import { useMilestoneCheck } from './hooks/useMilestoneCheck';
import { useSpendingPace } from './hooks/useSpendingPace';
import type { HapticEventType } from './lib/haptics/types';
import { isOnboardingComplete } from './lib/local-only-mode';
import { isLighthouseAudit } from './lib/perf/lighthouse-audit';
import type { DetectedMilestone } from './lib/milestones';
import type { AppNotification } from './lib/notifications';
import { AppRoutes } from './routes';

/**
 * Brand fallback shown when a route has no entry in the page-title resolver.
 */
const BRAND_FALLBACK_TITLE = 'Finance';

/**
 * Routes that render WITHOUT the AppLayout shell (pre-auth + full-screen flows).
 *
 * This is an explicit denylist so that any newly added authenticated route gets
 * the nav shell by default — see #1977 for the regression that motivated the
 * inversion. If you add a new full-screen / pre-auth route, add it here.
 *
 * Matching is exact OR prefix (`prefix + '/'`), so `/reset-password/<token>`
 * also matches `/reset-password`.
 */
const STANDALONE_ROUTES: readonly string[] = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/legal',
  '/beta',
  '/onboarding',
  '/invite',
];

/*
 * Routes a visitor with incomplete onboarding is allowed to sit on WITHOUT being
 * auto-redirected into `/onboarding`.
 *
 * `/login` and `/signup` are exempt so the account path can defer onboarding until
 * AFTER signup (#3089): the onboarding "Create Account" choice navigates to `/signup`
 * without marking onboarding complete, so the visitor must be able to reach (and stay
 * on) the auth pages. Once authenticated, leaving an auth page for any other route
 * re-triggers the auto-launch, which resumes onboarding at the post-signup step.
 *
 * `/legal` is exempt (prefix match covers `/legal/privacy`, `/legal/terms`,
 * `/legal/ccpa`) so pre-onboarding visitors can read the legal documents linked from
 * the auth footers — bouncing them to `/onboarding` would be a compliance problem (#3110).
 *
 * The bare `/privacy`, `/terms`, and `/ccpa` aliases are also exempt: the GDPR consent
 * modal links to `/privacy`, and bouncing that link to onboarding blocked the privacy
 * notice during first run (#3119).
 */
const FIRST_RUN_ALLOWED_ROUTES: readonly string[] = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/legal',
  '/privacy',
  '/terms',
  '/ccpa',
  '/onboarding',
  '/invite',
];

function isStandalonePath(pathname: string): boolean {
  return STANDALONE_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isFirstRunAllowedPath(pathname: string): boolean {
  return FIRST_RUN_ALLOWED_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldAutoLaunchOnboarding(pathname: string, onboardingComplete: boolean): boolean {
  return !onboardingComplete && !isFirstRunAllowedPath(pathname);
}

/**
 * Resolve the shell header `<h1>` / breadcrumb label for a route.
 *
 * Derives the label from the single localized page-title source of truth
 * (`resolvePageLabel`, backed by `ROUTE_TITLE_IDS`) so the header title, the
 * breadcrumb, and the browser tab title can never drift apart and are all
 * localized consistently (#3616). Detail routes (`/accounts/:id`) inherit their
 * parent segment's label via the resolver; genuinely unknown routes fall back
 * to the product brand name.
 */
export function derivePageTitle(pathname: string): string {
  return resolvePageLabel(pathname) ?? BRAND_FALLBACK_TITLE;
}

function getBudgetThresholdHapticEvent(
  previousPercent: number,
  currentPercent: number,
): HapticEventType | null {
  if (previousPercent < 100 && currentPercent >= 100) {
    return 'budget_exceeded';
  }

  if (previousPercent < 90 && currentPercent >= 90) {
    return 'budget_critical';
  }

  if (previousPercent < 75 && currentPercent >= 75) {
    return 'budget_warning';
  }

  return null;
}

function getSpendingAlertHapticEvent(percentUsed: number): HapticEventType {
  if (percentUsed >= 100) {
    return 'budget_exceeded';
  }

  if (percentUsed >= 90) {
    return 'budget_critical';
  }

  return 'budget_warning';
}

function getMilestoneHapticEvent(milestone: DetectedMilestone): HapticEventType {
  return milestone.category === 'goal-progress' && milestone.badge === '100%'
    ? 'goal_reached'
    : 'savings_milestone';
}

function rankHapticEvent(eventType: HapticEventType): number {
  switch (eventType) {
    case 'budget_exceeded':
      return 3;
    case 'budget_critical':
    case 'goal_reached':
      return 2;
    case 'budget_warning':
    case 'savings_milestone':
      return 1;
  }
}

function selectMostUrgentEvent(
  current: HapticEventType | null,
  candidate: HapticEventType | null,
): HapticEventType | null {
  if (!candidate) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  return rankHapticEvent(candidate) > rankHapticEvent(current) ? candidate : current;
}

const BudgetHapticNotifier: FC = () => {
  const { budgets } = useBudgets();
  const { paces } = useSpendingPace(budgets);
  const { trigger } = useHaptics();
  const budgetPercentsRef = useRef<Map<string, number>>(new Map());
  const overspendingRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    let nextEvent: HapticEventType | null = null;
    const nextBudgetPercents = new Map<string, number>();

    for (const budget of budgets) {
      const currentPercent =
        budget.amount.amount > 0
          ? Math.round((budget.spentAmount.amount / budget.amount.amount) * 100)
          : 0;
      nextBudgetPercents.set(budget.id, currentPercent);

      const previousPercent = budgetPercentsRef.current.get(budget.id);
      if (previousPercent !== undefined) {
        nextEvent = selectMostUrgentEvent(
          nextEvent,
          getBudgetThresholdHapticEvent(previousPercent, currentPercent),
        );
      }
    }

    budgetPercentsRef.current = nextBudgetPercents;

    const nextOverspending = new Map<string, boolean>();
    for (const pace of paces) {
      nextOverspending.set(pace.budgetId, pace.willOverspend);

      const wasOverspending = overspendingRef.current.get(pace.budgetId);
      if (wasOverspending === false && pace.willOverspend) {
        nextEvent = selectMostUrgentEvent(nextEvent, getSpendingAlertHapticEvent(pace.percentUsed));
      }
    }

    overspendingRef.current = nextOverspending;

    if (nextEvent) {
      trigger(nextEvent);
    }
  }, [budgets, paces, trigger]);

  return null;
};

const MilestoneNotifier: FC = () => {
  const { activeMilestone, dismissMilestone } = useMilestoneCheck();
  const { trigger } = useHaptics();
  const lastMilestoneIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeMilestone || lastMilestoneIdRef.current === activeMilestone.id) {
      return;
    }

    lastMilestoneIdRef.current = activeMilestone.id;
    trigger(getMilestoneHapticEvent(activeMilestone));
  }, [activeMilestone, trigger]);

  if (!activeMilestone) {
    return null;
  }

  return <MilestoneToast milestone={activeMilestone} onDismiss={dismissMilestone} />;
};

const AuthenticatedShell: FC<{
  activePath: string;
  pageTitle: string;
}> = ({ activePath, pageTitle }) => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss } =
    useNotificationCenter();

  const handleNotificationAction = useCallback(
    (notification: AppNotification) => {
      if (notification.entityType === 'transaction' && notification.entityId) {
        navigate(`/transactions/${notification.entityId}`);
      }
    },
    [navigate],
  );

  return (
    <>
      <AppLayout
        activePath={activePath}
        onNavigate={(path) => navigate(path)}
        pageTitle={pageTitle}
        notifications={notifications}
        notificationUnreadCount={unreadCount}
        onMarkNotificationAsRead={markAsRead}
        onMarkAllNotificationsAsRead={markAllAsRead}
        onDismissNotification={dismiss}
        onNotificationAction={handleNotificationAction}
      >
        <SessionSecurityBoundary>
          <AppRoutes />
        </SessionSecurityBoundary>
      </AppLayout>
      <MilestoneNotifier />
    </>
  );
};

const EntitlementAwareAuthenticatedShell: FC<{
  activePath: string;
  pageTitle: string;
}> = (props) => {
  const { user, isAuthenticated } = useAuth();
  const { household, refresh: refreshHousehold } = useHousehold();

  useEffect(() => {
    const refreshScope = () => refreshHousehold();
    window.addEventListener('focus', refreshScope);
    window.addEventListener('online', refreshScope);
    const timer = window.setInterval(refreshScope, 60_000);
    return () => {
      window.removeEventListener('focus', refreshScope);
      window.removeEventListener('online', refreshScope);
      window.clearInterval(timer);
    };
  }, [refreshHousehold]);

  return (
    <FeatureGateProvider
      principalId={isAuthenticated ? (user?.id ?? null) : null}
      householdId={household?.id}
    >
      <AuthenticatedShell {...props} />
    </FeatureGateProvider>
  );
};

/**
 * Root application component.
 *
 * Wraps authenticated routes in the AppLayout shell which provides sidebar
 * navigation on desktop and bottom navigation on mobile.
 *
 * Pre-authentication routes (login, signup, forgot/reset-password, onboarding)
 * render standalone without layout — see `STANDALONE_ROUTES` above.
 */
export const App: FC = () => {
  const location = useLocation();
  // Keep the browser tab title in sync with the route for every branch below
  // (standalone, authenticated, onboarding). See #3104.
  useDocumentTitle();
  const activePath = location.pathname === '/' ? '/' : location.pathname;
  const pageTitle = derivePageTitle(activePath);
  const isStandalonePage = isStandalonePath(activePath);
  // Skip the first-run onboarding auto-launch during a Lighthouse audit so the
  // synthetic run measures the requested route (e.g. /login) instead of being
  // redirected into the onboarding flow — which, with storage cleared between
  // loads, otherwise causes navigation churn under audit (#2795).
  const shouldStartOnboarding =
    shouldAutoLaunchOnboarding(activePath, isOnboardingComplete()) && !isLighthouseAudit();

  if (shouldStartOnboarding) {
    return (
      <PrivacyModeProvider>
        <ConsentDialog />
        <Navigate to="/onboarding" replace state={{ from: activePath }} />
      </PrivacyModeProvider>
    );
  }

  return isStandalonePage ? (
    <PrivacyModeProvider>
      {/* Announces route changes and moves focus to #main-content (#1684, #3330, #3342) */}
      <FocusManager resolveTitle={derivePageTitle} />
      <ConsentDialog />
      <AppRoutes />
    </PrivacyModeProvider>
  ) : (
    <PrivacyModeProvider>
      {/* Announces route changes and moves focus to #main-content (#1684, #3330, #3342) */}
      <FocusManager resolveTitle={derivePageTitle} />
      <ConsentDialog />
      <NotificationsProvider>
        <NotificationInjectors />
        <EntitlementAwareAuthenticatedShell activePath={activePath} pageTitle={pageTitle} />
      </NotificationsProvider>
      <BudgetHapticNotifier />
    </PrivacyModeProvider>
  );
};
