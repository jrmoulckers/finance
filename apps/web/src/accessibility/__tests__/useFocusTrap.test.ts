// SPDX-License-Identifier: MIT

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef, type RefObject } from 'react';

import { useFocusTrap } from '../aria';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function addFocusableChildren(container: HTMLElement): {
  first: HTMLButtonElement;
  middle: HTMLInputElement;
  last: HTMLAnchorElement;
} {
  const first = document.createElement('button');
  first.textContent = 'First';
  container.appendChild(first);

  const middle = document.createElement('input');
  middle.type = 'text';
  container.appendChild(middle);

  const last = document.createElement('a');
  last.href = '#';
  last.textContent = 'Last';
  container.appendChild(last);

  return { first, middle, last };
}

function pressTab(element: HTMLElement, shift = false): void {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let container: HTMLDivElement;

beforeEach(() => {
  container = createContainer();
  vi.clearAllMocks();
});

afterEach(() => {
  if (container.parentNode) {
    document.body.removeChild(container);
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFocusTrap', () => {
  // -----------------------------------------------------------------------
  // Initial focus
  // -----------------------------------------------------------------------

  it('focuses the first focusable element when activated', () => {
    const { first } = addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    renderHook(() => useFocusTrap(ref, { active: true }));

    expect(document.activeElement).toBe(first);
  });

  it('focuses the initialFocusRef element when provided', () => {
    const { middle } = addFocusableChildren(container);
    const containerRef = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(containerRef, 'current', { value: container, writable: true });

    const initialFocusRef = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(initialFocusRef, 'current', { value: middle, writable: true });

    renderHook(() => useFocusTrap(containerRef, { active: true, initialFocusRef }));

    expect(document.activeElement).toBe(middle);
  });

  it('does not focus anything when active is false', () => {
    addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const previousFocus = document.activeElement;

    renderHook(() => useFocusTrap(ref, { active: false }));

    expect(document.activeElement).toBe(previousFocus);
  });

  // -----------------------------------------------------------------------
  // Tab cycling
  // -----------------------------------------------------------------------

  it('wraps focus from last to first on Tab', () => {
    const { first, last } = addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    renderHook(() => useFocusTrap(ref, { active: true }));

    // Manually focus the last element
    last.focus();
    expect(document.activeElement).toBe(last);

    // Press Tab — should wrap to first
    pressTab(container);

    expect(document.activeElement).toBe(first);
  });

  it('wraps focus from first to last on Shift+Tab', () => {
    const { first, last } = addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    renderHook(() => useFocusTrap(ref, { active: true }));

    // First should already be focused
    expect(document.activeElement).toBe(first);

    // Press Shift+Tab — should wrap to last
    pressTab(container, true);

    expect(document.activeElement).toBe(last);
  });

  it('prevents tab from leaving when container has no focusable children', () => {
    // Container with no focusable elements
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    renderHook(() => useFocusTrap(ref, { active: true }));

    // Should not throw when Tab is pressed with no focusable elements
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    container.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Focus restoration
  // -----------------------------------------------------------------------

  it('restores focus to previously focused element on deactivation', () => {
    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'Outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const { unmount } = renderHook(() => useFocusTrap(ref, { active: true, restoreFocus: true }));

    // Focus should now be inside the trap
    expect(container.contains(document.activeElement)).toBe(true);

    // Unmount should restore focus
    unmount();

    expect(document.activeElement).toBe(outsideButton);

    document.body.removeChild(outsideButton);
  });

  it('does not restore focus when restoreFocus is false', () => {
    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'Outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const { unmount } = renderHook(() =>
      useFocusTrap(ref, { active: true, restoreFocus: false }),
    );

    unmount();

    // Focus should NOT be restored to outsideButton
    expect(document.activeElement).not.toBe(outsideButton);

    document.body.removeChild(outsideButton);
  });

  // -----------------------------------------------------------------------
  // Ignores non-Tab keys
  // -----------------------------------------------------------------------

  it('does not interfere with non-Tab keystrokes', () => {
    addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    renderHook(() => useFocusTrap(ref, { active: true }));

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    container.dispatchEvent(event);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('removes keydown listener on unmount', () => {
    addFocusableChildren(container);
    const ref = createRef<HTMLElement>() as RefObject<HTMLElement>;
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const removeSpy = vi.spyOn(container, 'removeEventListener');

    const { unmount } = renderHook(() => useFocusTrap(ref, { active: true }));
    unmount();

    const keydownCalls = removeSpy.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydownCalls.length).toBeGreaterThan(0);
  });
});
