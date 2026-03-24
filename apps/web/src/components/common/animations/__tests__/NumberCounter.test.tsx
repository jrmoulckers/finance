// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockReducedMotion = false;

vi.mock('../../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { NumberCounter } from '../NumberCounter';

afterEach(() => {
  mockReducedMotion = false;
  vi.restoreAllMocks();
});

describe('NumberCounter', () => {
  it('renders and shows the target value immediately in reduced-motion', () => {
    mockReducedMotion = true;
    render(<NumberCounter target={5000} />);

    const counter = screen.getByTestId('number-counter');
    expect(counter).toBeInTheDocument();
    expect(counter.textContent).toBe('5,000');
  });

  it('calls onComplete immediately in reduced-motion mode', () => {
    mockReducedMotion = true;
    const onComplete = vi.fn();
    render(<NumberCounter target={100} onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('starts from the "from" value when motion is allowed', () => {
    mockReducedMotion = false;
    render(<NumberCounter target={1000} from={0} />);

    const counter = screen.getByTestId('number-counter');
    // At the very start, should show the from value (0)
    expect(counter.textContent).toBe('0');
  });

  it('counts up to the target value when motion is allowed', async () => {
    mockReducedMotion = false;
    const onComplete = vi.fn();

    render(<NumberCounter target={100} from={0} duration={100} onComplete={onComplete} />);

    // Wait for the rAF-based animation to complete and final value to render
    await vi.waitFor(
      () => {
        const counter = screen.getByTestId('number-counter');
        expect(counter.textContent).toBe('100');
      },
      { timeout: 3000 },
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('uses a custom formatter', () => {
    mockReducedMotion = true;
    const formatter = (v: number) => `$${v.toFixed(2)}`;
    render(<NumberCounter target={42.5} formatter={formatter} />);

    expect(screen.getByTestId('number-counter').textContent).toBe('$42.50');
  });

  it('has the correct ARIA attributes', () => {
    mockReducedMotion = true;
    render(<NumberCounter target={250} aria-label="Net worth" />);

    const counter = screen.getByTestId('number-counter');
    expect(counter.getAttribute('role')).toBe('status');
    expect(counter.getAttribute('aria-label')).toBe('Net worth');
    expect(counter.getAttribute('aria-live')).toBe('polite');
  });

  it('does not apply animating class in reduced-motion mode', () => {
    mockReducedMotion = true;
    render(<NumberCounter target={100} />);

    const counter = screen.getByTestId('number-counter');
    expect(counter.className).not.toContain('number-counter--animating');
  });

  it('applies animating class when motion is allowed', () => {
    mockReducedMotion = false;
    render(<NumberCounter target={100} />);

    const counter = screen.getByTestId('number-counter');
    expect(counter.className).toContain('number-counter--animating');
  });
});
