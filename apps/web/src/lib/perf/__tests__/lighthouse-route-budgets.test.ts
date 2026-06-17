// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  REQUIRED_LIGHTHOUSE_ROUTES,
  createLighthouseArtifactName,
  evaluateLighthouseRouteBudgets,
} from '../lighthouse-route-budgets';

describe('lighthouse route budgets', () => {
  it('collects deterministic route fixtures for required performance gates', () => {
    expect(REQUIRED_LIGHTHOUSE_ROUTES.map((route) => route.name)).toEqual([
      'dashboard',
      'transactions',
      'transaction-detail',
      'settings',
    ]);
    expect(REQUIRED_LIGHTHOUSE_ROUTES.every((route) => route.fixtureName.length > 0)).toBe(true);
  });

  it('reports route budget failures for LCP, INP, CLS, and TBT', () => {
    expect(
      evaluateLighthouseRouteBudgets([
        { route: 'dashboard', metrics: { lcpMs: 2_700, inpMs: 100, cls: 0.02, tbtMs: 100 } },
        { route: 'settings', metrics: { lcpMs: 1_700, inpMs: 250, cls: 0.12, tbtMs: 350 } },
      ]),
    ).toEqual([
      { route: 'dashboard', metric: 'lcpMs', actual: 2_700, max: 2_500 },
      { route: 'settings', metric: 'inpMs', actual: 250, max: 200 },
      { route: 'settings', metric: 'cls', actual: 0.12, max: 0.1 },
      { route: 'settings', metric: 'tbtMs', actual: 350, max: 300 },
    ]);
  });

  it('uses stable artifact names for CI uploads', () => {
    expect(createLighthouseArtifactName('transactions', '42')).toBe('lighthouse-transactions-42.json');
  });
});
