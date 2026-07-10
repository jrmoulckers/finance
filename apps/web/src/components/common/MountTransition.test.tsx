// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MountTransition } from './MountTransition';

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof requestAnimationFrame,
  );
  vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MountTransition', () => {
  it('renders children with a stage modifier class when visible', () => {
    render(
      <MountTransition isVisible reducedMotion>
        <p>Hello</p>
      </MountTransition>,
    );

    const child = screen.getByText('Hello');
    const wrapper = child.parentElement;
    expect(wrapper).toHaveClass('mount-transition');
    expect(wrapper).toHaveClass('mount-transition--entered');
  });

  it('renders nothing when hidden under reduced motion', () => {
    render(
      <MountTransition isVisible={false} reducedMotion>
        <p>Hidden</p>
      </MountTransition>,
    );

    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('exposes token-driven duration custom properties', () => {
    render(
      <MountTransition isVisible reducedMotion enterDuration={300} exitDuration={120}>
        <p>Timed</p>
      </MountTransition>,
    );

    const wrapper = screen.getByText('Timed').parentElement as HTMLElement;
    expect(wrapper.style.getPropertyValue('--mount-enter-duration')).toBe('300ms');
    expect(wrapper.style.getPropertyValue('--mount-exit-duration')).toBe('120ms');
  });
});
