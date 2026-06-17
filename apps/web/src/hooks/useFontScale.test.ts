// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FONT_SCALE_OPTIONS,
  FONT_SCALE_STORAGE_KEY,
  applyFontScalePreference,
  getStoredFontScalePreference,
  normalizeFontScalePreference,
  setFontScalePreference,
  useFontScale,
} from './useFontScale';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const computedFontSizes: Record<string, string> = {
  '': '16px',
  '87.5%': '14px',
  '100%': '16px',
  '125%': '20px',
  '150%': '24px',
  '200%': '32px',
};

describe('useFontScale', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.fontSize = '';
    document.documentElement.style.removeProperty('--finance-font-scale');
    document.documentElement.removeAttribute('data-font-scale');
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          fontSize: computedFontSizes[document.documentElement.style.fontSize] ?? '16px',
        }) as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers named steps through 200 percent text size', () => {
    expect(
      FONT_SCALE_OPTIONS.map((option) => [option.value, option.label, option.rootFontSize]),
    ).toEqual([
      ['small', 'Small', '87.5%'],
      ['default', 'Default', '100%'],
      ['large', 'Large', '125%'],
      ['extra-large', 'Extra Large', '150%'],
      ['huge', 'Huge', '200%'],
    ]);
  });

  it('persists and applies the Huge preference', () => {
    const normalized = setFontScalePreference('huge');

    expect(normalized).toBe('huge');
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('huge');
    expect(document.documentElement.style.fontSize).toBe('200%');
    expect(document.documentElement.style.getPropertyValue('--finance-font-scale')).toBe('2');
    expect(document.documentElement.getAttribute('data-font-scale')).toBe('huge');
  });

  it('clamps invalid stored values to Default and migrates legacy aliases', () => {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, 'massive');
    expect(getStoredFontScalePreference()).toBe('default');
    expect(normalizeFontScalePreference('medium')).toBe('default');
    expect(normalizeFontScalePreference('x-large')).toBe('extra-large');

    const normalized = setFontScalePreference('massive');
    expect(normalized).toBe('default');
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('default');
    expect(document.documentElement.style.fontSize).toBe('100%');
  });

  it('updates hook state when a new preference is selected', () => {
    applyFontScalePreference('default');

    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.setPreference('huge');
    });

    expect(result.current.preference).toBe('huge');
    expect(result.current.scale).toBe(2);
    expect(result.current.isLargeScale).toBe(true);
  });
});
