// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildLargeTextAuditMatrix,
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
