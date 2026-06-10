// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AccessibilityProvider,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  useAccessibilityContext,
} from './AccessibilityContext';

const speakMock = vi.fn();
const cancelMock = vi.fn();

function wrapper({ children }: { children: ReactNode }) {
  return <AccessibilityProvider>{children}</AccessibilityProvider>;
}

function installMatchMedia(matches = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('AccessibilityContext', () => {
  beforeEach(() => {
    localStorage.clear();
    cancelMock.mockReset();
    speakMock.mockReset();
    installMatchMedia(false);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation(function MockSpeechSynthesisUtterance(
        this: { text: string },
        text: string,
      ) {
        this.text = text;
      }),
    );
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: cancelMock,
        speak: speakMock,
      },
    });
  });

  it('defaults to standard settings', () => {
    const { result } = renderHook(() => useAccessibilityContext(), { wrapper });

    expect(result.current.accessibilityMode).toBe(DEFAULT_ACCESSIBILITY_SETTINGS.accessibilityMode);
    expect(result.current.fontSize).toBe(DEFAULT_ACCESSIBILITY_SETTINGS.fontSize);
    expect(result.current.highContrast).toBe(false);
    expect(result.current.reduceMotion).toBe(false);
    expect(result.current.speakAmounts).toBe(false);
    expect(result.current.isSimplified).toBe(false);
  });

  it('hydrates stored preferences from localStorage', () => {
    localStorage.setItem(
      'finance-accessibility-settings-v1',
      JSON.stringify({
        accessibilityMode: 'simplified',
        fontSize: 'large',
        reduceMotion: true,
        highContrast: true,
        speakAmounts: true,
      }),
    );

    const { result } = renderHook(() => useAccessibilityContext(), { wrapper });

    expect(result.current.accessibilityMode).toBe('simplified');
    expect(result.current.fontSize).toBe('large');
    expect(result.current.reduceMotion).toBe(true);
    expect(result.current.highContrast).toBe(true);
    expect(result.current.speakAmounts).toBe(true);
  });

  it('enables large defaults when simplified mode is turned on', () => {
    const { result } = renderHook(() => useAccessibilityContext(), { wrapper });

    act(() => {
      result.current.setAccessibilityMode('simplified');
    });

    expect(result.current.accessibilityMode).toBe('simplified');
    expect(result.current.fontSize).toBe('extra-large');
    expect(result.current.highContrast).toBe(true);
    expect(result.current.reduceMotion).toBe(true);
  });

  it('persists updates and applies DOM classes', async () => {
    const { result } = renderHook(() => useAccessibilityContext(), { wrapper });

    act(() => {
      result.current.setAccessibilityMode('simplified');
      result.current.setFontSize('large');
      result.current.setSpeakAmounts(true);
    });

    await waitFor(() => {
      expect(localStorage.getItem('finance-accessibility-settings-v1')).toContain('simplified');
    });

    expect(document.body).toHaveClass('accessibility-simplified');
    expect(document.body).toHaveClass('accessibility-high-contrast');
    expect(document.body).toHaveClass('accessibility-reduced-motion');
    expect(document.body.dataset.accessibilityFontSize).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--accessibility-root-font-size')).toBe(
      '18px',
    );
  });

  it('respects prefers-reduced-motion even when the explicit toggle is off', () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useAccessibilityContext(), { wrapper });

    expect(result.current.reduceMotion).toBe(false);
    expect(result.current.effectiveReduceMotion).toBe(true);
    expect(document.body).toHaveClass('accessibility-reduced-motion');
  });

  it('speaks formatted amounts only when speech is enabled', () => {
    const { result } = renderHook(() => useAccessibilityContext(), { wrapper });

    expect(result.current.speakAmount(128500, 'USD', 'Emergency fund')).toBe(false);
    expect(speakMock).not.toHaveBeenCalled();

    act(() => {
      result.current.setSpeakAmounts(true);
    });

    expect(result.current.speakAmount(128500, 'USD', 'Emergency fund')).toBe(true);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect((speakMock.mock.calls[0]?.[0] as { text: string }).text).toContain('Emergency fund');
  });
});
