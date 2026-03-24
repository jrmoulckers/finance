// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireKeyDown(
  key: string,
  options: Partial<KeyboardEventInit> = {},
  target?: EventTarget,
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });

  if (target) {
    Object.defineProperty(event, 'target', { value: target, writable: false });
  }

  window.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useKeyboardShortcuts', () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('initialises showHelp as false', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    expect(result.current.showHelp).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Key event registration
  // -----------------------------------------------------------------------

  it('registers a keydown event listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useKeyboardShortcuts());

    const keydownCalls = addSpy.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydownCalls.length).toBeGreaterThan(0);
  });

  it('removes keydown event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();

    const keydownCalls = removeSpy.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydownCalls.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Key responses
  // -----------------------------------------------------------------------

  it('sets showHelp to true when "?" is pressed', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKeyDown('?');
    });

    expect(result.current.showHelp).toBe(true);
  });

  it('sets showHelp to true when Shift + "/" is pressed', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKeyDown('/', { shiftKey: true });
    });

    expect(result.current.showHelp).toBe(true);
  });

  it('sets showHelp to false when Escape is pressed', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    // Open help first
    act(() => {
      fireKeyDown('?');
    });
    expect(result.current.showHelp).toBe(true);

    // Close with Escape
    act(() => {
      fireKeyDown('Escape');
    });

    expect(result.current.showHelp).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Ignore when input is focused
  // -----------------------------------------------------------------------

  it('does not open help when an INPUT element is focused', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      fireKeyDown('?', {}, input);
    });

    expect(result.current.showHelp).toBe(false);

    document.body.removeChild(input);
  });

  it('does not open help when a TEXTAREA element is focused', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    act(() => {
      fireKeyDown('?', {}, textarea);
    });

    expect(result.current.showHelp).toBe(false);

    document.body.removeChild(textarea);
  });

  it('does not open help when a SELECT element is focused', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    const select = document.createElement('select');
    document.body.appendChild(select);

    act(() => {
      fireKeyDown('?', {}, select);
    });

    expect(result.current.showHelp).toBe(false);

    document.body.removeChild(select);
  });

  it('does not open help when a contentEditable element is focused', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom does not reliably implement isContentEditable, so stub it
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(div);

    act(() => {
      fireKeyDown('?', {}, div);
    });

    expect(result.current.showHelp).toBe(false);

    document.body.removeChild(div);
  });

  // -----------------------------------------------------------------------
  // Modifier keys
  // -----------------------------------------------------------------------

  it('does not open help when Ctrl key is held', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKeyDown('?', { ctrlKey: true });
    });

    expect(result.current.showHelp).toBe(false);
  });

  it('does not open help when Meta key is held', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKeyDown('?', { metaKey: true });
    });

    expect(result.current.showHelp).toBe(false);
  });

  it('does not open help when Alt key is held', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKeyDown('?', { altKey: true });
    });

    expect(result.current.showHelp).toBe(false);
  });

  // -----------------------------------------------------------------------
  // setShowHelp programmatic control
  // -----------------------------------------------------------------------

  it('allows programmatic control via setShowHelp', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      result.current.setShowHelp(true);
    });

    expect(result.current.showHelp).toBe(true);

    act(() => {
      result.current.setShowHelp(false);
    });

    expect(result.current.showHelp).toBe(false);
  });
});
