// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { createRouteBundleAuditReport, type RouteChunkBudget, type RouteChunkSize } from '../route-bundle-artifacts';

const budgets: readonly RouteChunkBudget[] = [
  { route: 'dashboard', maxInitialGzipBytes: 150_000, maxLazyGzipBytes: 80_000 },
  { route: 'transactions', maxInitialGzipBytes: 150_000, maxLazyGzipBytes: 70_000 },
];

const chunks: readonly RouteChunkSize[] = [
  { route: 'dashboard', chunkName: 'initial', gzipBytes: 120_000, initial: true },
  { route: 'dashboard', chunkName: 'charts', gzipBytes: 95_000, initial: false },
  { route: 'transactions', chunkName: 'register', gzipBytes: 60_000, initial: false },
];

describe('route bundle artifacts', () => {
  it('summarizes initial JS, largest lazy chunks, and budget findings', () => {
    const report = createRouteBundleAuditReport(chunks, budgets);

    expect(report.initialGzipBytes).toBe(120_000);
    expect(report.largestLazyChunks[0].chunkName).toBe('charts');
    expect(report.findings).toEqual([
      { route: 'dashboard', chunkName: 'charts', gzipBytes: 95_000, budgetBytes: 80_000, waived: false },
    ]);
    expect(report.summary).toContain('Initial JS: 120000 gzip bytes');
  });

  it('marks approved waivers in CI summaries', () => {
    const report = createRouteBundleAuditReport(chunks, budgets, [
      { route: 'dashboard', chunkName: 'charts', reason: 'temporary beta chart split', expiresOn: '2026-03-01' },
    ]);

    expect(report.findings[0].waived).toBe(true);
    expect(report.summary).toContain('waived');
  });
});
