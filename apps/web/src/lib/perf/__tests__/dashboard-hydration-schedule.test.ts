// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  correlateHydrationWithVitals,
  createDashboardHydrationEvent,
  planDashboardHydration,
  type DashboardHydrationWidget,
} from '../dashboard-hydration-schedule';

const widgets: readonly DashboardHydrationWidget[] = [
  { id: 'balance-summary', priority: 'primary', route: '/dashboard' },
  { id: 'chart', priority: 'deferred', route: '/dashboard' },
  { id: 'education-card', priority: 'idle', route: '/dashboard' },
];

describe('dashboard hydration schedule', () => {
  it('keeps primary widgets interactive before deferred widgets hydrate', () => {
    const plan = planDashboardHydration(widgets, { primaryInteractiveAtMs: 700 });

    expect(plan.map((item) => [item.id, item.hydrateAfterMs])).toEqual([
      ['balance-summary', 0],
      ['chart', 700],
      ['education-card', 2_200],
    ]);
  });

  it('creates local telemetry contracts tagged by route, network, and version', () => {
    const item = planDashboardHydration(widgets, { primaryInteractiveAtMs: 700 })[1];
    const event = createDashboardHydrationEvent(item, {
      hydratedAtMs: 900,
      effectiveConnectionType: '4g',
      appVersion: '0.1.0',
    });

    expect(event).toMatchObject({
      name: 'dashboard-widget-hydrated',
      route: '/dashboard',
      effectiveConnectionType: '4g',
      appVersion: '0.1.0',
    });
  });

  it('correlates local hydration timing with LCP and CLS samples', () => {
    const item = planDashboardHydration(widgets, { primaryInteractiveAtMs: 700 })[1];
    const event = createDashboardHydrationEvent(item, {
      hydratedAtMs: 900,
      effectiveConnectionType: '4g',
      appVersion: '0.1.0',
    });

    expect(correlateHydrationWithVitals([event], { lcpMs: 800, cls: 0.01 })).toEqual([
      { widgetId: 'chart', hydratedAtMs: 900, lcpDeltaMs: 100, clsAtHydration: 0.01 },
    ]);
  });
});
