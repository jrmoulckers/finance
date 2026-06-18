// SPDX-License-Identifier: BUSL-1.1

export type DashboardHydrationPriority = 'primary' | 'deferred' | 'idle';

export interface DashboardHydrationWidget {
  readonly id: string;
  readonly priority: DashboardHydrationPriority;
  readonly route: string;
}

export interface DashboardHydrationPlanItem extends DashboardHydrationWidget {
  readonly hydrateAfterMs: number;
}

export interface DashboardHydrationTelemetryEvent {
  readonly name: 'dashboard-widget-hydrated';
  readonly widgetId: string;
  readonly route: string;
  readonly priority: DashboardHydrationPriority;
  readonly hydratedAtMs: number;
  readonly effectiveConnectionType: string;
  readonly appVersion: string;
}

export interface DashboardHydrationCorrelation {
  readonly widgetId: string;
  readonly hydratedAtMs: number;
  readonly lcpDeltaMs: number | null;
  readonly clsAtHydration: number | null;
}

export function planDashboardHydration(
  widgets: readonly DashboardHydrationWidget[],
  input: { readonly primaryInteractiveAtMs: number; readonly idleDelayMs?: number },
): readonly DashboardHydrationPlanItem[] {
  const idleDelayMs = input.idleDelayMs ?? 1_500;
  return widgets.map((widget) => ({
    ...widget,
    hydrateAfterMs:
      widget.priority === 'primary'
        ? 0
        : widget.priority === 'deferred'
          ? input.primaryInteractiveAtMs
          : input.primaryInteractiveAtMs + idleDelayMs,
  }));
}

export function createDashboardHydrationEvent(
  item: DashboardHydrationPlanItem,
  context: {
    readonly hydratedAtMs: number;
    readonly effectiveConnectionType: string;
    readonly appVersion: string;
  },
): DashboardHydrationTelemetryEvent {
  return {
    name: 'dashboard-widget-hydrated',
    widgetId: item.id,
    route: item.route,
    priority: item.priority,
    hydratedAtMs: context.hydratedAtMs,
    effectiveConnectionType: context.effectiveConnectionType,
    appVersion: context.appVersion,
  };
}

export function correlateHydrationWithVitals(
  events: readonly DashboardHydrationTelemetryEvent[],
  vitals: { readonly lcpMs?: number; readonly cls?: number },
): readonly DashboardHydrationCorrelation[] {
  return events.map((event) => ({
    widgetId: event.widgetId,
    hydratedAtMs: event.hydratedAtMs,
    lcpDeltaMs: vitals.lcpMs === undefined ? null : event.hydratedAtMs - vitals.lcpMs,
    clsAtHydration: vitals.cls ?? null,
  }));
}
