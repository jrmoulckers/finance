// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildLargeTextAuditMatrix,
  buildLargeTextSurfaceQaMatrix,
  chooseLargeTextReflow,
  estimateEffectiveTextScale,
} from '../large-text-reflow';

describe('large text reflow helpers', () => {
  it('estimates combined browser zoom and app font scale', () => {
    expect(estimateEffectiveTextScale(300, 1.25)).toBe(3.75);
    expect(estimateEffectiveTextScale(0, 0)).toBe(1);
  });

  it('switches to stacked layouts beyond 200 percent effective text size', () => {
    const decision = chooseLargeTextReflow({ viewportWidth: 1280, browserZoomPercent: 200 });

    expect(decision.mode).toBe('stacked');
    expect(decision.allowSingleAxisTableScroll).toBe(false);
  });

  it('prefers card alternatives for dense data at large text sizes', () => {
    const decision = chooseLargeTextReflow({
      viewportWidth: 1024,
      browserZoomPercent: 200,
      hasDenseData: true,
    });

    expect(decision.mode).toBe('card-alternative');
    expect(decision.allowSingleAxisTableScroll).toBe(true);
    expect(decision.reasons).toContain('dense financial data needs a non-grid reading path');
  });

  it('provides a 200 to 400 percent audit matrix', () => {
    expect(buildLargeTextAuditMatrix().map((item) => item.browserZoomPercent)).toEqual([
      200, 300, 400, 200,
    ]);
  });
});

describe('300/400 percent large-text surface QA matrix (#2487)', () => {
  const matrix = buildLargeTextSurfaceQaMatrix();

  it('covers all seven surfaces at both 300 and 400 percent', () => {
    const surfaces = new Set(matrix.map((item) => item.surface));
    expect(surfaces).toEqual(
      new Set([
        'navigation',
        'modal',
        'form',
        'command-palette',
        'chart-summary',
        'bottom-navigation',
        'focus-indicator',
      ]),
    );
    expect(matrix).toHaveLength(14);
    expect(new Set(matrix.map((item) => item.browserZoomPercent))).toEqual(new Set([300, 400]));
  });

  it('reflows dense surfaces to card alternatives and simple surfaces to stacked', () => {
    for (const item of matrix) {
      expect(item.effectiveScale).toBeGreaterThanOrEqual(3);
      expect(item.checks.length).toBeGreaterThan(0);
      if (item.surface === 'command-palette' || item.surface === 'chart-summary') {
        expect(item.expectedMode).toBe('card-alternative');
      } else {
        expect(item.expectedMode).toBe('stacked');
      }
    }
  });
});
