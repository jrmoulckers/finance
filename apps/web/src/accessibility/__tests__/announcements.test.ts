// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, ensureLiveRegions } from '../aria';

let frames: FrameRequestCallback[];

function flushFrame(): void {
  const callbacks = frames.splice(0);
  callbacks.forEach((callback) => callback(0));
}

function region(politeness: 'polite' | 'assertive'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-announcer="${politeness}"]`);
  if (!element) throw new Error(`Missing ${politeness} announcer`);
  return element;
}

function removeRegions(): void {
  document.querySelectorAll('[data-announcer]').forEach((element) => element.remove());
}

beforeEach(() => {
  removeRegions();
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  removeRegions();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('canonical announcements', () => {
  it('creates one initially empty, atomic pair and writes only after a frame', () => {
    ensureLiveRegions();
    ensureLiveRegions();
    expect(document.querySelectorAll('[data-announcer]')).toHaveLength(2);
    for (const politeness of ['polite', 'assertive'] as const) {
      expect(region(politeness)).toBeEmptyDOMElement();
      expect(region(politeness)).toHaveAttribute('aria-live', politeness);
      expect(region(politeness)).toHaveAttribute('aria-atomic', 'true');
      expect(region(politeness)).not.toHaveAttribute('aria-label');
    }
    const polite = region('polite');
    announce('Saved');
    expect(polite).toBeEmptyDOMElement();
    flushFrame();
    expect(polite).toHaveTextContent('Saved');
    expect(region('polite')).toBe(polite);
  });

  it('delivers burst messages in separate clear/write cycles without losing repeats', () => {
    announce('Saved');
    announce('Saved');
    announce('Updated');
    const polite = region('polite');
    expect(frames).toHaveLength(1);
    flushFrame();
    expect(polite.textContent).toBe('Saved');

    vi.advanceTimersByTime(100);
    expect(polite).toBeEmptyDOMElement();
    flushFrame();
    expect(polite.textContent).toBe('Saved');

    vi.advanceTimersByTime(100);
    expect(polite).toBeEmptyDOMElement();
    flushFrame();
    expect(polite.textContent).toBe('Updated');
    vi.advanceTimersByTime(100);
    expect(polite.textContent).toBe('Updated');
  });

  it('delivers errors without waiting for the polite queue', () => {
    announce('Saved');
    announce('Updated');
    announce('Failed to save', 'assertive');
    flushFrame();
    expect(region('polite').textContent).toBe('Saved');
    expect(region('assertive').textContent).toBe('Failed to save');
  });

  it('never delivers stale queued content into a replacement region', () => {
    announce('Old message');
    announce('Old queued message');
    removeRegions();
    announce('New message');
    flushFrame();
    expect(region('polite').textContent).toBe('New message');
    vi.advanceTimersByTime(100);
    flushFrame();
    expect(region('polite').textContent).toBe('New message');
  });
});
