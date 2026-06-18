// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_SHELL_TARGET_MS,
  getDashboardWidgetPriority,
  isDashboardSnapshotUsable,
  planDashboardStartup,
  shouldHydrateDashboardWidget,
  type DashboardSummarySnapshot,
} from '../dashboard-perceived-performance';

function snapshot(overrides: Partial<DashboardSummarySnapshot> = {}): DashboardSummarySnapshot {
  return {
    id: 'dashboard-user-1',
    capturedAt: 1_000,
    accountCount: 2,
    transactionCount: 25,
    hasBalanceSummary: true,
    hasCashFlowSummary: true,
    ...overrides,
  };
}

describe('dashboard perceived performance planning', () => {
  it('uses cached summaries when fresh data is not ready', () => {
    const plan = planDashboardStartup({
      now: 1_300,
      navigationStartedAt: 1_000,
      hasFreshData: false,
      cachedSnapshot: snapshot(),
      sessionExpired: false,
    });

    expect(plan.mode).toBe('cached-summary');
    expect(plan.showCachedTimestamp).toBe(true);
    expect(plan.renderWithinMs).toBe(DASHBOARD_SHELL_TARGET_MS - 300);
    expect(plan.reserveFinalLayoutSpace).toBe(true);
  });

  it('falls back to reauth shell before showing stale financial data', () => {
    const plan = planDashboardStartup({
      now: 2_000,
      navigationStartedAt: 1_000,
      hasFreshData: true,
      cachedSnapshot: snapshot(),
      sessionExpired: true,
    });

    expect(plan.mode).toBe('reauth-shell');
    expect(plan.showCachedTimestamp).toBe(false);
  });

  it('rejects future and empty dashboard snapshots', () => {
    expect(isDashboardSnapshotUsable(snapshot({ capturedAt: 2_000 }), 1_000)).toBe(false);
    expect(
      isDashboardSnapshotUsable(
        snapshot({ hasBalanceSummary: false, hasCashFlowSummary: false }),
        1_500,
      ),
    ).toBe(false);
  });

  it('keeps non-primary widgets blocked until the primary summary is ready', () => {
    expect(getDashboardWidgetPriority('balance-summary')).toBe('primary');
    expect(shouldHydrateDashboardWidget('budget-progress', { hasPrimarySummary: false })).toBe(
      false,
    );
    expect(shouldHydrateDashboardWidget('budget-progress', { hasPrimarySummary: true })).toBe(true);
  });
});
