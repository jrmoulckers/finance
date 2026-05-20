// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TooltipConfig, TooltipState } from './types';
import {
  DEFAULT_TOOLTIP_STATE,
  TOOLTIP_STORAGE_KEY,
  dismissTooltip,
  getNextTooltipForFeature,
  getTooltipShowCount,
  getVisibleTooltips,
  hasEncounteredFeature,
  loadTooltipState,
  markFeatureEncountered,
  resetAllTooltips,
  resetTooltip,
  saveTooltipState,
  shouldShowTooltip,
} from './tooltips';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOOLTIP_A: TooltipConfig = {
  id: 'tip-budgets',
  targetFeature: 'budgets',
  title: 'Budget Overview',
  body: 'This shows your monthly budget progress.',
  order: 1,
  showOnce: true,
};

const TOOLTIP_B: TooltipConfig = {
  id: 'tip-accounts',
  targetFeature: 'accounts',
  title: 'Accounts',
  body: 'Manage your accounts here.',
  order: 2,
  showOnce: false,
};

const TOOLTIP_C: TooltipConfig = {
  id: 'tip-budgets-detail',
  targetFeature: 'budgets',
  title: 'Budget Details',
  body: 'Click a category to see more.',
  order: 3,
  showOnce: true,
};

const ALL_TOOLTIPS = [TOOLTIP_A, TOOLTIP_B, TOOLTIP_C];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadTooltipState / saveTooltipState', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadTooltipState()).toEqual(DEFAULT_TOOLTIP_STATE);
  });

  it('round-trips state through storage', () => {
    const state: TooltipState = {
      dismissed: { 'tip-budgets': true },
      showCounts: { 'tip-budgets': 1 },
      encounteredFeatures: { budgets: true },
    };
    saveTooltipState(state);
    expect(loadTooltipState()).toEqual(state);
  });

  it('returns defaults on invalid JSON', () => {
    mockStorage[TOOLTIP_STORAGE_KEY] = '{{invalid';
    expect(loadTooltipState()).toEqual(DEFAULT_TOOLTIP_STATE);
  });
});

describe('markFeatureEncountered / hasEncounteredFeature', () => {
  it('marks a feature as encountered', () => {
    const state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    expect(hasEncounteredFeature(state, 'budgets')).toBe(true);
  });

  it('returns false for unencountered features', () => {
    expect(hasEncounteredFeature(DEFAULT_TOOLTIP_STATE, 'budgets')).toBe(false);
  });

  it('does not mutate original state', () => {
    markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    expect(hasEncounteredFeature(DEFAULT_TOOLTIP_STATE, 'budgets')).toBe(false);
  });
});

describe('shouldShowTooltip', () => {
  it('returns false when feature not encountered', () => {
    expect(shouldShowTooltip(TOOLTIP_A, DEFAULT_TOOLTIP_STATE)).toBe(false);
  });

  it('returns true when feature encountered and not dismissed', () => {
    const state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    expect(shouldShowTooltip(TOOLTIP_A, state)).toBe(true);
  });

  it('returns false when show-once and dismissed', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    state = dismissTooltip(state, TOOLTIP_A.id);
    expect(shouldShowTooltip(TOOLTIP_A, state)).toBe(false);
  });

  it('returns true when not show-once and dismissed', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'accounts');
    state = dismissTooltip(state, TOOLTIP_B.id);
    expect(shouldShowTooltip(TOOLTIP_B, state)).toBe(true);
  });
});

describe('getVisibleTooltips', () => {
  it('returns tooltips for encountered features sorted by order', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    state = markFeatureEncountered(state, 'accounts');
    const visible = getVisibleTooltips(ALL_TOOLTIPS, state);
    expect(visible).toHaveLength(3);
    expect(visible[0].id).toBe('tip-budgets');
    expect(visible[1].id).toBe('tip-accounts');
    expect(visible[2].id).toBe('tip-budgets-detail');
  });

  it('excludes dismissed show-once tooltips', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    state = dismissTooltip(state, TOOLTIP_A.id);
    const visible = getVisibleTooltips(ALL_TOOLTIPS, state);
    expect(visible.find((t) => t.id === 'tip-budgets')).toBeUndefined();
  });
});

describe('dismissTooltip', () => {
  it('marks tooltip as dismissed and increments show count', () => {
    const state = dismissTooltip(DEFAULT_TOOLTIP_STATE, 'tip-budgets');
    expect(state.dismissed['tip-budgets']).toBe(true);
    expect(state.showCounts['tip-budgets']).toBe(1);
  });

  it('increments show count on subsequent dismissals', () => {
    let state = dismissTooltip(DEFAULT_TOOLTIP_STATE, 'tip-budgets');
    state = dismissTooltip(state, 'tip-budgets');
    expect(state.showCounts['tip-budgets']).toBe(2);
  });
});

describe('resetTooltip', () => {
  it('allows a tooltip to be shown again', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    state = dismissTooltip(state, TOOLTIP_A.id);
    state = resetTooltip(state, TOOLTIP_A.id);
    expect(shouldShowTooltip(TOOLTIP_A, state)).toBe(true);
  });
});

describe('resetAllTooltips', () => {
  it('returns default state', () => {
    expect(resetAllTooltips()).toEqual(DEFAULT_TOOLTIP_STATE);
  });
});

describe('getTooltipShowCount', () => {
  it('returns 0 for never-shown tooltip', () => {
    expect(getTooltipShowCount(DEFAULT_TOOLTIP_STATE, 'tip-budgets')).toBe(0);
  });

  it('returns count after dismissals', () => {
    const state = dismissTooltip(DEFAULT_TOOLTIP_STATE, 'tip-budgets');
    expect(getTooltipShowCount(state, 'tip-budgets')).toBe(1);
  });
});

describe('getNextTooltipForFeature', () => {
  it('returns the lowest-order undismissed tooltip', () => {
    const state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    const next = getNextTooltipForFeature(ALL_TOOLTIPS, state, 'budgets');
    expect(next?.id).toBe('tip-budgets');
  });

  it('returns second tooltip after first is dismissed', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    state = dismissTooltip(state, TOOLTIP_A.id);
    const next = getNextTooltipForFeature(ALL_TOOLTIPS, state, 'budgets');
    expect(next?.id).toBe('tip-budgets-detail');
  });

  it('returns null when all are dismissed', () => {
    let state = markFeatureEncountered(DEFAULT_TOOLTIP_STATE, 'budgets');
    state = dismissTooltip(state, TOOLTIP_A.id);
    state = dismissTooltip(state, TOOLTIP_C.id);
    const next = getNextTooltipForFeature(ALL_TOOLTIPS, state, 'budgets');
    expect(next).toBeNull();
  });

  it('returns null for unencountered feature', () => {
    const next = getNextTooltipForFeature(ALL_TOOLTIPS, DEFAULT_TOOLTIP_STATE, 'budgets');
    expect(next).toBeNull();
  });
});
