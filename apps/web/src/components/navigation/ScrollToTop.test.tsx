// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { ScrollToTop } from './ScrollToTop';

interface TestLocation {
  key: string;
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
}

const routerState = vi.hoisted(() => ({
  location: {
    key: 'k1',
    pathname: '/dashboard',
    search: '',
    hash: '',
    state: null,
  } as TestLocation,
  navigationType: 'PUSH' as 'PUSH' | 'POP' | 'REPLACE',
}));

vi.mock('react-router', () => ({
  useLocation: () => routerState.location,
  useNavigationType: () => routerState.navigationType,
}));

function makeLocation(key: string): TestLocation {
  return { key, pathname: '/dashboard', search: '', hash: '', state: null };
}

let scrollX = 0;
let scrollY = 0;
let rafCallbacks: FrameRequestCallback[] = [];

function setScroll(x: number, y: number): void {
  scrollX = x;
  scrollY = y;
}

function flushFrames(times = 60): void {
  let n = 0;
  while (rafCallbacks.length > 0 && n < times) {
    const cb = rafCallbacks.shift();
    cb?.(n);
    n += 1;
  }
}

function getScrollToSpy(): ReturnType<typeof vi.fn> {
  return window.scrollTo as unknown as ReturnType<typeof vi.fn>;
}

describe('ScrollToTop scroll restoration (#3151)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    rafCallbacks = [];
    setScroll(0, 0);
    routerState.location = makeLocation('k1');
    routerState.navigationType = 'PUSH';

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    vi.spyOn(window, 'scrollTo').mockImplementation(((x?: number | ScrollToOptions, y?: number) => {
      if (typeof x === 'number') {
        setScroll(x, y ?? 0);
      }
    }) as typeof window.scrollTo);

    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => scrollX });
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opts out of the browser native scroll restoration on mount', () => {
    if (!('scrollRestoration' in window.history)) {
      return;
    }
    window.history.scrollRestoration = 'auto';
    render(<ScrollToTop />);
    expect(window.history.scrollRestoration).toBe('manual');
  });

  it('scrolls to the top on fresh (PUSH) navigation', () => {
    routerState.navigationType = 'PUSH';
    render(<ScrollToTop />);
    expect(getScrollToSpy()).toHaveBeenCalledWith(0, 0);
    expect(window.scrollY).toBe(0);
  });

  it('scrolls to the top on a POP with no saved offset', () => {
    routerState.location = makeLocation('never-visited');
    routerState.navigationType = 'POP';
    render(<ScrollToTop />);
    flushFrames();
    expect(getScrollToSpy()).toHaveBeenCalledWith(0, 0);
  });

  it('restores the saved scroll offset on back (POP) navigation', () => {
    const scrollToSpy = getScrollToSpy();
    const { rerender } = render(<ScrollToTop />);

    // The visitor scrolls down on the dashboard (k1).
    setScroll(0, 1200);
    window.dispatchEvent(new Event('scroll'));
    flushFrames();

    // Forward navigation into a detail page (k2) resets to the top.
    routerState.location = makeLocation('k2');
    routerState.navigationType = 'PUSH';
    rerender(<ScrollToTop />);
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);

    scrollToSpy.mockClear();

    // Browser back to the dashboard (k1) restores the previous offset.
    routerState.location = makeLocation('k1');
    routerState.navigationType = 'POP';
    rerender(<ScrollToTop />);
    flushFrames();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 1200);
    expect(window.scrollY).toBe(1200);
  });

  it('keeps re-applying the offset until async content makes the page tall enough', () => {
    const scrollToSpy = getScrollToSpy();
    const { rerender } = render(<ScrollToTop />);

    // Save a deep offset for the dashboard (k1).
    setScroll(0, 2000);
    window.dispatchEvent(new Event('scroll'));
    flushFrames();

    routerState.location = makeLocation('k2');
    routerState.navigationType = 'PUSH';
    rerender(<ScrollToTop />);

    // Simulate a still-hydrating page: the document is too short to honour the
    // offset, so the browser clamps scrollTo to the current max scroll height.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    scrollToSpy.mockImplementation(((x?: number | ScrollToOptions, y?: number) => {
      if (typeof x !== 'number') {
        return;
      }
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setScroll(x, Math.min(y ?? 0, maxY));
    }) as typeof window.scrollTo);

    routerState.location = makeLocation('k1');
    routerState.navigationType = 'POP';
    rerender(<ScrollToTop />);

    // While the page is short the offset cannot be reached, so the restore keeps
    // retrying on subsequent frames instead of giving up at the top.
    flushFrames(3);
    expect(window.scrollY).toBe(0);
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Async content arrives and the document grows tall enough.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    });
    flushFrames();
    expect(window.scrollY).toBe(2000);
  });
});
