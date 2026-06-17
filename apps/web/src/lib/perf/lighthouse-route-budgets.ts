// SPDX-License-Identifier: BUSL-1.1

export type LighthouseRouteName = 'dashboard' | 'transactions' | 'transaction-detail' | 'settings';
export type LighthouseMetric = 'lcpMs' | 'inpMs' | 'cls' | 'tbtMs';

export interface LighthouseRouteFixture {
  readonly name: LighthouseRouteName;
  readonly path: string;
  readonly fixtureName: string;
}

export interface LighthouseMetricBudget {
  readonly metric: LighthouseMetric;
  readonly max: number;
}

export interface LighthouseRouteResult {
  readonly route: LighthouseRouteName;
  readonly metrics: Partial<Record<LighthouseMetric, number>>;
}

export interface LighthouseBudgetFailure {
  readonly route: LighthouseRouteName;
  readonly metric: LighthouseMetric;
  readonly actual: number;
  readonly max: number;
}

export const REQUIRED_LIGHTHOUSE_ROUTES: readonly LighthouseRouteFixture[] = [
  { name: 'dashboard', path: '/dashboard', fixtureName: 'dashboard-returning-user' },
  { name: 'transactions', path: '/transactions', fixtureName: 'transactions-list-200' },
  { name: 'transaction-detail', path: '/transactions/fixture-transaction', fixtureName: 'transaction-detail' },
  { name: 'settings', path: '/settings/account', fixtureName: 'settings-account' },
];

export const DEFAULT_LIGHTHOUSE_BUDGETS: readonly LighthouseMetricBudget[] = [
  { metric: 'lcpMs', max: 2_500 },
  { metric: 'inpMs', max: 200 },
  { metric: 'cls', max: 0.1 },
  { metric: 'tbtMs', max: 300 },
];

export function evaluateLighthouseRouteBudgets(
  results: readonly LighthouseRouteResult[],
  budgets: readonly LighthouseMetricBudget[] = DEFAULT_LIGHTHOUSE_BUDGETS,
): readonly LighthouseBudgetFailure[] {
  const failures: LighthouseBudgetFailure[] = [];
  for (const result of results) {
    for (const budget of budgets) {
      const actual = result.metrics[budget.metric];
      if (actual !== undefined && actual > budget.max) {
        failures.push({ route: result.route, metric: budget.metric, actual, max: budget.max });
      }
    }
  }
  return failures;
}

export function createLighthouseArtifactName(route: LighthouseRouteName, runId: string): string {
  return `lighthouse-${route}-${runId}.json`;
}
