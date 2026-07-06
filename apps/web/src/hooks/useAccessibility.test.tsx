// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import { FONT_SCALE_STORAGE_KEY } from './useFontScale';
import { useAccessibility } from './useAccessibility';

function wrapper({ children }: { children: ReactNode }) {
  return <AccessibilityProvider>{children}</AccessibilityProvider>;
}

describe('useAccessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it('returns the current settings and helper flags', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    expect(result.current.accessibilityMode).toBe('standard');
    expect(result.current.isSimplified).toBe(false);
    expect(result.current.effectiveReduceMotion).toBe(false);
  });

  it('toggles simplified mode and body classes through the hook API', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    act(() => {
      result.current.toggleAccessibilityMode();
    });

    expect(result.current.isSimplified).toBe(true);
    expect(document.body).toHaveClass('accessibility-simplified');
    expect(result.current.fontSize).toBe('extra-large');
  });

  it('updates granular settings through helper setters', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    act(() => {
      result.current.setFontSize('large');
      result.current.toggleHighContrast();
      result.current.toggleSpeakAmounts();
    });

    expect(result.current.fontSize).toBe('large');
    expect(result.current.highContrast).toBe(true);
    expect(result.current.speakAmounts).toBe(true);
    expect(document.body.dataset.accessibilitySpeech).toBe('true');
  });

  it('returns a safe default outside of a provider', () => {
    const { result } = renderHook(() => useAccessibility());

    expect(result.current.accessibilityMode).toBe('standard');
    expect(result.current.toggleAccessibilityMode).not.toThrow();
  });

  it('applies the accessibility font size as an inline root font-size', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    act(() => {
      result.current.setFontSize('extra-large');
    });

    expect(document.documentElement.style.fontSize).toBe('20px');
  });

  it('enlarges the root font size when simplified mode is enabled', () => {
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    act(() => {
      result.current.toggleAccessibilityMode();
    });

    expect(result.current.fontSize).toBe('extra-large');
    expect(document.documentElement.style.fontSize).toBe('20px');
  });

  it('preserves a larger Display text-size preference over the accessibility size', () => {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, 'huge');
    const { result } = renderHook(() => useAccessibility(), { wrapper });

    act(() => {
      result.current.setFontSize('large');
    });

    // Display "Huge" (32px) outranks the accessibility "large" size (18px).
    expect(document.documentElement.style.fontSize).toBe('32px');
  });
});
