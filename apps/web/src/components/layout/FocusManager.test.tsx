// SPDX-License-Identifier: MIT

import { render } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mockPathname = { value: '/' };

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname.value }),
}));

const mockMoveFocusTo = vi.fn();
const mockAnnounce = vi.fn();

vi.mock('../../accessibility/aria', () => ({
  moveFocusTo: (...args: unknown[]) => mockMoveFocusTo(...args),
  announce: (...args: unknown[]) => mockAnnounce(...args),
}));

import { FocusManager } from './FocusManager';

describe('FocusManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMoveFocusTo.mockClear();
    mockAnnounce.mockClear();
    mockPathname.value = '/';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders null (no DOM output)', () => {
    const { container } = render(<FocusManager />);

    expect(container.innerHTML).toBe('');
  });

  it('does not move focus on initial render', () => {
    render(<FocusManager />);

    vi.advanceTimersByTime(200);

    expect(mockMoveFocusTo).not.toHaveBeenCalled();
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('moves focus to the target element on route change', () => {
    const targetEl = document.createElement('main');
    targetEl.id = 'main-content';
    document.body.appendChild(targetEl);

    const { rerender } = render(<FocusManager />);

    // Simulate route change
    mockPathname.value = '/accounts';
    rerender(<FocusManager />);

    vi.advanceTimersByTime(200);

    expect(mockMoveFocusTo).toHaveBeenCalledTimes(1);
    expect(mockMoveFocusTo).toHaveBeenCalledWith(targetEl);

    document.body.removeChild(targetEl);
  });

  it('announces the page navigation', () => {
    const targetEl = document.createElement('main');
    targetEl.id = 'main-content';
    document.body.appendChild(targetEl);

    const { rerender } = render(<FocusManager />);

    mockPathname.value = '/budgets';
    rerender(<FocusManager />);

    vi.advanceTimersByTime(200);

    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining('Navigated to'));

    document.body.removeChild(targetEl);
  });

  it('uses resolveTitle to determine the announced title', () => {
    const targetEl = document.createElement('main');
    targetEl.id = 'main-content';
    document.body.appendChild(targetEl);

    const resolveTitle = vi.fn((pathname: string) => (pathname === '/goals' ? 'Goals' : undefined));

    const { rerender } = render(<FocusManager resolveTitle={resolveTitle} />);

    mockPathname.value = '/goals';
    rerender(<FocusManager resolveTitle={resolveTitle} />);

    vi.advanceTimersByTime(200);

    expect(resolveTitle).toHaveBeenCalledWith('/goals');
    expect(mockAnnounce).toHaveBeenCalledWith('Navigated to Goals');

    document.body.removeChild(targetEl);
  });

  it('uses a custom targetSelector when provided', () => {
    const customEl = document.createElement('div');
    customEl.id = 'custom-target';
    document.body.appendChild(customEl);

    const { rerender } = render(<FocusManager targetSelector="#custom-target" />);

    mockPathname.value = '/transactions';
    rerender(<FocusManager targetSelector="#custom-target" />);

    vi.advanceTimersByTime(200);

    expect(mockMoveFocusTo).toHaveBeenCalledWith(customEl);

    document.body.removeChild(customEl);
  });
});
