// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --------------------------------------------------------------------------
// Mock useReducedMotion so we can toggle it per-test without real matchMedia
// --------------------------------------------------------------------------
let mockReducedMotion = false;

vi.mock('../../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { ConfettiAnimation } from '../ConfettiAnimation';

// Provide a minimal HTMLCanvasElement.getContext stub for jsdom
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  mockReducedMotion = false;
  vi.restoreAllMocks();
});

describe('ConfettiAnimation', () => {
  it('renders a canvas element when motion is allowed', () => {
    mockReducedMotion = false;
    render(<ConfettiAnimation />);

    expect(screen.getByTestId('confetti-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti-static')).not.toBeInTheDocument();
  });

  it('renders static emoji fallback when prefers-reduced-motion is active', () => {
    mockReducedMotion = true;
    render(<ConfettiAnimation />);

    expect(screen.getByTestId('confetti-static')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti-canvas')).not.toBeInTheDocument();
    expect(screen.getByText('🎉')).toBeInTheDocument();
  });

  it('has an accessible label', () => {
    render(<ConfettiAnimation />);
    expect(screen.getByRole('img', { name: 'Celebration' })).toBeInTheDocument();
  });

  it('calls onComplete immediately in reduced-motion mode', () => {
    mockReducedMotion = true;
    const onComplete = vi.fn();
    render(<ConfettiAnimation onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete after the animation completes', async () => {
    mockReducedMotion = false;
    const onComplete = vi.fn();

    // Mock rAF to fast-forward through the animation loop
    let frameId = 0;
    const startTime = performance.now();
    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      frameId++;
      // Simulate timestamps progressing past the duration
      setTimeout(() => cb(startTime + frameId * 100), 0);
      return frameId;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    render(<ConfettiAnimation duration={200} onComplete={onComplete} />);

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });

    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  it('accepts a custom className', () => {
    render(<ConfettiAnimation className="my-confetti" />);
    const container = screen.getByRole('img', { name: 'Celebration' });
    expect(container.className).toContain('my-confetti');
  });
});
