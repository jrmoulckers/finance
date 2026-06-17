// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
  setSingleKeyShortcutsPreference,
} from '../lib/accessibility-preferences';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

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
  localStorage.clear();
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

  it('exposes shortcutCategories for the help dialog', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    expect(result.current.shortcutCategories.length).toBeGreaterThan(0);
    expect(result.current.shortcutCategories[0].title).toBe('Navigation');
    expect(result.current.shortcutCategories[0].shortcuts).toContainEqual({
      keys: 'G then I',
      description: 'Go to Investments',
    });
    expect(result.current.shortcutCategories[1].shortcuts).toContainEqual({
      keys: 'Ctrl/Cmd+K',
      description: 'Open command palette',
    });
  });

  // -----------------------------------------------------------------------
  // Key event registration
  // -----------------------------------------------------------------------

  it('registers a keydown event listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useKeyboardShortcuts());

    const keydownCalls = addSpy.mock.calls.filter((call) => (call[0] as string) === 'keydown');
    expect(keydownCalls.length).toBeGreaterThan(0);
  });

  it('removes keydown event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();

    const keydownCalls = removeSpy.mock.calls.filter((call) => (call[0] as string) === 'keydown');
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

  // -----------------------------------------------------------------------
  // Two-key G sequences
  // -----------------------------------------------------------------------

  it('navigates to dashboard with G then D', () => {
    const onNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNavigate }));

    act(() => {
      fireKeyDown('g');
    });
    act(() => {
      fireKeyDown('d');
    });

    expect(onNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to transactions with G then T', () => {
    const onNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNavigate }));

    act(() => {
      fireKeyDown('g');
    });
    act(() => {
      fireKeyDown('t');
    });

    expect(onNavigate).toHaveBeenCalledWith('/transactions');
  });

  it('navigates to investments with G then I', () => {
    const onNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNavigate }));

    act(() => {
      fireKeyDown('g');
    });
    act(() => {
      fireKeyDown('i');
    });

    expect(onNavigate).toHaveBeenCalledWith('/investments');
  });

  it('navigates to budgets with G then B', () => {
    const onNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNavigate }));

    act(() => {
      fireKeyDown('g');
    });
    act(() => {
      fireKeyDown('b');
    });

    expect(onNavigate).toHaveBeenCalledWith('/budgets');
  });

  it('does not navigate if second key is unrecognised', () => {
    const onNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNavigate }));

    act(() => {
      fireKeyDown('g');
    });
    act(() => {
      fireKeyDown('z');
    });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Single key actions
  // -----------------------------------------------------------------------

  it('calls onNewTransaction when N is pressed', () => {
    const onNewTransaction = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewTransaction }));

    act(() => {
      fireKeyDown('n');
    });

    expect(onNewTransaction).toHaveBeenCalledTimes(1);
  });

  it('calls onFocusSearch when / is pressed without shift and no command palette is registered', () => {
    const onFocusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

    act(() => {
      fireKeyDown('/');
    });

    expect(onFocusSearch).toHaveBeenCalledTimes(1);
  });

  it('opens command palette when / is pressed and command palette is registered', () => {
    const onFocusSearch = vi.fn();
    const onOpenCommandPalette = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onFocusSearch, onOpenCommandPalette }));

    act(() => {
      fireKeyDown('/');
    });

    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
    expect(onFocusSearch).not.toHaveBeenCalled();
  });

  it('opens command palette with Ctrl+K', () => {
    const onOpenCommandPalette = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenCommandPalette }));

    act(() => {
      fireKeyDown('k', { ctrlKey: true });
    });

    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('opens command palette with Meta+K', () => {
    const onOpenCommandPalette = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenCommandPalette }));

    act(() => {
      fireKeyDown('k', { metaKey: true });
    });

    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('calls onListNavigate(1) when J is pressed', () => {
    const onListNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onListNavigate }));

    act(() => {
      fireKeyDown('j');
    });

    expect(onListNavigate).toHaveBeenCalledWith(1);
  });

  it('calls onListNavigate(-1) when K is pressed', () => {
    const onListNavigate = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onListNavigate }));

    act(() => {
      fireKeyDown('k');
    });

    expect(onListNavigate).toHaveBeenCalledWith(-1);
  });

  it('does not call onNewTransaction when N is pressed in an input', () => {
    const onNewTransaction = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNewTransaction }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      fireKeyDown('n', {}, input);
    });

    expect(onNewTransaction).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('honors the preference to disable character-key shortcuts', () => {
    localStorage.setItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY, 'false');
    const onNewTransaction = vi.fn();
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useKeyboardShortcuts({ onNewTransaction, onNavigate }));

    expect(result.current.singleKeyShortcutsEnabled).toBe(false);

    act(() => {
      fireKeyDown('n');
      fireKeyDown('g');
      fireKeyDown('d');
      fireKeyDown('?');
    });

    expect(onNewTransaction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(result.current.showHelp).toBe(false);
  });

  it('keeps modified shortcuts available when character-key shortcuts are disabled', () => {
    localStorage.setItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY, 'false');
    const onOpenCommandPalette = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenCommandPalette }));

    act(() => {
      fireKeyDown('k', { ctrlKey: true });
    });

    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('updates when the single-key shortcuts preference changes in the current tab', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.singleKeyShortcutsEnabled).toBe(true);

    act(() => {
      setSingleKeyShortcutsPreference(false);
    });

    expect(result.current.singleKeyShortcutsEnabled).toBe(false);
  });
});
