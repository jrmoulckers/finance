// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockReducedMotion = false;

vi.mock('../../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { SuccessCheckmark } from '../SuccessCheckmark';

afterEach(() => {
  mockReducedMotion = false;
  vi.restoreAllMocks();
});

describe('SuccessCheckmark', () => {
  it('renders an SVG with circle and check path', () => {
    render(<SuccessCheckmark />);

    const container = screen.getByTestId('success-checkmark');
    expect(container).toBeInTheDocument();

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    const circle = svg?.querySelector('circle');
    expect(circle).toBeInTheDocument();

    const path = svg?.querySelector('path');
    expect(path).toBeInTheDocument();
  });

  it('has an accessible label', () => {
    render(<SuccessCheckmark />);
    expect(screen.getByRole('img', { name: 'Success' })).toBeInTheDocument();
  });

  it('applies animation classes when motion is allowed', () => {
    mockReducedMotion = false;
    render(<SuccessCheckmark />);

    const container = screen.getByTestId('success-checkmark');
    expect(container.className).toContain('success-checkmark--animated');

    const circle = container.querySelector('circle');
    expect(circle?.classList.contains('success-checkmark__circle--static')).toBe(false);
  });

  it('applies static classes when reduced motion is active', () => {
    mockReducedMotion = true;
    render(<SuccessCheckmark />);

    const container = screen.getByTestId('success-checkmark');
    expect(container.className).not.toContain('success-checkmark--animated');

    const circle = container.querySelector('circle');
    expect(circle?.classList.contains('success-checkmark__circle--static')).toBe(true);

    const path = container.querySelector('path');
    expect(path?.classList.contains('success-checkmark__check--static')).toBe(true);
  });

  it('calls onComplete immediately in reduced-motion mode', () => {
    mockReducedMotion = true;
    const onComplete = vi.fn();
    render(<SuccessCheckmark onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete after animation duration when motion is allowed', async () => {
    mockReducedMotion = false;
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(<SuccessCheckmark onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1300);
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('accepts custom size and color', () => {
    render(<SuccessCheckmark size={80} color="red" />);

    const svg = screen.getByTestId('success-checkmark').querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('80');
    expect(svg?.getAttribute('height')).toBe('80');

    const circle = svg?.querySelector('circle');
    expect(circle?.getAttribute('stroke')).toBe('red');
  });
});
