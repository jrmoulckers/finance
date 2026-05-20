// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  filterListItems,
  filterMenuItems,
  getFeatureVisibility,
  getSimplificationCssVars,
  getSimplificationLevels,
  getSimplificationStyles,
  isFeatureVisible,
} from './cognitive-simplification';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getFeatureVisibility', () => {
  it('returns full visibility for standard', () => {
    const vis = getFeatureVisibility('standard');
    expect(vis.showAdvancedCharts).toBe(true);
    expect(vis.showInvestments).toBe(true);
    expect(vis.showDebtTools).toBe(true);
    expect(vis.maxMenuItems).toBe(10);
  });

  it('hides advanced features for simplified', () => {
    const vis = getFeatureVisibility('simplified');
    expect(vis.showAdvancedCharts).toBe(false);
    expect(vis.showInvestments).toBe(false);
    expect(vis.showDebtTools).toBe(false);
    expect(vis.showTransactionDetails).toBe(true);
  });

  it('hides most features for minimal', () => {
    const vis = getFeatureVisibility('minimal');
    expect(vis.showAdvancedCharts).toBe(false);
    expect(vis.showTransactionDetails).toBe(false);
    expect(vis.showMultiAccount).toBe(false);
    expect(vis.maxMenuItems).toBe(4);
  });
});

describe('getSimplificationStyles', () => {
  it('returns standard sizing', () => {
    const styles = getSimplificationStyles('standard');
    expect(styles.minTouchTargetPx).toBe(44);
    expect(styles.fontSizeMultiplier).toBe(1.0);
    expect(styles.reducedDensity).toBe(false);
  });

  it('increases touch targets for simplified', () => {
    const styles = getSimplificationStyles('simplified');
    expect(styles.minTouchTargetPx).toBe(48);
    expect(styles.fontSizeMultiplier).toBe(1.1);
    expect(styles.reducedDensity).toBe(true);
  });

  it('maximises touch targets for minimal', () => {
    const styles = getSimplificationStyles('minimal');
    expect(styles.minTouchTargetPx).toBe(56);
    expect(styles.fontSizeMultiplier).toBe(1.25);
    expect(styles.maxListItems).toBe(10);
  });
});

describe('isFeatureVisible', () => {
  it('reports investments visible in standard', () => {
    expect(isFeatureVisible('standard', 'showInvestments')).toBe(true);
  });

  it('reports investments hidden in simplified', () => {
    expect(isFeatureVisible('simplified', 'showInvestments')).toBe(false);
  });
});

describe('filterMenuItems', () => {
  const items = Array.from({ length: 12 }, (_, i) => `item-${i}`);

  it('returns all items for standard (max 10)', () => {
    expect(filterMenuItems(items, 'standard')).toHaveLength(10);
  });

  it('limits to 6 for simplified', () => {
    expect(filterMenuItems(items, 'simplified')).toHaveLength(6);
  });

  it('limits to 4 for minimal', () => {
    expect(filterMenuItems(items, 'minimal')).toHaveLength(4);
  });
});

describe('filterListItems', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);

  it('limits to 50 for standard', () => {
    expect(filterListItems(items, 'standard')).toHaveLength(50);
  });

  it('limits to 10 for minimal', () => {
    expect(filterListItems(items, 'minimal')).toHaveLength(10);
  });
});

describe('getSimplificationCssVars', () => {
  it('generates CSS vars for standard', () => {
    const vars = getSimplificationCssVars('standard');
    expect(vars['--simplification-min-touch-target']).toBe('44px');
    expect(vars['--simplification-density']).toBe('normal');
  });

  it('generates CSS vars for minimal', () => {
    const vars = getSimplificationCssVars('minimal');
    expect(vars['--simplification-min-touch-target']).toBe('56px');
    expect(vars['--simplification-density']).toBe('reduced');
  });
});

describe('getSimplificationLevels', () => {
  it('returns levels in order', () => {
    expect(getSimplificationLevels()).toEqual(['standard', 'simplified', 'minimal']);
  });
});
