// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessibilityProvider } from '../contexts/AccessibilityContext';
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
});
