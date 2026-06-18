// SPDX-License-Identifier: BUSL-1.1

export const DASHBOARD_SHELL_TARGET_MS = 800;
export const DASHBOARD_LCP_4G_TARGET_MS = 2_000;
export const DASHBOARD_LCP_SLOW_4G_TARGET_MS = 3_000;
export const DASHBOARD_CLS_TARGET = 0.05;
export const DASHBOARD_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type DashboardStartupMode = 'fresh-data' | 'cached-summary' | 'skeleton' | 'reauth-shell';
export type DashboardWidgetPriority = 'primary' | 'deferred' | 'idle';

export interface DashboardSummarySnapshot {
  readonly id: string;
  readonly capturedAt: number;
  readonly accountCount: number;
  readonly transactionCount: number;
  readonly hasBalanceSummary: boolean;
  readonly hasCashFlowSummary: boolean;
}

export interface DashboardStartupInput {
  readonly now: number;
  readonly navigationStartedAt: number;
  readonly hasFreshData: boolean;
  readonly cachedSnapshot: DashboardSummarySnapshot | null;
  readonly sessionExpired: boolean;
}

export interface DashboardStartupPlan {
  readonly mode: DashboardStartupMode;
  readonly renderWithinMs: number;
  readonly showCachedTimestamp: boolean;
  readonly reserveFinalLayoutSpace: boolean;
  readonly primaryWidgets: readonly string[];
  readonly deferredWidgets: readonly string[];
}

const PRIMARY_DASHBOARD_WIDGETS = ['balance-summary', 'cash-flow-summary'] as const;
const DEFERRED_DASHBOARD_WIDGETS = [
  'recent-transactions',
  'budget-progress',
  'insights',
  'receipts',
] as const;
const IDLE_DASHBOARD_WIDGETS = ['achievement-strip', 'education-card'] as const;

export function isDashboardSnapshotUsable(
  snapshot: DashboardSummarySnapshot | null,
  now: number,
  maxAgeMs = DASHBOARD_SNAPSHOT_MAX_AGE_MS,
): snapshot is DashboardSummarySnapshot {
  if (snapshot === null) return false;
  if (!Number.isFinite(snapshot.capturedAt) || snapshot.capturedAt > now) return false;
  if (now - snapshot.capturedAt > maxAgeMs) return false;
  return snapshot.hasBalanceSummary || snapshot.hasCashFlowSummary;
}

export function planDashboardStartup(input: DashboardStartupInput): DashboardStartupPlan {
  const elapsedMs = Math.max(0, input.now - input.navigationStartedAt);
  const renderWithinMs = Math.max(0, DASHBOARD_SHELL_TARGET_MS - elapsedMs);
  const hasUsableSnapshot = isDashboardSnapshotUsable(input.cachedSnapshot, input.now);

  if (input.sessionExpired) {
    return createStartupPlan('reauth-shell', renderWithinMs, false);
  }

  if (input.hasFreshData) {
    return createStartupPlan('fresh-data', renderWithinMs, false);
  }

  if (hasUsableSnapshot) {
    return createStartupPlan('cached-summary', renderWithinMs, true);
  }

  return createStartupPlan('skeleton', renderWithinMs, false);
}

export function getDashboardWidgetPriority(widgetId: string): DashboardWidgetPriority {
  if ((PRIMARY_DASHBOARD_WIDGETS as readonly string[]).includes(widgetId)) return 'primary';
  if ((DEFERRED_DASHBOARD_WIDGETS as readonly string[]).includes(widgetId)) return 'deferred';
  return (IDLE_DASHBOARD_WIDGETS as readonly string[]).includes(widgetId) ? 'idle' : 'deferred';
}

export function shouldHydrateDashboardWidget(
  widgetId: string,
  options: { readonly hasPrimarySummary: boolean; readonly isInputPending?: boolean },
): boolean {
  const priority = getDashboardWidgetPriority(widgetId);
  if (priority === 'primary') return true;
  if (!options.hasPrimarySummary) return false;
  if (priority === 'idle') return options.isInputPending !== true;
  return true;
}

function createStartupPlan(
  mode: DashboardStartupMode,
  renderWithinMs: number,
  showCachedTimestamp: boolean,
): DashboardStartupPlan {
  return {
    mode,
    renderWithinMs,
    showCachedTimestamp,
    reserveFinalLayoutSpace: true,
    primaryWidgets: PRIMARY_DASHBOARD_WIDGETS,
    deferredWidgets: [...DEFERRED_DASHBOARD_WIDGETS, ...IDLE_DASHBOARD_WIDGETS],
  };
}
