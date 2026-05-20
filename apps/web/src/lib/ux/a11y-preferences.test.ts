// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFERENCES,
  applyCssMappings,
  getFontSizeOptions,
  loadA11yPreferences,
  mapPreferencesToCss,
  mergeWithSystemPreferences,
  saveA11yPreferences,
  updatePreference,
} from './a11y-preferences';
import type { A11yPreferences } from './types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  // Clear mock storage
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadA11yPreferences', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadA11yPreferences()).toEqual(DEFAULT_A11Y_PREFERENCES);
  });

  it('loads stored preferences', () => {
    const prefs: A11yPreferences = { ...DEFAULT_A11Y_PREFERENCES, fontSize: 'large' };
    mockStorage[A11Y_STORAGE_KEY] = JSON.stringify(prefs);
    expect(loadA11yPreferences().fontSize).toBe('large');
  });

  it('returns defaults on invalid JSON', () => {
    mockStorage[A11Y_STORAGE_KEY] = 'not-json';
    expect(loadA11yPreferences()).toEqual(DEFAULT_A11Y_PREFERENCES);
  });
});

describe('saveA11yPreferences', () => {
  it('saves to localStorage', () => {
    const prefs = { ...DEFAULT_A11Y_PREFERENCES, highContrast: true };
    saveA11yPreferences(prefs);
    expect(mockStorage[A11Y_STORAGE_KEY]).toBeDefined();
    const parsed = JSON.parse(mockStorage[A11Y_STORAGE_KEY]);
    expect(parsed.highContrast).toBe(true);
  });
});

describe('updatePreference', () => {
  it('updates a single field immutably', () => {
    const updated = updatePreference(DEFAULT_A11Y_PREFERENCES, 'fontSize', 'x-large');
    expect(updated.fontSize).toBe('x-large');
    expect(DEFAULT_A11Y_PREFERENCES.fontSize).toBe('medium');
  });

  it('preserves other fields', () => {
    const updated = updatePreference(DEFAULT_A11Y_PREFERENCES, 'reducedMotion', true);
    expect(updated.highContrast).toBe(false);
    expect(updated.reducedMotion).toBe(true);
  });
});

describe('mapPreferencesToCss', () => {
  it('maps default preferences', () => {
    const mappings = mapPreferencesToCss(DEFAULT_A11Y_PREFERENCES);
    expect(mappings.length).toBeGreaterThan(0);
    const fontSizeMapping = mappings.find((m) => m.property === '--a11y-font-size-multiplier');
    expect(fontSizeMapping?.value).toBe('1');
  });

  it('maps high contrast preferences', () => {
    const prefs = { ...DEFAULT_A11Y_PREFERENCES, highContrast: true };
    const mappings = mapPreferencesToCss(prefs);
    const borderMapping = mappings.find((m) => m.property === '--a11y-border-width');
    expect(borderMapping?.value).toBe('2px');
  });

  it('maps reduced motion', () => {
    const prefs = { ...DEFAULT_A11Y_PREFERENCES, reducedMotion: true };
    const mappings = mapPreferencesToCss(prefs);
    const transitionMapping = mappings.find((m) => m.property === '--a11y-transition-duration');
    expect(transitionMapping?.value).toBe('0ms');
  });

  it('maps enhanced focus', () => {
    const prefs = { ...DEFAULT_A11Y_PREFERENCES, enhancedFocus: true };
    const mappings = mapPreferencesToCss(prefs);
    const focusMapping = mappings.find((m) => m.property === '--a11y-focus-outline-width');
    expect(focusMapping?.value).toBe('3px');
  });
});

describe('applyCssMappings', () => {
  it('applies mappings to element style', () => {
    const calls: [string, string][] = [];
    const element = { style: { setProperty: (n: string, v: string) => calls.push([n, v]) } };
    const mappings = mapPreferencesToCss(DEFAULT_A11Y_PREFERENCES);
    applyCssMappings(element, mappings);
    expect(calls.length).toBe(mappings.length);
  });
});

describe('mergeWithSystemPreferences', () => {
  it('gives stored preferences precedence', () => {
    const stored = { ...DEFAULT_A11Y_PREFERENCES, reducedMotion: false };
    const system = { reducedMotion: true };
    const result = mergeWithSystemPreferences(stored, system);
    expect(result.reducedMotion).toBe(false);
  });

  it('uses system preferences as fallback', () => {
    const result = mergeWithSystemPreferences(DEFAULT_A11Y_PREFERENCES, { highContrast: true });
    // stored has highContrast: false which takes precedence
    expect(result.highContrast).toBe(false);
  });
});

describe('getFontSizeOptions', () => {
  it('returns all font size options', () => {
    const options = getFontSizeOptions();
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.value)).toEqual(['small', 'medium', 'large', 'x-large']);
  });

  it('includes rem values', () => {
    const options = getFontSizeOptions();
    expect(options[0].rem).toBe(0.875);
    expect(options[1].rem).toBe(1.0);
  });
});
