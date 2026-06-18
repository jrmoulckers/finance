// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  planOptionalRouteChunks,
  shouldKeepOptionalChunkFailureNonBlocking,
} from '../optional-route-chunk-plan';

describe('optional route chunk plan', () => {
  it('lazy-loads dashboard charts and advanced widgets behind the primary shell', () => {
    const decisions = planOptionalRouteChunks([
      {
        route: 'dashboard',
        moduleId: 'SafeToSpendCard',
        category: 'primary-shell',
        requiredForPrimaryShell: true,
      },
      {
        route: 'dashboard',
        moduleId: 'SpendingTrendChart',
        category: 'chart',
        requiredForPrimaryShell: false,
      },
      {
        route: 'dashboard',
        moduleId: 'TaxReserveWidget',
        category: 'tax',
        requiredForPrimaryShell: false,
      },
    ]);

    expect(decisions).toEqual([
      {
        moduleId: 'SafeToSpendCard',
        shouldLazyLoad: false,
        prefetchPolicy: 'none',
        tolerateLoadFailure: false,
      },
      {
        moduleId: 'SpendingTrendChart',
        shouldLazyLoad: true,
        prefetchPolicy: 'idle',
        tolerateLoadFailure: true,
      },
      {
        moduleId: 'TaxReserveWidget',
        shouldLazyLoad: true,
        prefetchPolicy: 'none',
        tolerateLoadFailure: true,
      },
    ]);
  });

  it('keeps optional chunk failures non-blocking for offline precache gaps', () => {
    const [decision] = planOptionalRouteChunks([
      {
        route: 'transactions',
        moduleId: 'LazyReceiptImage',
        category: 'receipt',
        requiredForPrimaryShell: false,
      },
    ]);

    expect(decision.prefetchPolicy).toBe('viewport');
    expect(shouldKeepOptionalChunkFailureNonBlocking(decision)).toBe(true);
  });
});
