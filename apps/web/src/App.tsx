// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MilestoneToast } from './components/celebrations';
import { ConsentDialog } from './components/gdpr';
import { AppLayout } from './components/layout';
import { PrivacyModeProvider } from './contexts/PrivacyModeContext';
import { useBudgets } from './hooks';
import { useHaptics } from './hooks/useHaptics';
import { useMilestoneCheck } from './hooks/useMilestoneCheck';
import { useRouteAnnouncer } from './hooks/useRouteAnnouncer';
import { useSpendingPace } from './hooks/useSpendingPace';
import type { HapticEventType } from './lib/haptics/types';
import type { DetectedMilestone } from './lib/milestones';
import { AppRoutes } from './routes';

/**
 * Map path segments to human-readable page titles.
 *
 * Used by the AppLayout header. Dynamic / detail routes fall back to a
 * sensible default derived from the path's first segment.
 */
const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/goals': 'Goals',
  '/insights': 'Insights',
  '/household': 'Household',
  '/investments': 'Investments',
  '/bills': 'Bills',
  '/report-builder': 'Report Builder',
  '/achievements': 'Achievements',
  '/watchlists': 'Watchlists',
  '/settings': 'Settings',
  '/settings/account': 'Settings · Account',
  '/settings/preferences': 'Settings · Preferences',
  '/settings/privacy': 'Settings · Privacy & Data',
  '/settings/sync': 'Settings · Sync & Devices',
  '/settings/advanced': 'Settings · Advanced',
  '/import': 'Import',
  '/import/wizard': 'Import Wizard',
  '/import/receipt-ocr': 'Receipt OCR',
  '/privacy-dashboard': 'Privacy Dashboard',
  '/categories': 'Categories',
  '/planning': 'Financial Planning',
  '/learning': 'Learning',
  '/estate': 'Estate Inventory',
  '/cash-flow': 'Cash Flow',
  '/net-worth': 'Net Worth',
  '/subscriptions': 'Subscriptions',
  '/bank-connections': 'Bank Connections',
  '/legal': 'Legal',
  '/legal/privacy': 'Privacy Policy',
  '/legal/terms': 'Terms of Service',
  '/legal/ccpa': 'California Privacy Notice',
};

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
];

function isStandalonePath(pathname: string): boolean {
  return STANDALONE_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function derivePageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }
  // /accounts/<id> -> "Accounts"; /transactions/<id>/edit -> "Transactions"
  const firstSegment = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  return PAGE_TITLES[firstSegment] ?? 'Finance';
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
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname === '/' ? '/' : location.pathname;
  const pageTitle = derivePageTitle(activePath);
  const isStandalonePage = isStandalonePath(activePath);

  // Announce route transitions to screen readers (#1684)
  useRouteAnnouncer();

  return isStandalonePage ? (
    <PrivacyModeProvider>
      <ConsentDialog />
      <AppRoutes />
    </PrivacyModeProvider>
  ) : (
    <PrivacyModeProvider>
      <ConsentDialog />
      <AppLayout
        activePath={activePath}
        onNavigate={(path) => navigate(path)}
        pageTitle={pageTitle}
      >
        <AppRoutes />
      </AppLayout>
      <BudgetHapticNotifier />
      <MilestoneNotifier />
    </PrivacyModeProvider>
  );
};
